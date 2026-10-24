import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { addMonthsClamped, todayISO } from '../shared/dates'
import { CADENCE_MONTHS, detectRecurring } from '../shared/domain/recurring'
import { inferNextIncomeDate } from '../shared/domain/safeToSpend'
import { buildMonthlyCloseReport, defaultMonth, listMonths } from '../shared/domain/report'
import { computePotentialSavings } from '../shared/domain/savings'
import { projectFi } from '../shared/domain/fi'
import { kindMap } from '../shared/domain/cashflow'
import { buildMoneyFlow } from '../shared/domain/moneyFlow'
import { adviseCards } from '../shared/domain/payAdvisor'
import { buildInvestmentReport } from '../shared/domain/investments'
import { buildSalaryProfile } from '../shared/domain/payslip'
import { loadAiSuggestions } from './ai/suggest'
import type {
  FiProjection,
  MonthInfo,
  MonthlyCloseReport,
  InvestmentReport,
  MoneyFlow,
  SalaryProfile,
  PaymentAdvice,
  RecurringCommitment,
  SavingsReport
} from '../shared/types'
import type { Db } from './db/client'
import * as s from './db/schema'
import {
  allTransactions,
  completedInsightIds,
  dismissedInsightIds,
  getSettings,
  listAccounts,
  listCategories,
  listCommitments,
  listGoals,
  listPayslips,
  updateSettings
} from './repository'
import { indmoneyNetWorthMinor } from './indmoney'

/**
 * Re-runs deterministic recurring detection over all transactions and merges the result with
 * stored commitments, preserving anything the user confirmed, edited or ignored.
 */
export function refreshCommitments(db: Db): RecurringCommitment[] {
  const settings = getSettings(db)
  const txs = allTransactions(db)
  const today = todayISO()
  if (!settings.nextIncomeDate) {
    const inferred = inferNextIncomeDate(txs, today)
    if (inferred) updateSettings(db, { nextIncomeDate: inferred })
  }
  const dataEndDate = txs.reduce(
    (max, t) => (t.transactionDate > max ? t.transactionDate : max),
    '0000-00-00'
  )

  const detected = detectRecurring(
    txs.map((t) => ({
      id: t.id,
      date: t.transactionDate,
      merchant: t.merchantNormalised,
      amountMinor: t.amountMinor,
      categoryId: t.categoryId,
      isTransfer: t.isTransfer || t.direction === 'transfer' || t.direction === 'income'
    })),
    { amountTolerance: settings.recurringTolerancePct / 100, referenceDate: today, dataEndDate }
  )

  const existing = new Map(listCommitments(db).map((c) => [c.merchantKey, c]))
  const ts = new Date().toISOString()

  db.transaction((tx) => {
    const seen = new Set<string>()
    for (const d of detected) {
      seen.add(d.merchantKey)
      const prev = existing.get(d.merchantKey)
      if (!prev) {
        tx.insert(s.recurringCommitments)
          .values({
            id: randomUUID(),
            merchantKey: d.merchantKey,
            merchantName: d.merchantName,
            categoryId: d.categoryId,
            typicalAmountMinor: d.typicalAmountMinor,
            cadence: d.cadence,
            nextExpectedDate: d.nextExpectedDate,
            lastSeenDate: d.lastSeenDate,
            confidence: d.confidence,
            status: d.suggestedStatus,
            userConfirmed: false,
            userEdited: false,
            linkedTransactionIds: d.transactionIds,
            createdAt: ts,
            updatedAt: ts
          })
          .run()
        continue
      }
      const keepUserFields = prev.userEdited
      const keepStatus = prev.userConfirmed || prev.status === 'ignored'
      tx.update(s.recurringCommitments)
        .set({
          ...(keepUserFields
            ? {}
            : {
                merchantName: d.merchantName,
                categoryId: d.categoryId,
                typicalAmountMinor: d.typicalAmountMinor,
                cadence: d.cadence,
                nextExpectedDate: d.nextExpectedDate
              }),
          lastSeenDate: d.lastSeenDate,
          confidence: d.confidence,
          status: keepStatus ? prev.status : d.suggestedStatus,
          linkedTransactionIds: d.transactionIds,
          updatedAt: ts
        })
        .where(eq(s.recurringCommitments.id, prev.id))
        .run()
    }

    for (const prev of existing.values()) {
      if (seen.has(prev.merchantKey)) continue
      if (prev.userConfirmed || prev.userEdited || prev.status === 'ignored') continue
      tx.delete(s.recurringCommitments).where(eq(s.recurringCommitments.id, prev.id)).run()
    }

    // Roll user-maintained dates forward so they stay "upcoming".
    for (const c of tx.select().from(s.recurringCommitments).all()) {
      if (!c.nextExpectedDate || c.nextExpectedDate >= today) continue
      const months = c.cadence === 'custom' ? 1 : CADENCE_MONTHS[c.cadence]
      const day = Number(c.nextExpectedDate.slice(8, 10))
      let next = c.nextExpectedDate
      let guard = 0
      while (next < today && guard++ < 240) next = addMonthsClamped(next, months, day)
      tx.update(s.recurringCommitments)
        .set({ nextExpectedDate: next })
        .where(eq(s.recurringCommitments.id, c.id))
        .run()
    }

    // Keep the transaction-level isRecurring flag in sync.
    tx.update(s.transactions).set({ isRecurring: false }).run()
    const linked = tx
      .select()
      .from(s.recurringCommitments)
      .all()
      .filter((c) => c.status !== 'ignored')
      .flatMap((c) => c.linkedTransactionIds)
    for (let i = 0; i < linked.length; i += 500) {
      tx.update(s.transactions)
        .set({ isRecurring: true })
        .where(inArray(s.transactions.id, linked.slice(i, i + 500)))
        .run()
    }
  })

  return listCommitments(db)
}

export function getMonths(db: Db): { months: MonthInfo[]; defaultMonth: string } {
  const months = listMonths(
    db.select({ transactionDate: s.transactions.transactionDate }).from(s.transactions).all()
  )
  return { months, defaultMonth: defaultMonth(months, todayISO()) }
}

export function getMonthlyClose(db: Db, month: string): MonthlyCloseReport {
  const report = buildMonthlyCloseReport({
    month,
    today: todayISO(),
    settings: getSettings(db),
    categories: listCategories(db),
    accounts: listAccounts(db),
    transactions: allTransactions(db),
    commitments: listCommitments(db),
    goals: listGoals(db)
  })

  // Persist generated insights so dismissals survive regeneration.
  const ts = new Date().toISOString()
  db.transaction((tx) => {
    for (const i of report.insights) {
      tx.insert(s.insights)
        .values({
          id: i.id,
          month: i.month,
          type: i.type,
          title: i.title,
          summary: i.summary,
          estimatedImpactMinor: i.estimatedImpactMinor,
          confidence: i.confidence,
          severity: i.severity,
          evidenceJson: i.evidence,
          createdAt: ts,
          dismissedAt: null
        })
        .onConflictDoUpdate({
          target: s.insights.id,
          set: {
            title: i.title,
            summary: i.summary,
            estimatedImpactMinor: i.estimatedImpactMinor,
            confidence: i.confidence,
            severity: i.severity,
            evidenceJson: i.evidence
          }
        })
        .run()
    }
  })
  const dismissed = dismissedInsightIds(db)
  const completed = completedInsightIds(db)
  report.insights = report.insights
    .filter((i) => !dismissed.has(i.id))
    .map((i) => ({ ...i, completed: completed.has(i.id) }))
  return report
}

export function getPotentialSavings(
  db: Db,
  month: string,
  report: MonthlyCloseReport = getMonthlyClose(db, month)
): SavingsReport {
  const categories = listCategories(db)
  return computePotentialSavings({
    report,
    transactions: allTransactions(db),
    commitments: listCommitments(db),
    kinds: kindMap(categories),
    categoryName: (id) => categories.find((c) => c.id === id)?.name ?? 'Other'
  })
}

/** Financial-independence projection, with each savings opportunity expressed as "months sooner". */
export function getFiProjection(db: Db, month?: string): FiProjection {
  const target = month ?? getMonths(db).defaultMonth
  const report = getMonthlyClose(db, target)
  const savings = getPotentialSavings(db, target, report)
  const categories = listCategories(db)
  const settings = getSettings(db)
  return projectFi({
    transactions: allTransactions(db),
    kinds: kindMap(categories),
    // Without a corpus of their own, count what INDmoney says they already have.
    settings:
      settings.fiCorpusMinor == null
        ? { ...settings, fiCorpusMinor: indmoneyNetWorthMinor(db) }
        : settings,
    month: target,
    today: todayISO(),
    // Only savings that repeat every month move the FI date; a one-month category spike
    // ("travel above normal") is not a permanent saving.
    levers: savings.opportunities
      .filter((o) => o.kind !== 'duplicate' && !o.id.startsWith('cat:'))
      .slice(0, 10)
      .map((o) => ({ id: o.id, label: o.title, monthlyMinor: o.monthlyMinor }))
  })
}

/** Everything in and out for a month, with subscriptions, hidden costs and saving suggestions. */
export function getMoneyFlow(db: Db, month?: string): MoneyFlow {
  const target = month ?? getMonths(db).defaultMonth
  const categories = listCategories(db)
  return buildMoneyFlow({
    transactions: allTransactions(db),
    commitments: listCommitments(db),
    kinds: kindMap(categories),
    month: target,
    currency: getSettings(db).primaryCurrency,
    accountNames: new Map(listAccounts(db).map((a) => [a.id, a.name])),
    accountTypes: new Map(listAccounts(db).map((a) => [a.id, a.type])),
    aiSuggestions: loadAiSuggestions(db)
  })
}

/** Best cards and ways to pay for the user's own last 12 months of spending. */
export function getPaymentAdvice(db: Db, month?: string): PaymentAdvice {
  const target = month ?? getMonths(db).defaultMonth
  return adviseCards({
    transactions: allTransactions(db),
    kinds: kindMap(listCategories(db)),
    month: target,
    accountTypes: new Map(listAccounts(db).map((a) => [a.id, a.type])),
    currency: getSettings(db).primaryCurrency
  })
}

/** Investments month by month, by type, with recurring ones projected forward. */
export function getInvestments(db: Db, month?: string): InvestmentReport {
  return buildInvestmentReport({
    transactions: allTransactions(db),
    kinds: kindMap(listCategories(db)),
    month: month ?? getMonths(db).defaultMonth,
    payroll: listPayslips(db)
  })
}

export function getSalaryProfile(db: Db): SalaryProfile | null {
  return buildSalaryProfile(listPayslips(db), allTransactions(db))
}
