import { describe, expect, it } from 'vitest'
import { SEED_CATEGORIES } from '../categories'
import type { RecurringCommitment, SavingsGoal, Transaction, UserFinancialSettings } from '../types'
import { compareMonths, detectOneOffs, directionFor, kindMap, summariseMonth } from './cashflow'
import { projectGoal } from './goals'
import { buildMonthlyCloseReport, defaultMonth, listMonths } from './report'

const kinds = kindMap(SEED_CATEGORIES)
let seq = 0
function tx(date: string, merchant: string, amountMinor: number, categoryId: string): Transaction {
  const kind = kinds.get(categoryId)
  return {
    id: `t${++seq}`,
    accountId: 'a1',
    importSourceId: null,
    transactionDate: date,
    descriptionOriginal: merchant.toUpperCase(),
    descriptionKey: merchant.toLowerCase(),
    merchantNormalised: merchant,
    amountMinor,
    currency: 'INR',
    direction: directionFor(kind, kind === 'transfer', amountMinor),
    categoryId,
    categoryConfidence: 0.9,
    categorySource: 'keyword',
    isRecurring: false,
    isTransfer: kind === 'transfer',
    notes: null,
    createdAt: ''
  }
}

const settings: UserFinancialSettings = {
  primaryCurrency: 'INR',
  nextIncomeDate: '2026-11-01',
  expectedIncomeMinor: null,
  emergencyBufferMinor: 2000000,
  monthlySavingsTargetMinor: 5000000,
  planningStartDay: 1,
  recurringTolerancePct: 15,
  onboardingComplete: true,
  aiProvider: 'none',
  aiModel: null,
  ollamaUrl: 'http://127.0.0.1:11434',
  cloudConsent: false,
  goalText: null,
  fiCorpusMinor: null,
  fiReturnPct: 5,
  fiWithdrawalPct: 4,
  fiTargetSpendMinor: null
}

function month(m: string, opts: { dining: number; extra?: Transaction[] }): Transaction[] {
  return [
    tx(`2026-${m}-01`, 'Acme', 18500000, 'income'),
    tx(`2026-${m}-03`, 'House Rent', -4200000, 'housing'),
    tx(`2026-${m}-07`, 'SIP', -1500000, 'investments'),
    tx(`2026-${m}-08`, 'Netflix', -64900, 'subscriptions'),
    tx(`2026-${m}-10`, 'BigBasket', -1100000, 'groceries'),
    tx(`2026-${m}-12`, 'Swiggy', -opts.dining, 'dining'),
    tx(`2026-${m}-18`, 'Card bill', -3000000, 'transfers'),
    ...[4, 9, 14, 22, 26].map((d) =>
      tx(`2026-${m}-${String(d).padStart(2, '0')}`, 'Uber', -30000, 'transport')
    ),
    ...(opts.extra ?? [])
  ]
}

describe('monthly cash flow', () => {
  const txs = month('09', { dining: 600000 })

  it('excludes transfers and reports investments separately', () => {
    const s = summariseMonth(txs, '2026-09', kinds)
    expect(s.incomeMinor).toBe(18500000)
    expect(s.spendingMinor).toBe(4200000 + 64900 + 1100000 + 600000 + 5 * 30000)
    expect(s.investedMinor).toBe(1500000)
    expect(s.netCashFlowMinor).toBe(s.incomeMinor - s.spendingMinor)
    expect(s.transferCount).toBe(1)
    expect(s.savingRate).toBeCloseTo(((18500000 - 6114900) / 18500000) * 100, 0)
  })

  it('treats refunds as negative spending', () => {
    const s = summariseMonth(
      [...txs, tx('2026-09-20', 'Swiggy', 100000, 'dining')],
      '2026-09',
      kinds
    )
    expect(s.byCategory.find((c) => c.categoryId === 'dining')?.spendMinor).toBe(500000)
  })
})

describe('month-over-month and one-offs', () => {
  const insurance = tx('2026-09-19', 'Star Health Insurance', -1850000, 'insurance')
  const all = [
    ...month('06', { dining: 500000 }),
    ...month('07', { dining: 520000 }),
    ...month('08', { dining: 480000 }),
    ...month('09', { dining: 900000, extra: [insurance] })
  ]

  it('flags a large new payment as a one-off, not a trend', () => {
    const prior = all.filter((t) => t.transactionDate < '2026-09-01')
    const sep = all.filter((t) => t.transactionDate.startsWith('2026-09'))
    const ids = detectOneOffs(sep, prior, kinds, {
      monthlyRecurringKeys: new Set(),
      periodicKeys: new Set()
    })
    expect([...ids]).toEqual([insurance.id])
  })

  it('splits the change into one-off and category drivers with exact amounts', () => {
    const { spendingDiffMinor, drivers } = compareMonths({
      currentTxs: all.filter((t) => t.transactionDate.startsWith('2026-09')),
      previousTxs: all.filter((t) => t.transactionDate.startsWith('2026-08')),
      currentOneOffs: new Set([insurance.id]),
      previousOneOffs: new Set(),
      kinds,
      categoryName: (id) => SEED_CATEGORIES.find((c) => c.id === id)!.name
    })
    expect(spendingDiffMinor).toBe(1850000 + 420000)
    expect(drivers.map((d) => [d.kind, d.label, d.diffMinor])).toEqual([
      ['one_off', 'One-off: Star Health Insurance', 1850000],
      ['category', 'Dining & Delivery', 420000]
    ])
  })

  it('builds a full monthly close with evidence-backed insights', () => {
    const commitments: RecurringCommitment[] = [
      {
        id: 'c1',
        merchantKey: 'netflix',
        merchantName: 'Netflix',
        categoryId: 'subscriptions',
        typicalAmountMinor: 64900,
        cadence: 'monthly',
        nextExpectedDate: '2026-10-08',
        lastSeenDate: '2026-09-08',
        confidence: 0.9,
        status: 'active',
        userConfirmed: false,
        userEdited: false,
        linkedTransactionIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]
    const goal: SavingsGoal = {
      id: 'g1',
      name: 'Emergency fund',
      targetAmountMinor: 60000000,
      currentAmountMinor: 12000000,
      targetDate: '2027-10-03',
      monthlyContributionMinor: 2000000,
      priority: 1,
      createdAt: '',
      updatedAt: ''
    }
    const report = buildMonthlyCloseReport({
      month: '2026-09',
      today: '2026-10-03',
      settings,
      categories: SEED_CATEGORIES,
      accounts: [
        {
          id: 'a1',
          name: 'Bank',
          type: 'bank',
          currency: 'INR',
          currentBalanceMinor: 25000000,
          balanceAsOf: '2026-10-03',
          balanceSource: 'manual',
          createdAt: '',
          updatedAt: ''
        }
      ],
      transactions: all,
      commitments,
      goals: [goal]
    })

    expect(report.comparison.headline).toBe('You spent ₹22,700 more than last month.')
    expect(report.oneOffs.map((t) => t.id)).toEqual([insurance.id])
    const types = report.insights.map((i) => i.type)
    expect(types).toContain('category_above_normal')
    expect(types).toContain('one_off_expense')
    expect(types).toContain('subscriptions_review')
    expect(types).toContain('goal_gap')
    // Insurance is a one-off, so it must not be reported as an above-normal trend.
    expect(
      report.insights.filter((i) => i.type === 'category_above_normal').map((i) => i.id)
    ).toEqual(['2026-09:category_above_normal:dining'])
    for (const insight of report.insights) {
      expect(insight.action.length).toBeGreaterThan(0)
      expect(insight.why.length).toBeGreaterThan(0)
    }
    const dining = report.insights.find((i) => i.type === 'category_above_normal')!
    expect(dining.estimatedImpactMinor).toBe(900000 - 500000)
    expect(dining.evidence.transactions.length).toBeGreaterThan(0)
    expect(report.safeToSpend).toMatchObject({
      status: 'ok',
      commitmentsMinor: 64900,
      valueMinor: 25000000 - 64900 - 2000000
    })
    expect(report.narrative[0]).toContain('In September you brought in ₹1,85,000')
  })
})

describe('goals', () => {
  const goal: SavingsGoal = {
    id: 'g',
    name: 'Trip',
    targetAmountMinor: 30000000,
    currentAmountMinor: 6000000,
    targetDate: '2027-04-03',
    monthlyContributionMinor: 3000000,
    priority: 1,
    createdAt: '',
    updatedAt: ''
  }

  it('calculates required monthly amount and projected completion', () => {
    const p = projectGoal(goal, '2026-10-03')
    expect(p.remainingMinor).toBe(24000000)
    expect(p.monthsRemaining).toBe(6)
    expect(p.requiredMonthlyMinor).toBe(4000000)
    expect(p.gapMonthlyMinor).toBe(1000000)
    expect(p.projectedCompletionDate).toBe('2027-06-03')
    expect(p.onTrack).toBe(false)
    expect(p.progressPct).toBe(20)
    expect(p.assumptions[0]).toMatch(/^Estimate only/)
  })

  it('handles completed goals and missing contributions', () => {
    expect(projectGoal({ ...goal, currentAmountMinor: 30000000 }, '2026-10-03')).toMatchObject({
      isComplete: true,
      gapMonthlyMinor: 0,
      onTrack: true
    })
    expect(projectGoal({ ...goal, monthlyContributionMinor: null }, '2026-10-03')).toMatchObject({
      projectedCompletionDate: null,
      onTrack: null,
      gapMonthlyMinor: 4000000
    })
  })
})

describe('month selection', () => {
  it('opens the last full month when the current month has barely started', () => {
    const months = listMonths([
      { transactionDate: '2026-09-28' },
      { transactionDate: '2026-10-03' }
    ])
    expect(defaultMonth(months, '2026-10-03')).toBe('2026-09')
    expect(defaultMonth(listMonths([{ transactionDate: '2026-09-28' }]), '2026-10-03')).toBe(
      '2026-09'
    )
    expect(defaultMonth([], '2026-10-03')).toBe('2026-10')
  })
})
