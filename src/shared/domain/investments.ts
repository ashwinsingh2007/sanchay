import { addMonths, toMonthKey, type MonthKey } from '../dates'
import { medianMinor, sumMinor } from '../money'
import type { InvestmentReport, InvestmentType, Payslip, Transaction } from '../types'
import { isInvesting, spendOf, type KindMap } from './cashflow'
import { normaliseForMatch } from './merchant'

export const INVESTMENT_TYPES: { id: InvestmentType; name: string; color: string }[] = [
  { id: 'mf', name: 'Mutual funds & SIPs', color: '#34d399' },
  { id: 'fd', name: 'FDs & RDs', color: '#60a5fa' },
  { id: 'stocks', name: 'Stocks & brokers', color: '#f59e0b' },
  { id: 'retirement', name: 'PF, NPS, PPF & SSY', color: '#a78bfa' },
  { id: 'gold', name: 'Gold', color: '#facc15' },
  { id: 'other', name: 'Other investments', color: '#94a3b8' }
]

const PATTERNS: { type: InvestmentType; words: string[] }[] = [
  {
    type: 'retirement',
    words: [
      'NPS',
      'PROTEAN',
      'NSDL',
      'PPF',
      'SUKANYA',
      'SSY',
      'EPF',
      'VPF',
      'PENSION',
      'APY',
      'ATAL PENSION'
    ]
  },
  {
    type: 'gold',
    words: ['SGB', 'SOVEREIGN GOLD', 'DIGITAL GOLD', 'SAFEGOLD', 'AUGMONT', 'MMTC PAMP', 'GOLD']
  },
  {
    type: 'fd',
    words: [
      'FD',
      'FIXED DEPOSIT',
      'TERM DEPOSIT',
      'TD',
      'TD BOOKING',
      'TO FD',
      'FD BOOKING',
      'NEW FD',
      'RECURRING DEPOSIT',
      'RD INST',
      'RD INSTALMENT',
      'RD INSTALLMENT',
      'TO RD',
      'RD'
    ]
  },
  {
    type: 'mf',
    words: [
      'SIP',
      'MUTUAL FUND',
      'MUTUAL FUNDS',
      'MF',
      'CAMS',
      'CAMSONLINE',
      'KFINTECH',
      'KFIN',
      'KARVY',
      'BSE STAR',
      'BSE STAR MF',
      'COIN',
      'KUVERA',
      'PAYTM MONEY',
      'ET MONEY',
      'PPFAS',
      'PARAG PARIKH',
      'MIRAE',
      'NIPPON',
      'HDFC MF',
      'ICICI PRU MF',
      'SBI MF',
      'AXIS MF',
      'KOTAK MF',
      'UTI MF',
      'DSP MF',
      'QUANT MF',
      'MOTILAL OSWAL',
      'TATA MF',
      'AMC'
    ]
  },
  {
    type: 'stocks',
    words: [
      'ZERODHA',
      'UPSTOX',
      'RKSV',
      'ANGEL ONE',
      'ANGEL BROKING',
      '5PAISA',
      'DHAN',
      'RAISE SECURITIES',
      'INDMONEY',
      'SMALLCASE',
      'ICCL',
      'NSE CLEARING',
      'INDIAN CLEARING',
      'NSCCL',
      'GROWW',
      'NEXTBILLION',
      'SECURITIES',
      'BROKING',
      'STOCK',
      'DEMAT'
    ]
  }
]

/** What kind of investment a payment went into, from the statement text. */
export function investmentType(description: string, merchant = ''): InvestmentType {
  const text = ` ${normaliseForMatch(`${description} ${merchant}`)} `
  for (const p of PATTERNS) if (p.words.some((w) => text.includes(` ${w} `))) return p.type
  return 'other'
}

/**
 * Month-by-month money put into investments, split by type, plus what the next months will
 * likely look like: types that recur (SIPs, RDs, NPS…) are projected at their typical amount.
 */
export function buildInvestmentReport(input: {
  transactions: readonly Transaction[]
  kinds: KindMap
  month: MonthKey
  monthsBack?: number
  monthsAhead?: number
  /** Payslips: employee PF, VPF and NPS deducted from salary count as retirement investing. */
  payroll?: readonly Payslip[]
}): InvestmentReport {
  const { transactions, kinds, month } = input
  const back = input.monthsBack ?? 12
  const ahead = input.monthsAhead ?? 3
  const haveData = new Set(transactions.map((t) => toMonthKey(t.transactionDate)))
  const past = Array.from({ length: back }, (_, i) => addMonths(month, -(back - 1 - i))).filter(
    (m) => haveData.has(m)
  )

  const byMonth = new Map<string, Map<InvestmentType, number>>()
  for (const t of transactions) {
    if (!isInvesting(t, kinds) || spendOf(t) <= 0) continue
    const m = toMonthKey(t.transactionDate)
    if (!past.includes(m)) continue
    const type = investmentType(t.descriptionOriginal, t.merchantNormalised)
    const row = byMonth.get(m) ?? new Map<InvestmentType, number>()
    row.set(type, (row.get(type) ?? 0) + spendOf(t))
    byMonth.set(m, row)
  }
  let payrollMonthly = 0
  for (const p of input.payroll ?? []) {
    const amount = (p.pfMinor ?? 0) + (p.vpfMinor ?? 0) + (p.npsMinor ?? 0)
    if (!p.period || amount <= 0) continue
    payrollMonthly = Math.max(payrollMonthly, amount)
    if (!past.includes(p.period)) continue
    const row = byMonth.get(p.period) ?? new Map<InvestmentType, number>()
    row.set('retirement', (row.get('retirement') ?? 0) + amount)
    byMonth.set(p.period, row)
  }

  const series = past.map((m) => {
    const row = byMonth.get(m) ?? new Map()
    const byType = Object.fromEntries(
      INVESTMENT_TYPES.map((x) => [x.id, row.get(x.id) ?? 0])
    ) as Record<InvestmentType, number>
    return { month: m, totalMinor: sumMinor(Object.values(byType)), byType, projected: false }
  })

  // Recurring types: present in at least 2 of the last 3 months with data.
  const recent = series.slice(-3)
  const expected = Object.fromEntries(
    INVESTMENT_TYPES.map((x) => {
      const values = recent.map((r) => r.byType[x.id]).filter((v) => v > 0)
      return [x.id, values.length >= 2 ? medianMinor(values) : 0]
    })
  ) as Record<InvestmentType, number>
  if (payrollMonthly > expected.retirement) expected.retirement = payrollMonthly
  const expectedMonthlyMinor = sumMinor(Object.values(expected))

  const future = Array.from({ length: ahead }, (_, i) => ({
    month: addMonths(month, i + 1),
    totalMinor: expectedMonthlyMinor,
    byType: { ...expected },
    projected: true
  }))

  const current = series.find((s) => s.month === month)
  const withData = series.filter((s) => s.totalMinor > 0)
  const totals = new Map<InvestmentType, number>()
  for (const s of series)
    for (const x of INVESTMENT_TYPES) totals.set(x.id, (totals.get(x.id) ?? 0) + s.byType[x.id])

  return {
    month,
    series: [...series, ...future],
    types: INVESTMENT_TYPES.filter((x) => (totals.get(x.id) ?? 0) > 0 || expected[x.id] > 0),
    thisMonthMinor: current?.totalMinor ?? 0,
    averageMonthlyMinor: series.length
      ? Math.round(sumMinor(series.map((s) => s.totalMinor)) / series.length)
      : 0,
    expectedMonthlyMinor,
    next12MonthsMinor: expectedMonthlyMinor * 12,
    totalInvestedMinor: sumMinor(series.map((s) => s.totalMinor)),
    recurring: INVESTMENT_TYPES.filter((x) => expected[x.id] > 0).map((x) => ({
      type: x.id,
      name: x.name,
      monthlyMinor: expected[x.id]
    })),
    monthsWithInvesting: withData.length
  }
}

/** Plain-text summary for the AI CFO. */
export function investmentSummary(r: InvestmentReport, fmt: (m: number) => string): string {
  const lines = [
    `Invested this month ${fmt(r.thisMonthMinor)}; monthly average ${fmt(r.averageMonthlyMinor)}; total over ${r.series.filter((s) => !s.projected).length} months ${fmt(r.totalInvestedMinor)}.`,
    `Recurring: ${r.recurring.map((x) => `${x.name} ${fmt(x.monthlyMinor)}/mo`).join(', ') || 'none detected'}. Expected next 12 months ${fmt(r.next12MonthsMinor)}.`
  ]
  for (const s of r.series.filter((x) => !x.projected && x.totalMinor > 0).slice(-6))
    lines.push(
      `- ${s.month}: ${INVESTMENT_TYPES.filter((t) => s.byType[t.id] > 0)
        .map((t) => `${t.name} ${fmt(s.byType[t.id])}`)
        .join(', ')}`
    )
  return lines.join('\n')
}
