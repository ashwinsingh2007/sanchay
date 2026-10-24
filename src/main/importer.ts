import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { NEEDS_REVIEW_THRESHOLD } from '../shared/categories'
import { todayISO, toMonthKey } from '../shared/dates'
import { directionFor, kindMap } from '../shared/domain/cashflow'
import { normaliseRows, suggestMapping, validateMapping } from '../shared/domain/csvNormalise'
import { matchDuplicates } from '../shared/domain/dedupe'
import { descriptionKey } from '../shared/domain/merchant'
import { currencyInfo } from '../shared/money'
import { generateSampleStatements } from '../shared/sampleData'
import type { importCommitSchema } from '../shared/ipc'
import type { Account, ImportSummary, QuickImportResult, Transaction } from '../shared/types'
import { parseCsvText } from './csv'
import type { Db } from './db/client'
import * as s from './db/schema'
import { refreshCommitments } from './analysis'
import { analyzeImport, cleanupDuplicates, existingRows } from './duplicates'
import { autoMapStatement } from '../shared/domain/autoMap'
import { aiMapColumns } from './ai/mapColumns'
import { listAccounts } from './repository'
import {
  createAccount,
  getAccount,
  getSettings,
  listCategories,
  newCategoriser
} from './repository'

type CommitInput = z.infer<typeof importCommitSchema>

export function commitImport(db: Db, input: CommitInput): ImportSummary {
  const mappingErrors = validateMapping(input.mapping)
  if (mappingErrors.length) throw new Error(mappingErrors.join(' '))

  const settings = getSettings(db)
  // If the user didn't pick an account, route the statement to the account it clearly belongs to
  // (same file imported before, or most of its rows already there) instead of creating a twin.
  let autoMatchedAccount = false
  let accountId = input.account.existingAccountId
  if (!accountId) {
    const analysis = analyzeImport(db, input)
    if (analysis.suggestedAccountId) {
      accountId = analysis.suggestedAccountId
      autoMatchedAccount = true
    }
  }
  let account: Account | null = accountId ? getAccount(db, accountId) : null
  const currency = account?.currency ?? settings.primaryCurrency
  const { rows, invalidCount } = normaliseRows(
    input.rows,
    input.mapping,
    currencyInfo(currency).decimals
  )
  if (rows.length === 0) {
    throw new Error('No valid transactions were found. Check the column mapping and date format.')
  }

  const kinds = kindMap(listCategories(db))
  const categoriser = newCategoriser(db)
  const dates = rows.map((r) => r.date).sort()
  const dateRangeStart = dates[0]!
  const dateRangeEnd = dates[dates.length - 1]!

  return db.transaction((tx) => {
    if (!account) {
      account = createAccount(
        tx as unknown as Db,
        { name: input.account.name, type: input.account.type, currentBalanceMinor: null },
        currency
      )
    }
    const accountId = (account as Account).id

    const matched = matchDuplicates(
      rows.map((r) => ({ ...r, accountId })),
      existingRows(tx as unknown as Db, accountId, dateRangeStart, dateRangeEnd)
    )
    const fresh = matched.fresh
    const duplicates = matched.duplicates.map((d) => d.incoming)
    const overlapIds = matched.duplicates.map((d) => d.existing.id)

    let importSourceId: string | null = null
    let needsReviewCount = 0
    // A statement is recorded even when every row overlaps an earlier one, so it shows in the
    // statement history and keeps those months covered if the earlier statement is deleted.
    if (fresh.length > 0 || duplicates.length > 0) {
      importSourceId = randomUUID()
      const importedAt = new Date().toISOString()
      tx.insert(s.importSources)
        .values({
          id: importSourceId,
          accountId,
          filename: input.filename,
          importedAt,
          rowCount: rows.length + invalidCount,
          importedCount: fresh.length,
          duplicateCount: duplicates.length,
          sourceHash: input.fileHash,
          dateRangeStart,
          dateRangeEnd,
          isSample: input.isSample ?? false
        })
        .run()

      const records: Transaction[] = fresh.map((r) => {
        const result = categoriser.categorise({
          description: r.description,
          amountMinor: r.amountMinor
        })
        const kind = kinds.get(result.categoryId)
        const isTransfer = kind === 'transfer'
        const direction = directionFor(kind, isTransfer, r.amountMinor)
        if (!isTransfer && result.confidence < NEEDS_REVIEW_THRESHOLD) needsReviewCount++
        return {
          id: randomUUID(),
          accountId,
          importSourceId: importSourceId!,
          transactionDate: r.date,
          descriptionOriginal: r.description,
          descriptionKey: descriptionKey(r.description),
          merchantNormalised: result.merchantNormalised,
          amountMinor: r.amountMinor,
          currency,
          direction,
          categoryId: result.categoryId,
          categoryConfidence: result.confidence,
          categorySource: result.source,
          isRecurring: false,
          isTransfer,
          notes: null,
          createdAt: importedAt
        }
      })
      for (let i = 0; i < records.length; i += 500) {
        tx.insert(s.transactions)
          .values(records.slice(i, i + 500))
          .run()
      }
      // Link every row this statement contains: the new ones and the overlapping ones that
      // were already imported from another statement.
      const links = [...records.map((r) => r.id), ...overlapIds].map((transactionId) => ({
        transactionId,
        importSourceId: importSourceId!
      }))
      for (let i = 0; i < links.length; i += 500) {
        tx.insert(s.transactionSources)
          .values(links.slice(i, i + 500))
          .onConflictDoNothing()
          .run()
      }
    }

    // Use the statement's closing balance when the user hasn't entered a newer one manually.
    let balanceUpdated = false
    if (
      input.mapping.balanceColumn != null &&
      (account.type === 'bank' || account.type === 'cash')
    ) {
      const withBalance = rows.filter((r) => r.balanceMinor != null)
      if (withBalance.length > 0) {
        const ascending = withBalance[0]!.date <= withBalance[withBalance.length - 1]!.date
        const latestDate = withBalance.reduce(
          (max, r) => (r.date > max ? r.date : max),
          withBalance[0]!.date
        )
        const onLatest = withBalance.filter((r) => r.date === latestDate)
        const closing = ascending ? onLatest[onLatest.length - 1]! : onLatest[0]!
        const newer = !account.balanceAsOf || latestDate >= account.balanceAsOf
        if (account.balanceSource !== 'manual' || newer) {
          tx.update(s.accounts)
            .set({
              currentBalanceMinor: closing.balanceMinor,
              balanceAsOf: latestDate,
              balanceSource: 'statement',
              updatedAt: new Date().toISOString()
            })
            .where(eq(s.accounts.id, accountId))
            .run()
          balanceUpdated = true
        }
      }
    }

    return {
      importSourceId,
      accountId,
      accountName: account.name,
      totalRows: rows.length + invalidCount,
      importedCount: fresh.length,
      duplicateCount: duplicates.length,
      invalidCount,
      needsReviewCount,
      dateRangeStart,
      dateRangeEnd,
      latestMonth: toMonthKey(dateRangeEnd),
      balanceUpdated,
      autoMatchedAccount,
      cleanedUp: 0
    }
  })
}

/** Import, then run the self-healing duplicate clean-up across all imports. */
export function importStatement(db: Db, input: CommitInput): ImportSummary {
  const summary = commitImport(db, input)
  const cleanedUp = cleanupDuplicates(db)
  return { ...summary, cleanedUp }
}

/** Imports both sample statements through the same pipeline as a real CSV. */
export function loadSampleData(db: Db): ImportSummary[] {
  const already = db
    .select({ id: s.importSources.id })
    .from(s.importSources)
    .where(eq(s.importSources.isSample, true))
    .get()
  if (already)
    throw new Error('Sample data is already loaded. Delete it in Settings → Data to reload it.')

  const today = todayISO()
  const summaries: ImportSummary[] = []
  for (const statement of generateSampleStatements(today)) {
    const parsed = parseCsvText(statement.filename, statement.csv)
    const mapping = {
      ...suggestMapping(parsed.rows, parsed.suggestedHeaderRow),
      positiveMeans: statement.positiveMeans
    }
    summaries.push(
      commitImport(db, {
        filename: statement.filename,
        fileHash: parsed.fileHash,
        rows: parsed.rows,
        mapping,
        account: {
          existingAccountId: null,
          name: statement.accountName,
          type: statement.accountType
        },
        isSample: true
      })
    )
  }

  refreshCommitments(db)
  return summaries
}

/**
 * One-step import: work out the columns, sign and account automatically, skip duplicates, and
 * import. Falls back to the on-device AI, then to manual review, only when the file can't be read
 * confidently.
 */
export async function quickImport(
  db: Db,
  input: { filename: string; fileHash: string; rows: string[][] }
): Promise<QuickImportResult> {
  const decimals = currencyInfo(getSettings(db).primaryCurrency).decimals
  const auto = autoMapStatement(input.rows, input.filename, decimals)
  let mapping = auto.mapping
  let mappedBy: 'auto' | 'ai' = 'auto'
  if (!auto.confident) {
    const ai = await aiMapColumns(db, input.rows, decimals)
    if (!ai) {
      return {
        status: 'needs_review',
        mapping,
        reasons: auto.reasons,
        accountType: auto.accountType,
        accountName: auto.accountName
      }
    }
    mapping = ai
    mappedBy = 'ai'
  }

  const account = { existingAccountId: null, name: auto.accountName, type: auto.accountType }
  const analysis = analyzeImport(db, { ...input, mapping, account })
  // Avoid two accounts with the same name when this is genuinely a new account.
  let name = auto.accountName
  if (!analysis.suggestedAccountId) {
    const taken = new Set(listAccounts(db).map((a) => a.name.toLowerCase()))
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${auto.accountName} ${i}`
  }
  const summary = importStatement(db, {
    ...input,
    mapping,
    account: { existingAccountId: analysis.suggestedAccountId, name, type: auto.accountType }
  })
  return { status: 'imported', summary, mapping, mappedBy }
}
