import { randomUUID } from 'node:crypto'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL
} from 'drizzle-orm'
import type { z } from 'zod'
import { NEEDS_REVIEW_THRESHOLD } from '../shared/categories'
import { todayISO } from '../shared/dates'
import { AiMemoryProvider, Categoriser, ruleMatchesDescription } from '../shared/domain/categorise'
import { directionFor, kindMap } from '../shared/domain/cashflow'
import type {
  accountCreateSchema,
  accountUpdateSchema,
  commitmentUpdateSchema,
  goalInputSchema,
  goalUpdateSchema,
  ruleCreateSchema,
  transactionUpdateSchema
} from '../shared/ipc'
import type {
  Account,
  AccountWithStats,
  Category,
  ImportSourceWithAccount,
  MerchantRule,
  Payslip,
  PayslipLine,
  RecurringCommitment,
  SavingsGoal,
  Transaction,
  TransactionFilter,
  TransactionView,
  UserFinancialSettings
} from '../shared/types'
import type { Db } from './db/client'
import * as s from './db/schema'

const now = (): string => new Date().toISOString()

export class NotFoundError extends Error {}

// ---------- Settings ----------

export function getSettings(db: Db): UserFinancialSettings {
  const row = db.select().from(s.userSettings).where(eq(s.userSettings.id, 1)).get()
  if (!row) throw new Error('Settings row missing')
  const { id: _id, ...rest } = row
  return rest
}

export function updateSettings(
  db: Db,
  patch: Partial<UserFinancialSettings>
): UserFinancialSettings {
  if (Object.keys(patch).length > 0) {
    db.update(s.userSettings).set(patch).where(eq(s.userSettings.id, 1)).run()
  }
  return getSettings(db)
}

// ---------- Categories ----------

export function listCategories(db: Db): Category[] {
  return db.select().from(s.categories).orderBy(asc(s.categories.sortOrder)).all()
}

// ---------- Accounts ----------

export function listAccounts(db: Db): AccountWithStats[] {
  const rows = db
    .select({
      account: s.accounts,
      transactionCount: sql<number>`count(${s.transactions.id})`,
      firstDate: sql<string | null>`min(${s.transactions.transactionDate})`,
      lastDate: sql<string | null>`max(${s.transactions.transactionDate})`
    })
    .from(s.accounts)
    .leftJoin(s.transactions, eq(s.transactions.accountId, s.accounts.id))
    .groupBy(s.accounts.id)
    .orderBy(asc(s.accounts.createdAt))
    .all()
  return rows.map((r) => ({
    ...r.account,
    transactionCount: r.transactionCount,
    firstDate: r.firstDate,
    lastDate: r.lastDate
  }))
}

export function getAccount(db: Db, id: string): Account {
  const row = db.select().from(s.accounts).where(eq(s.accounts.id, id)).get()
  if (!row) throw new NotFoundError('Account not found')
  return row
}

export function createAccount(
  db: Db,
  input: z.infer<typeof accountCreateSchema>,
  currency: string
): Account {
  const ts = now()
  const account: Account = {
    id: randomUUID(),
    name: input.name,
    type: input.type,
    currency,
    currentBalanceMinor: input.currentBalanceMinor,
    balanceAsOf: input.currentBalanceMinor != null ? todayISO() : null,
    balanceSource: input.currentBalanceMinor != null ? 'manual' : null,
    createdAt: ts,
    updatedAt: ts
  }
  db.insert(s.accounts).values(account).run()
  return account
}

export function updateAccount(db: Db, input: z.infer<typeof accountUpdateSchema>): Account {
  const { id, ...patch } = input
  const balancePatch =
    patch.currentBalanceMinor !== undefined
      ? {
          currentBalanceMinor: patch.currentBalanceMinor,
          balanceAsOf: patch.currentBalanceMinor != null ? todayISO() : null,
          balanceSource: patch.currentBalanceMinor != null ? ('manual' as const) : null
        }
      : {}
  db.update(s.accounts)
    .set({ ...patch, ...balancePatch, updatedAt: now() })
    .where(eq(s.accounts.id, id))
    .run()
  return getAccount(db, id)
}

// ---------- Import sources ----------

export function listImportSources(db: Db): ImportSourceWithAccount[] {
  const rows = db
    .select({
      source: s.importSources,
      accountName: s.accounts.name,
      transactionCount: sql<number>`(select count(*) from ${s.transactions} where ${s.transactions.importSourceId} = ${s.importSources.id})`,
      containedCount: sql<number>`(select count(*) from transaction_sources ts where ts.import_source_id = ${s.importSources.id})`,
      onlyHereCount: sql<number>`(select count(*) from transaction_sources ts where ts.import_source_id = ${s.importSources.id}
        and not exists (select 1 from transaction_sources t2 where t2.transaction_id = ts.transaction_id and t2.import_source_id != ts.import_source_id))`
    })
    .from(s.importSources)
    .innerJoin(s.accounts, eq(s.accounts.id, s.importSources.accountId))
    .orderBy(desc(s.importSources.importedAt))
    .all()
  return rows.map((r) => ({
    ...r.source,
    accountName: r.accountName,
    transactionCount: r.transactionCount,
    containedCount: r.containedCount,
    onlyHereCount: r.onlyHereCount
  }))
}

/**
 * Removes a statement. Rows that another statement also contains (overlapping months) stay and
 * are re-homed to that statement; only rows unique to this one are deleted.
 */
export function deleteImportSource(db: Db, id: string): number {
  return db.transaction((tx) => {
    tx.delete(s.transactionSources).where(eq(s.transactionSources.importSourceId, id)).run()
    // Re-home rows this statement imported that another statement also covers.
    tx.run(sql`update transactions set import_source_id = (
        select ts.import_source_id from transaction_sources ts
        where ts.transaction_id = transactions.id limit 1)
      where import_source_id = ${id}
        and exists (select 1 from transaction_sources ts where ts.transaction_id = transactions.id)`)
    const count = tx
      .delete(s.transactions)
      .where(eq(s.transactions.importSourceId, id))
      .run().changes
    tx.delete(s.importSources).where(eq(s.importSources.id, id)).run()
    // Remove sample accounts left without data so "Use sample data" can be reloaded cleanly.
    tx.run(sql`delete from accounts where id not in (select account_id from transactions)
      and id not in (select account_id from import_sources) and current_balance_minor is null`)
    return count
  })
}

// ---------- Transactions ----------

export function allTransactions(db: Db): Transaction[] {
  return db.select().from(s.transactions).orderBy(asc(s.transactions.transactionDate)).all()
}

export function listTransactions(db: Db, filter: TransactionFilter): TransactionView[] {
  const where: SQL[] = []
  if (filter.from) where.push(gte(s.transactions.transactionDate, filter.from))
  if (filter.to) where.push(lte(s.transactions.transactionDate, filter.to))
  if (filter.accountId) where.push(eq(s.transactions.accountId, filter.accountId))
  if (filter.categoryId) where.push(eq(s.transactions.categoryId, filter.categoryId))
  if (filter.direction) where.push(eq(s.transactions.direction, filter.direction))
  if (filter.needsReview) {
    where.push(lt(s.transactions.categoryConfidence, NEEDS_REVIEW_THRESHOLD))
    where.push(ne(s.transactions.direction, 'transfer'))
  }
  if (filter.search?.trim()) {
    const term = `%${filter.search.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`
    where.push(
      or(
        sql`${s.transactions.descriptionOriginal} like ${term} escape '\\'`,
        sql`${s.transactions.merchantNormalised} like ${term} escape '\\'`,
        like(s.transactions.notes, term)
      )!
    )
  }
  const rows = db
    .select({ t: s.transactions, accountName: s.accounts.name, accountType: s.accounts.type })
    .from(s.transactions)
    .innerJoin(s.accounts, eq(s.accounts.id, s.transactions.accountId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(s.transactions.transactionDate), desc(s.transactions.createdAt))
    .limit(filter.limit ?? 5000)
    .all()
  return rows.map((r) => ({
    ...r.t,
    accountName: r.accountName,
    accountType: r.accountType,
    needsReview: r.t.direction !== 'transfer' && r.t.categoryConfidence < NEEDS_REVIEW_THRESHOLD
  }))
}

function getTransaction(db: Db, id: string): Transaction {
  const row = db.select().from(s.transactions).where(eq(s.transactions.id, id)).get()
  if (!row) throw new NotFoundError('Transaction not found')
  return row
}

export function updateTransaction(db: Db, input: z.infer<typeof transactionUpdateSchema>): void {
  const t = getTransaction(db, input.id)
  const kinds = kindMap(listCategories(db))
  const patch: Partial<Transaction> = {}
  if (input.merchantNormalised !== undefined) patch.merchantNormalised = input.merchantNormalised
  if (input.notes !== undefined) patch.notes = input.notes

  if (input.isTransfer === true) {
    Object.assign(patch, {
      isTransfer: true,
      categoryId: 'transfers',
      direction: 'transfer',
      categoryConfidence: 1,
      categorySource: 'manual'
    })
  } else if (input.isTransfer === false && t.isTransfer) {
    const result = newCategoriser(db).categorise({
      description: t.descriptionOriginal,
      amountMinor: t.amountMinor
    })
    const categoryId =
      result.categoryId === 'transfers'
        ? t.amountMinor > 0
          ? 'income'
          : 'other'
        : result.categoryId
    Object.assign(patch, {
      isTransfer: false,
      categoryId,
      categoryConfidence: result.categoryId === 'transfers' ? 0.2 : result.confidence,
      categorySource: result.source,
      direction: directionFor(kinds.get(categoryId), false, t.amountMinor)
    })
  }
  if (input.categoryId !== undefined) {
    const kind = kinds.get(input.categoryId)
    if (!kind) throw new NotFoundError('Category not found')
    Object.assign(patch, {
      categoryId: input.categoryId,
      categoryConfidence: 1,
      categorySource: 'manual',
      isTransfer: kind === 'transfer',
      direction: directionFor(kind, kind === 'transfer', t.amountMinor)
    })
  }
  if (Object.keys(patch).length)
    db.update(s.transactions).set(patch).where(eq(s.transactions.id, input.id)).run()
}

export function bulkUpdateCategory(db: Db, ids: string[], categoryId: string): number {
  const kind = kindMap(listCategories(db)).get(categoryId)
  if (!kind) throw new NotFoundError('Category not found')
  return db.transaction((tx) => {
    let updated = 0
    const rows = tx.select().from(s.transactions).where(inArray(s.transactions.id, ids)).all()
    for (const t of rows) {
      updated += tx
        .update(s.transactions)
        .set({
          categoryId,
          categoryConfidence: 1,
          categorySource: 'manual',
          isTransfer: kind === 'transfer',
          direction: directionFor(kind, kind === 'transfer', t.amountMinor)
        })
        .where(eq(s.transactions.id, t.id))
        .run().changes
    }
    return updated
  })
}

// ---------- Rules ----------

export function listRules(db: Db): MerchantRule[] {
  return db
    .select()
    .from(s.merchantRules)
    .orderBy(desc(s.merchantRules.priority), asc(s.merchantRules.createdAt))
    .all()
}

export function createRule(
  db: Db,
  input: z.infer<typeof ruleCreateSchema>
): { rule: MerchantRule; updatedCount: number } {
  const kinds = kindMap(listCategories(db))
  const kind = kinds.get(input.categoryId)
  if (!kind) throw new NotFoundError('Category not found')
  const rule: MerchantRule = {
    id: randomUUID(),
    matchType: input.matchType,
    matchValue: input.matchValue,
    merchantNormalised: input.merchantNormalised || null,
    categoryId: input.categoryId,
    priority: input.priority,
    createdAt: now()
  }
  return db.transaction((tx) => {
    tx.insert(s.merchantRules).values(rule).run()
    let updatedCount = 0
    if (input.applyToExisting) {
      for (const t of tx.select().from(s.transactions).all()) {
        if (
          !ruleMatchesDescription(rule, t.descriptionOriginal) &&
          !ruleMatchesDescription(rule, t.merchantNormalised)
        )
          continue
        updatedCount += tx
          .update(s.transactions)
          .set({
            categoryId: rule.categoryId,
            merchantNormalised: rule.merchantNormalised ?? t.merchantNormalised,
            categoryConfidence: 1,
            categorySource: 'user_rule',
            isTransfer: kind === 'transfer',
            direction: directionFor(kind, kind === 'transfer', t.amountMinor)
          })
          .where(eq(s.transactions.id, t.id))
          .run().changes
      }
    }
    return { rule, updatedCount }
  })
}

export function deleteRule(db: Db, id: string): void {
  db.delete(s.merchantRules).where(eq(s.merchantRules.id, id)).run()
}

// ---------- Commitments ----------

export function listCommitments(db: Db): RecurringCommitment[] {
  return db
    .select()
    .from(s.recurringCommitments)
    .orderBy(desc(s.recurringCommitments.typicalAmountMinor))
    .all()
}

export function updateCommitment(
  db: Db,
  input: z.infer<typeof commitmentUpdateSchema>
): RecurringCommitment {
  const { id, status, ...fields } = input
  const edited = Object.keys(fields).length > 0
  db.update(s.recurringCommitments)
    .set({
      ...fields,
      ...(status ? { status, userConfirmed: status === 'active' } : {}),
      ...(edited ? { userEdited: true, userConfirmed: true, status: status ?? 'active' } : {}),
      updatedAt: now()
    })
    .where(eq(s.recurringCommitments.id, id))
    .run()
  const row = db
    .select()
    .from(s.recurringCommitments)
    .where(eq(s.recurringCommitments.id, id))
    .get()
  if (!row) throw new NotFoundError('Commitment not found')
  return row
}

// ---------- Goals ----------

export function listGoals(db: Db): SavingsGoal[] {
  return db
    .select()
    .from(s.savingsGoals)
    .orderBy(asc(s.savingsGoals.priority), asc(s.savingsGoals.createdAt))
    .all()
}

export function createGoal(db: Db, input: z.infer<typeof goalInputSchema>): SavingsGoal {
  const ts = now()
  const goal: SavingsGoal = { id: randomUUID(), ...input, createdAt: ts, updatedAt: ts }
  db.insert(s.savingsGoals).values(goal).run()
  return goal
}

export function updateGoal(db: Db, input: z.infer<typeof goalUpdateSchema>): SavingsGoal {
  const { id, ...patch } = input
  db.update(s.savingsGoals)
    .set({ ...patch, updatedAt: now() })
    .where(eq(s.savingsGoals.id, id))
    .run()
  const row = db.select().from(s.savingsGoals).where(eq(s.savingsGoals.id, id)).get()
  if (!row) throw new NotFoundError('Goal not found')
  return row
}

export function deleteGoal(db: Db, id: string): void {
  db.delete(s.savingsGoals).where(eq(s.savingsGoals.id, id)).run()
}

// ---------- Insights ----------

export function dismissedInsightIds(db: Db): Set<string> {
  return new Set(
    db
      .select({ id: s.insights.id })
      .from(s.insights)
      .where(sql`${s.insights.dismissedAt} is not null`)
      .all()
      .map((r) => r.id)
  )
}

export function setInsightDone(db: Db, id: string, done: boolean): void {
  db.update(s.insights)
    .set({ completedAt: done ? now() : null })
    .where(eq(s.insights.id, id))
    .run()
}

export function completedInsightIds(db: Db): Set<string> {
  return new Set(
    db
      .select({ id: s.insights.id })
      .from(s.insights)
      .where(sql`${s.insights.completedAt} is not null`)
      .all()
      .map((r) => r.id)
  )
}

export function dismissInsight(db: Db, id: string): void {
  db.update(s.insights).set({ dismissedAt: now() }).where(eq(s.insights.id, id)).run()
}

// ---------- Clear imported data (keep settings) ----------

/**
 * Removes every statement and everything derived from it — transactions, accounts, recurring
 * commitments, insights, offers and the weekly briefing — but keeps settings, AI setup, goals and
 * merchant rules, so the user can re-import from scratch.
 */
export function clearImportedData(db: Db): void {
  db.transaction((tx) => {
    tx.delete(s.insights).run()
    tx.delete(s.recurringCommitments).run()
    tx.delete(s.transactions).run()
    tx.delete(s.importSources).run()
    tx.delete(s.accounts).run()
    tx.delete(s.offers).run()
    tx.delete(s.aiNotes).run()
    tx.delete(s.aiCategories).run()
    tx.delete(s.payslips).run()
  })
}

// ---------- Delete everything ----------

export function deleteAllData(db: Db): void {
  db.transaction((tx) => {
    tx.delete(s.insights).run()
    tx.delete(s.chatMessages).run()
    tx.delete(s.conversations).run()
    tx.delete(s.secrets).run()
    tx.delete(s.indmoneySnapshots).run()
    tx.delete(s.casImports).run()
    tx.delete(s.cfoProfile).run()
    tx.delete(s.dataSources).where(eq(s.dataSources.builtin, false)).run()
    tx.delete(s.offers).run()
    tx.delete(s.aiNotes).run()
    tx.delete(s.aiCategories).run()
    tx.delete(s.payslips).run()
    tx.delete(s.recurringCommitments).run()
    tx.delete(s.transactions).run()
    tx.delete(s.importSources).run()
    tx.delete(s.merchantRules).run()
    tx.delete(s.savingsGoals).run()
    tx.delete(s.accounts).run()
    tx.update(s.userSettings)
      .set({
        primaryCurrency: 'INR',
        nextIncomeDate: null,
        expectedIncomeMinor: null,
        emergencyBufferMinor: 0,
        monthlySavingsTargetMinor: null,
        planningStartDay: 1,
        recurringTolerancePct: 15,
        onboardingComplete: false,
        aiProvider: 'none',
        aiModel: null,
        cloudConsent: false,
        goalText: null
      })
      .where(eq(s.userSettings.id, 1))
      .run()
  })
}

// ---------- AI category memory ----------

export function loadAiMemory(db: Db): Map<string, string> {
  return new Map(
    db
      .select({ key: s.aiCategories.key, categoryId: s.aiCategories.categoryId })
      .from(s.aiCategories)
      .all()
      .map((r) => [r.key, r.categoryId])
  )
}

export function saveAiMemory(
  db: Db,
  entries: readonly { key: string; categoryId: string; merchant: string }[]
): void {
  const createdAt = new Date().toISOString()
  db.transaction((tx) => {
    for (const e of entries) {
      tx.insert(s.aiCategories)
        .values({ ...e, createdAt })
        .onConflictDoUpdate({
          target: s.aiCategories.key,
          set: { categoryId: e.categoryId, merchant: e.merchant, createdAt }
        })
        .run()
    }
  })
}

/** Rules first, then the keyword set, then what the AI learned about your merchants. */
export function newCategoriser(db: Db): Categoriser {
  return new Categoriser(listRules(db), [new AiMemoryProvider(loadAiMemory(db))])
}

/**
 * Re-runs rules + AI memory over everything the user hasn't set by hand, so improved rules
 * fix older imports too. Returns how many transactions changed category.
 */
export function reapplyCategories(db: Db): number {
  const categoriser = newCategoriser(db)
  const kinds = kindMap(listCategories(db))
  return db.transaction((tx) => {
    let changed = 0
    const rows = tx
      .select()
      .from(s.transactions)
      .where(notInArray(s.transactions.categorySource, ['manual', 'user_rule']))
      .all()
    for (const t of rows) {
      const r = categoriser.categorise({
        description: t.descriptionOriginal,
        amountMinor: t.amountMinor
      })
      // Keep an earlier AI answer over a weaker generic fallback.
      if (r.source === 'fallback' && t.categorySource === 'ai') continue
      if (r.categoryId === t.categoryId && r.source === t.categorySource) continue
      const kind = kinds.get(r.categoryId)
      const isTransfer = kind === 'transfer'
      tx.update(s.transactions)
        .set({
          categoryId: r.categoryId,
          categoryConfidence: r.confidence,
          categorySource: r.source,
          isTransfer,
          direction: directionFor(kind, isTransfer, t.amountMinor)
        })
        .where(eq(s.transactions.id, t.id))
        .run()
      changed++
    }
    return changed
  })
}

// ---------- Salary slips ----------

function toPayslip(r: typeof s.payslips.$inferSelect): Payslip {
  return {
    ...r,
    period: r.period,
    earnings: JSON.parse(r.earnings) as PayslipLine[],
    deductions: JSON.parse(r.deductions) as PayslipLine[]
  }
}

export function listPayslips(db: Db): Payslip[] {
  return db
    .select()
    .from(s.payslips)
    .orderBy(desc(s.payslips.period), desc(s.payslips.createdAt))
    .all()
    .map(toPayslip)
}

/** Saves a parsed payslip; the same file (or same pay month + net) is not saved twice. */
export function savePayslip(
  db: Db,
  p: Omit<Payslip, 'id' | 'createdAt'>
): { payslip: Payslip; duplicate: boolean } {
  const existing = db
    .select()
    .from(s.payslips)
    .all()
    .find(
      (r) =>
        r.fileHash === p.fileHash ||
        (p.period && r.period === p.period && r.netMinor === p.netMinor)
    )
  if (existing) return { payslip: toPayslip(existing), duplicate: true }
  const row = {
    ...p,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    earnings: JSON.stringify(p.earnings),
    deductions: JSON.stringify(p.deductions)
  }
  db.insert(s.payslips).values(row).run()
  return { payslip: toPayslip(row), duplicate: false }
}

export function deletePayslip(db: Db, id: string): void {
  db.delete(s.payslips).where(eq(s.payslips.id, id)).run()
}
