import { addMonthsClamped, addMonths, type ISODate, type MonthKey } from '../dates'
import { averageMinor } from '../money'
import type { FiLever, FiProjection, Transaction, UserFinancialSettings } from '../types'
import { summariseMonth, type KindMap } from './cashflow'

const MAX_MONTHS = 70 * 12

export interface FiInput {
  transactions: readonly Transaction[]
  kinds: KindMap
  settings: Pick<
    UserFinancialSettings,
    'primaryCurrency' | 'fiCorpusMinor' | 'fiReturnPct' | 'fiWithdrawalPct' | 'fiTargetSpendMinor'
  >
  /** Month the projection is based on (usually the latest full month). */
  month: MonthKey
  today: ISODate
  /** Savings opportunities to express as "months sooner". */
  levers?: { id: string; label: string; monthlyMinor: number }[]
}

/**
 * Months until `corpus` grows to `target`, contributing `monthly` each month at an annual real
 * return of `annualReturnPct`. Null if it never gets there within 70 years.
 */
export function monthsToTarget(
  corpus: number,
  monthly: number,
  target: number,
  annualReturnPct: number
): number | null {
  if (corpus >= target) return 0
  const r = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1
  let value = corpus
  for (let m = 1; m <= MAX_MONTHS; m++) {
    value = value * (1 + r) + monthly
    if (value >= target) return m
    if (monthly <= 0 && r <= 0) return null
  }
  return null
}

/**
 * Financial-independence projection from the user's own cash flow. Everything here is an
 * estimate under user-editable assumptions (real return, withdrawal rate, target spending);
 * it is not investment advice and recommends no products.
 */
export function projectFi(input: FiInput): FiProjection {
  const { settings } = input
  // Average the latest (up to) three months that have data, ending at `month`.
  const months = [0, 1, 2]
    .map((n) => addMonths(input.month, -n))
    .map((m) => summariseMonth(input.transactions, m, input.kinds))
    .filter((s) => s.transactionCount > 0)
  const avgIncome = averageMinor(months.map((s) => s.incomeMinor))
  const avgSpend = averageMinor(months.map((s) => s.spendingMinor))
  const monthlySavings = avgIncome - avgSpend
  const targetSpend =
    settings.fiTargetSpendMinor && settings.fiTargetSpendMinor > 0
      ? settings.fiTargetSpendMinor
      : avgSpend
  const wr = Math.max(0.5, settings.fiWithdrawalPct)
  const fiNumber = Math.round((targetSpend * 12) / (wr / 100))
  const corpus = settings.fiCorpusMinor ?? 0
  const ret = settings.fiReturnPct

  const months0 = monthsToTarget(corpus, monthlySavings, fiNumber, ret)
  const fiDate = months0 == null ? null : addMonthsClamped(input.today, months0)

  // Year-by-year path for the chart (up to FI + 2 years, max 40 years).
  const r = Math.pow(1 + ret / 100, 1 / 12) - 1
  const horizonYears = Math.min(40, months0 == null ? 30 : Math.ceil(months0 / 12) + 2)
  const series: FiProjection['series'] = []
  let value = corpus
  const startYear = Number(input.today.slice(0, 4))
  series.push({ year: startYear, corpusMinor: Math.round(value), fiNumberMinor: fiNumber })
  for (let y = 1; y <= horizonYears; y++) {
    for (let m = 0; m < 12; m++) value = value * (1 + r) + monthlySavings
    series.push({
      year: startYear + y,
      corpusMinor: Math.max(0, Math.round(value)),
      fiNumberMinor: fiNumber
    })
  }

  // Each saving lowers the spending FI must cover AND raises what you save every month.
  const levers: FiLever[] = (input.levers ?? [])
    .filter((l) => l.monthlyMinor > 0)
    .map((l) => {
      const newTarget = Math.max(0, targetSpend - l.monthlyMinor)
      const newFi = Math.round((newTarget * 12) / (wr / 100))
      const m = monthsToTarget(corpus, monthlySavings + l.monthlyMinor, newFi, ret)
      return { ...l, monthsSooner: months0 != null && m != null ? Math.max(0, months0 - m) : null }
    })
    .sort(
      (a, b) => (b.monthsSooner ?? 0) - (a.monthsSooner ?? 0) || b.monthlyMinor - a.monthlyMinor
    )

  const fmtPct = (n: number): string => `${Number(n.toFixed(2))}%`
  return {
    currency: settings.primaryCurrency,
    monthsOfData: months.length,
    avgMonthlyIncomeMinor: avgIncome,
    avgMonthlySpendMinor: avgSpend,
    monthlySavingsMinor: monthlySavings,
    savingRate: avgIncome > 0 ? Math.round((monthlySavings / avgIncome) * 1000) / 10 : null,
    targetMonthlySpendMinor: targetSpend,
    fiNumberMinor: fiNumber,
    corpusMinor: corpus,
    corpusIsSet: settings.fiCorpusMinor != null,
    progressPct: fiNumber > 0 ? Math.min(100, Math.round((corpus / fiNumber) * 1000) / 10) : 0,
    monthsToFi: months0,
    fiDate,
    series,
    levers,
    assumptions: [
      `Estimate only, not investment advice. Assumes a steady ${fmtPct(ret)} yearly return after inflation and that you keep saving ${months.length ? 'your recent average' : 'nothing'} each month.`,
      `Financial independence = savings that can fund your yearly spending at a ${fmtPct(wr)} withdrawal rate (×${Number((100 / wr).toFixed(1))} your yearly spending).`,
      `Spending and income are averaged over your last ${months.length} month${months.length === 1 ? '' : 's'} of data${settings.fiTargetSpendMinor ? '; FI spending uses your target.' : '.'}`,
      settings.fiCorpusMinor == null
        ? 'Your current savings & investments aren’t set, so the projection starts from zero.'
        : 'Starts from the savings & investments you entered.'
    ]
  }
}
