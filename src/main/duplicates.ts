import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { addDays } from '../shared/dates'
import { normaliseRows, validateMapping, type NormalisedRow } from '../shared/domain/csvNormalise'
import { matchDuplicates } from '../shared/domain/dedupe'
import type { importCommitSchema } from '../shared/ipc'
import { currencyInfo } from '../shared/money'
import type { ImportAnalysis } from '../shared/types'
import type { Db } from './db/client'
import * as s from './db/schema'
import { getSettings } from './repository'

type ImportInput = z.infer<typeof importCommitSchema>

/** A statement counts as "this account's" when most of its rows already exist there. */
const ACCOUNT_MATCH_RATIO = 0.5
/** An import whose rows almost all exist elsewhere is a repeat import and is removed. */
const REPEAT_IMPORT_RATIO = 0.9

export function existingRows(db: Db, accountId: string, start: string, end: string) {
  return db
    .select({
      id: s.transactions.id,
      date: s.transactions.transactionDate,
      description: s.transactions.descriptionOriginal,
      amountMinor: s.transactions.amountMinor
    })
    .from(s.transactions)
    .where(
      and(
        eq(s.transactions.accountId, accountId),
        gte(s.transactions.transactionDate, addDays(start, -1)),
        lte(s.transactions.transactionDate, addDays(end, 1))
      )
    )
    .all()
}

function toCandidates(rows: NormalisedRow[]) {
  return rows.map((r) => ({ date: r.date, description: r.description, amountMinor: r.amountMinor }))
}

/**
 * Looks at a statement before it is imported: was this exact file imported already, which
 * existing account does it belong to, and how many rows are genuinely new?
 */
export function analyzeImport(db: Db, input: ImportInput): ImportAnalysis {
  const empty: ImportAnalysis = {
    totalRows: 0,
    newRows: 0,
    duplicateRows: 0,
    sameFile: null,
    suggestedAccountId: null,
    suggestedAccountName: null
  }
  if (validateMapping(input.mapping).length) return empty
  const settings = getSettings(db)
  const { rows } = normaliseRows(
    input.rows,
    input.mapping,
    currencyInfo(settings.primaryCurrency).decimals
  )
  if (rows.length === 0) return empty

  const dates = rows.map((r) => r.date).sort()
  const start = dates[0]!
  const end = dates[dates.length - 1]!
  const incoming = toCandidates(rows)

  const sameFileRow = db
    .select({
      importedAt: s.importSources.importedAt,
      accountId: s.importSources.accountId,
      accountName: s.accounts.name
    })
    .from(s.importSources)
    .innerJoin(s.accounts, eq(s.accounts.id, s.importSources.accountId))
    .where(eq(s.importSources.sourceHash, input.fileHash))
    .get()

  // Score every account by how many of the incoming rows it already contains.
  let best: { id: string; name: string; dupes: number } | null = null
  for (const acc of db
    .select({ id: s.accounts.id, name: s.accounts.name })
    .from(s.accounts)
    .all()) {
    const { duplicates } = matchDuplicates(incoming, existingRows(db, acc.id, start, end))
    if (!best || duplicates.length > best.dupes)
      best = { id: acc.id, name: acc.name, dupes: duplicates.length }
  }

  const chosenId = input.account.existingAccountId
  let target: { id: string; name: string } | null = null
  if (sameFileRow) target = { id: sameFileRow.accountId, name: sameFileRow.accountName }
  else if (best && best.dupes >= Math.max(1, rows.length * ACCOUNT_MATCH_RATIO)) target = best

  const compareId = chosenId ?? target?.id ?? null
  const duplicateRows = compareId
    ? matchDuplicates(incoming, existingRows(db, compareId, start, end)).duplicates.length
    : 0

  return {
    totalRows: rows.length,
    newRows: rows.length - duplicateRows,
    duplicateRows,
    sameFile: sameFileRow
      ? { importedAt: sameFileRow.importedAt, accountName: sameFileRow.accountName }
      : null,
    suggestedAccountId: target?.id ?? null,
    suggestedAccountName: target?.name ?? null
  }
}

/**
 * Self-healing pass run after every import. For each import (newest first) it checks whether its
 * transactions already exist from an earlier import:
 *  - if ~all of them do (the same statement imported again, even into another account), the
 *    repeated rows are removed;
 *  - otherwise only rows duplicated within the same account are removed (overlapping statements).
 * Accounts left with no transactions are removed too. Returns the number of rows removed.
 */
export function cleanupDuplicates(db: Db): number {
  const sources = db
    .select({ id: s.importSources.id, accountId: s.importSources.accountId })
    .from(s.importSources)
    .orderBy(sql`${s.importSources.importedAt} desc`)
    .all()
  let removed = 0

  db.transaction((tx) => {
    for (const source of sources) {
      const mine = tx
        .select({
          id: s.transactions.id,
          accountId: s.transactions.accountId,
          date: s.transactions.transactionDate,
          description: s.transactions.descriptionOriginal,
          amountMinor: s.transactions.amountMinor
        })
        .from(s.transactions)
        .where(eq(s.transactions.importSourceId, source.id))
        .all()
      if (mine.length === 0) continue
      const dates = mine.map((t) => t.date).sort()
      const others = tx
        .select({
          id: s.transactions.id,
          accountId: s.transactions.accountId,
          date: s.transactions.transactionDate,
          description: s.transactions.descriptionOriginal,
          amountMinor: s.transactions.amountMinor
        })
        .from(s.transactions)
        .where(
          and(
            sql`(${s.transactions.importSourceId} is null or ${s.transactions.importSourceId} != ${source.id})`,
            gte(s.transactions.transactionDate, addDays(dates[0]!, -1)),
            lte(s.transactions.transactionDate, addDays(dates[dates.length - 1]!, 1))
          )
        )
        .all()

      const all = matchDuplicates(mine, others).duplicates
      const repeatImport = all.length >= mine.length * REPEAT_IMPORT_RATIO
      const pairs = repeatImport
        ? all
        : matchDuplicates(
            mine,
            others.filter((o) => o.accountId === source.accountId)
          ).duplicates
      const toRemove = pairs.map((d) => d.incoming.id)
      // The surviving copy now also belongs to this statement, so deleting either statement
      // later keeps the row as long as the other one remains.
      for (const d of pairs) {
        tx.run(sql`insert or ignore into transaction_sources (transaction_id, import_source_id)
          select ${d.existing.id}, import_source_id from transaction_sources
          where transaction_id = ${d.incoming.id}`)
      }

      for (let i = 0; i < toRemove.length; i += 500) {
        removed += tx
          .delete(s.transactions)
          .where(inArray(s.transactions.id, toRemove.slice(i, i + 500)))
          .run().changes
      }
    }
    tx.run(
      sql`delete from import_sources where id not in (select distinct import_source_id from transactions where import_source_id is not null)
        and id not in (select distinct import_source_id from transaction_sources)`
    )
    tx.run(
      sql`delete from accounts where id not in (select account_id from transactions) and id not in (select account_id from import_sources) and (balance_source is null or balance_source = 'statement')`
    )
  })
  return removed
}
