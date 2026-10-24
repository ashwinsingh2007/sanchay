import {
  addDays,
  addMonths,
  daysInMonth,
  monthEnd,
  monthName,
  previousMonth,
  toMonthKey,
  type ISODate,
  type MonthKey
} from '../dates'
import { formatMoney, sumMinor } from '../money'
import { NEEDS_REVIEW_THRESHOLD } from '../categories'
import type {
  Account,
  DayPoint,
  MerchantTotal,
  Category,
  MonthComparison,
  MonthInfo,
  MonthlyCloseReport,
  RecurringCommitment,
  SavingsGoal,
  Transaction,
  UserFinancialSettings
} from '../types'
import {
  compareMonths,
  detectOneOffs,
  inMonth,
  isSpending,
  spendOf,
  kindMap,
  summariseMonth,
  toEvidence,
  type KindMap
} from './cashflow'
import { projectGoal } from './goals'
import { generateInsights } from './insights'
import { buildNarrative } from './narrative'
import { occurrencesBetween } from './recurring'
import { computeSafeToSpend, effectiveNextIncomeDate } from './safeToSpend'

export interface ReportInput {
  month: MonthKey
  today: ISODate
  settings: UserFinancialSettings
  categories: readonly Category[]
  accounts: readonly Account[]
  transactions: readonly Transaction[]
  commitments: readonly RecurringCommitment[]
  goals: readonly SavingsGoal[]
}

/** Months with at least this many transactions are used as comparison baselines. */
const MIN_TX_FOR_BASELINE = 5

export function listMonths(
  transactions: readonly Pick<Transaction, 'transactionDate'>[]
): MonthInfo[] {
  const map = new Map<MonthKey, MonthInfo>()
  for (const t of transactions) {
    const month = toMonthKey(t.transactionDate)
    const info = map.get(month) ?? {
      month,
      transactionCount: 0,
      firstDate: t.transactionDate,
      lastDate: t.transactionDate
    }
    info.transactionCount++
    if (t.transactionDate < info.firstDate) info.firstDate = t.transactionDate
    if (t.transactionDate > info.lastDate) info.lastDate = t.transactionDate
    map.set(month, info)
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month))
}

/**
 * Picks the month to open by default: the latest month, unless it has barely started
 * (fewer than 20 days of data) and a fuller previous month exists.
 */
export function defaultMonth(months: readonly MonthInfo[], today: ISODate): MonthKey {
  if (months.length === 0) return toMonthKey(today)
  const [latest, prev] = months
  if (
    prev &&
    Number(latest!.lastDate.slice(8, 10)) < 20 &&
    latest!.lastDate < monthEnd(latest!.month)
  ) {
    return prev.month
  }
  return latest!.month
}

function oneOffsFor(
  month: MonthKey,
  txs: readonly Transaction[],
  kinds: KindMap,
  monthlyKeys: Set<string>,
  periodicKeys: Set<string>
): Set<string> {
  const prior = [1, 2, 3].flatMap((n) => inMonth(txs, addMonths(month, -n)))
  return detectOneOffs(inMonth(txs, month), prior, kinds, {
    monthlyRecurringKeys: monthlyKeys,
    periodicKeys
  })
}

export function buildMonthlyCloseReport(input: ReportInput): MonthlyCloseReport {
  const { month, today, settings, categories, transactions } = input
  const currency = settings.primaryCurrency
  const fmt = (m: number): string => formatMoney(m, currency)
  const kinds = kindMap(categories)
  const categoryName = (id: string): string => categories.find((c) => c.id === id)?.name ?? 'Other'

  const months = listMonths(transactions)
  const monthsWithData = new Set(
    months.filter((m) => m.transactionCount >= MIN_TX_FOR_BASELINE).map((m) => m.month)
  )
  const lastDataDate = months[0]?.lastDate ?? null
  const prev = previousMonth(month)

  const activeCommitments = input.commitments.filter((c) => c.status !== 'ignored')
  const monthlyKeys = new Set(
    activeCommitments.filter((c) => c.cadence === 'monthly').map((c) => c.merchantKey)
  )
  const periodicKeys = new Set(
    activeCommitments
      .filter((c) => c.cadence === 'quarterly' || c.cadence === 'yearly')
      .map((c) => c.merchantKey)
  )

  const current = summariseMonth(transactions, month, kinds)
  const previousSummary = summariseMonth(transactions, prev, kinds)
  const hasPrevious = previousSummary.transactionCount > 0

  const currentOneOffs = oneOffsFor(month, transactions, kinds, monthlyKeys, periodicKeys)
  const previousOneOffs = hasPrevious
    ? oneOffsFor(prev, transactions, kinds, monthlyKeys, periodicKeys)
    : new Set<string>()
  const priorOneOffIds = new Set<string>(previousOneOffs)
  for (const n of [2, 3])
    for (const id of oneOffsFor(
      addMonths(month, -n),
      transactions,
      kinds,
      monthlyKeys,
      periodicKeys
    ))
      priorOneOffIds.add(id)

  const monthTxs = inMonth(transactions, month)
  const { spendingDiffMinor, drivers } = compareMonths({
    currentTxs: monthTxs,
    previousTxs: inMonth(transactions, prev),
    currentOneOffs,
    previousOneOffs,
    kinds,
    categoryName
  })

  let headline: string
  if (!hasPrevious)
    headline = `No data for ${monthName(prev)} yet — import an earlier statement to compare.`
  else if (spendingDiffMinor > 0)
    headline = `You spent ${fmt(spendingDiffMinor)} more than last month.`
  else if (spendingDiffMinor < 0)
    headline = `You spent ${fmt(-spendingDiffMinor)} less than last month.`
  else headline = 'Your spending was the same as last month.'

  const comparison: MonthComparison = {
    previousMonth: prev,
    hasPrevious,
    spendingDiffMinor: hasPrevious ? spendingDiffMinor : 0,
    incomeDiffMinor: hasPrevious ? current.incomeMinor - previousSummary.incomeMinor : 0,
    netDiffMinor: hasPrevious ? current.netCashFlowMinor - previousSummary.netCashFlowMinor : 0,
    headline,
    drivers: hasPrevious ? drivers : drivers.filter((d) => d.kind === 'one_off')
  }

  const safeToSpend = computeSafeToSpend({
    accounts: input.accounts,
    commitments: input.commitments,
    settings,
    today
  })
  const nextIncome = effectiveNextIncomeDate(settings.nextIncomeDate, today)
  const untilDate = nextIncome && nextIncome > today ? nextIncome : addDays(today, 30)
  const upcomingItems = occurrencesBetween(input.commitments, today, untilDate)

  const goals = [...input.goals]
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))
    .map((g) => projectGoal(g, today))

  const needsReviewCount = monthTxs.filter(
    (t) => t.direction !== 'transfer' && t.categoryConfidence < NEEDS_REVIEW_THRESHOLD
  ).length
  const isPartialMonth =
    lastDataDate != null && lastDataDate < monthEnd(month) && toMonthKey(lastDataDate) === month

  const insights = generateInsights({
    month,
    currency,
    today,
    isPartialMonth,
    settings,
    current,
    transactions,
    kinds,
    categoryName,
    commitments: input.commitments,
    safeToSpend,
    goals,
    oneOffIds: currentOneOffs,
    priorOneOffIds,
    monthsWithData: new Set([...monthsWithData].filter((m) => m < month)),
    needsReviewCount
  })

  const trend = Array.from({ length: 12 }, (_, i) => 11 - i)
    .map((n) => addMonths(month, -n))
    .filter((m) => months.some((x) => x.month === m))
    .map((m) => {
      const s = m === month ? current : summariseMonth(transactions, m, kinds)
      return {
        month: m,
        incomeMinor: s.incomeMinor,
        spendingMinor: s.spendingMinor,
        byCategory: s.byCategory
      }
    })

  const oneOffs = monthTxs.filter((t) => currentOneOffs.has(t.id)).map(toEvidence)
  const daily = dailySeries(transactions, month, prev, kinds, hasPrevious)
  const topMerchants = merchantTotals(monthTxs, kinds).slice(0, 8)

  const report: MonthlyCloseReport = {
    month,
    currency,
    today,
    hasData: current.transactionCount > 0,
    isPartialMonth,
    current,
    previous: hasPrevious ? previousSummary : null,
    comparison,
    oneOffs,
    safeToSpend,
    upcoming: {
      items: upcomingItems,
      totalMinor: sumMinor(upcomingItems.map((i) => i.amountMinor)),
      untilDate
    },
    goals,
    insights,
    narrative: [],
    trend,
    needsReviewCount,
    daily,
    topMerchants
  }
  report.narrative = buildNarrative(report, categoryName)
  return report
}

/** Day-by-day spend for a month, with the previous month's cumulative line for comparison. */
export function dailySeries(
  transactions: readonly Transaction[],
  month: MonthKey,
  prev: MonthKey,
  kinds: KindMap,
  hasPrevious: boolean
): DayPoint[] {
  const days = daysInMonth(month)
  const spend = new Array<number>(days + 1).fill(0)
  const income = new Array<number>(days + 1).fill(0)
  const count = new Array<number>(days + 1).fill(0)
  const prevDays = daysInMonth(prev)
  const prevSpend = new Array<number>(prevDays + 1).fill(0)
  for (const t of transactions) {
    const m = toMonthKey(t.transactionDate)
    const d = Number(t.transactionDate.slice(8, 10))
    if (m === month) {
      count[d]!++
      if (isSpending(t, kinds)) spend[d]! += spendOf(t)
      else if (t.direction === 'income') income[d]! += t.amountMinor
    } else if (m === prev && isSpending(t, kinds)) {
      prevSpend[d]! += spendOf(t)
    }
  }
  const out: DayPoint[] = []
  let cum = 0
  let prevCum = 0
  for (let d = 1; d <= days; d++) {
    cum += spend[d]!
    if (d <= prevDays) prevCum += prevSpend[d]!
    out.push({
      day: d,
      date: `${month}-${String(d).padStart(2, '0')}`,
      spendMinor: spend[d]!,
      incomeMinor: income[d]!,
      count: count[d]!,
      cumulativeMinor: cum,
      prevCumulativeMinor: hasPrevious && d <= prevDays ? prevCum : null
    })
  }
  return out
}

export function merchantTotals(monthTxs: readonly Transaction[], kinds: KindMap): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>()
  for (const t of monthTxs) {
    if (!isSpending(t, kinds)) continue
    const e = map.get(t.merchantNormalised) ?? {
      merchant: t.merchantNormalised,
      categoryId: t.categoryId,
      spendMinor: 0,
      count: 0
    }
    e.spendMinor += spendOf(t)
    e.count++
    map.set(t.merchantNormalised, e)
  }
  return [...map.values()]
    .filter((m) => m.spendMinor > 0)
    .sort((a, b) => b.spendMinor - a.spendMinor)
}
