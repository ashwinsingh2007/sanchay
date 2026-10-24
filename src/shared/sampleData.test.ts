import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'
import { NEEDS_REVIEW_THRESHOLD, SEED_CATEGORIES } from './categories'
import { Categoriser } from './domain/categorise'
import { directionFor, kindMap } from './domain/cashflow'
import { detectHeaderRow, normaliseRows, suggestMapping } from './domain/csvNormalise'
import { merchantKey } from './domain/merchant'
import { detectRecurring } from './domain/recurring'
import { buildMonthlyCloseReport } from './domain/report'
import { computePotentialSavings, estimateCards } from './domain/savings'
import { buildAiContext } from './domain/aiContext'
import { generateSampleStatements } from './sampleData'
import type { RecurringCommitment, Transaction } from './types'

/** Runs the sample statements through the same pure pipeline the importer uses. */
function pipeline(endDate: string) {
  const kinds = kindMap(SEED_CATEGORIES)
  const categoriser = new Categoriser([])
  const txs: Transaction[] = []
  const statements = generateSampleStatements(endDate)
  let balance: number | null = null
  statements.forEach((st, si) => {
    const rows = parse(st.csv, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true
    }) as string[][]
    const mapping = {
      ...suggestMapping(rows, detectHeaderRow(rows)),
      positiveMeans: st.positiveMeans
    }
    const { rows: norm, invalidCount } = normaliseRows(rows, mapping, 2)
    expect(invalidCount).toBe(0)
    if (st.accountType === 'bank') balance = norm[norm.length - 1]!.balanceMinor
    norm.forEach((r, i) => {
      const c = categoriser.categorise({ description: r.description, amountMinor: r.amountMinor })
      const kind = kinds.get(c.categoryId)
      txs.push({
        id: `${si}-${i}`,
        accountId: st.accountName,
        importSourceId: null,
        transactionDate: r.date,
        descriptionOriginal: r.description,
        descriptionKey: r.description.toLowerCase(),
        merchantNormalised: c.merchantNormalised,
        amountMinor: r.amountMinor,
        currency: 'INR',
        direction: directionFor(kind, kind === 'transfer', r.amountMinor),
        categoryId: c.categoryId,
        categoryConfidence: c.confidence,
        categorySource: c.source,
        isRecurring: false,
        isTransfer: kind === 'transfer',
        notes: null,
        createdAt: ''
      })
    })
  })
  return { txs, balance: balance as number | null }
}

describe('sample data story', () => {
  const today = '2026-10-03'
  const { txs, balance } = pipeline(today)

  it('categorises almost everything confidently', () => {
    const review = txs.filter((t) => !t.isTransfer && t.categoryConfidence < NEEDS_REVIEW_THRESHOLD)
    expect(review.map((t) => t.merchantNormalised).sort()).toEqual([
      'Client Design Project',
      'Ravi K'
    ])
    // Card bill payments are transfers on both sides
    expect(txs.filter((t) => t.isTransfer).length).toBeGreaterThanOrEqual(8)
  })

  it('produces a September close with the expected CFO actions', () => {
    const detected = detectRecurring(
      txs.map((t) => ({
        id: t.id,
        date: t.transactionDate,
        merchant: t.merchantNormalised,
        amountMinor: t.amountMinor,
        categoryId: t.categoryId,
        isTransfer: t.direction !== 'expense'
      })),
      { amountTolerance: 0.15, referenceDate: today, dataEndDate: today }
    )
    const names = detected.map((d) => d.merchantName)
    expect(names).toEqual(
      expect.arrayContaining(['House Rent', 'Netflix', 'Spotify', 'Airtel', 'Cult.fit'])
    )
    expect(names).not.toContain('Swiggy')
    expect(names).not.toContain('Uber')

    const commitments: RecurringCommitment[] = detected.map((d, i) => ({
      id: `c${i}`,
      merchantKey: merchantKey(d.merchantName),
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
      createdAt: '',
      updatedAt: ''
    }))

    const report = buildMonthlyCloseReport({
      month: '2026-09',
      today,
      settings: {
        primaryCurrency: 'INR',
        nextIncomeDate: '2026-11-01',
        expectedIncomeMinor: null,
        emergencyBufferMinor: 5000000,
        monthlySavingsTargetMinor: null,
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
      },
      categories: SEED_CATEGORIES,
      accounts: [
        {
          id: 'b',
          name: 'Bank',
          type: 'bank',
          currency: 'INR',
          currentBalanceMinor: balance,
          balanceAsOf: today,
          balanceSource: 'statement',
          createdAt: '',
          updatedAt: ''
        }
      ],
      transactions: txs,
      commitments,
      goals: []
    })

    expect(report.current.incomeMinor).toBeGreaterThan(18500000) // salary + quarterly interest
    expect(report.comparison.hasPrevious).toBe(true)
    expect(report.oneOffs.map((t) => t.merchant)).toEqual(['Star Health Insurance Premium'])
    const types = report.insights.map((i) => i.type)
    expect(types).toEqual(
      expect.arrayContaining([
        'subscriptions_review',
        'category_above_normal',
        'one_off_expense',
        'fees'
      ])
    )
    expect(report.insights.find((i) => i.type === 'category_above_normal')?.title).toMatch(
      /^Dining & Delivery/
    )
    expect(report.safeToSpend.status).toBe('ok')

    // Daily series adds up to the month's spending
    expect(report.daily).toHaveLength(30)
    expect(report.daily[29]!.cumulativeMinor).toBe(report.current.spendingMinor)
    expect(report.daily[0]!.prevCumulativeMinor).not.toBeNull()
    expect(report.topMerchants[0]!.merchant).toBe('House Rent')

    // Potential savings: evidence-backed, duplicates excluded from the monthly total
    const kinds = kindMap(SEED_CATEGORIES)
    const name = (id: string) => SEED_CATEGORIES.find((c) => c.id === id)?.name ?? 'Other'
    const savings = computePotentialSavings({
      report,
      transactions: txs,
      commitments,
      kinds,
      categoryName: name
    })
    const kindsFound = new Set(savings.opportunities.map((o) => o.kind))
    expect([...kindsFound]).toEqual(
      expect.arrayContaining(['subscription', 'category', 'fees', 'card_rewards', 'alternative'])
    )
    expect(savings.opportunities.map((o) => o.id)).toEqual(
      expect.arrayContaining(['alt:delivery-cook', 'alt:cabs-transit', 'alt:streaming-rotate'])
    )
    // Category habit and alternatives in the same category are not double counted.
    expect(savings.totalMonthlyMinor).toBeLessThan(
      savings.opportunities
        .filter((o) => o.kind !== 'duplicate')
        .reduce((t, o) => t + o.monthlyMinor, 0)
    )
    expect(savings.totalMonthlyMinor).not.toBe(
      savings.opportunities
        .filter((o) => o.kind !== 'duplicate')
        .reduce((t, o) => t + o.monthlyMinor, 0)
    )
    for (const o of savings.opportunities)
      expect(o.evidence.calculation.length + o.evidence.transactions.length).toBeGreaterThan(0)

    // Card estimates: food-delivery-heavy spend should favour a delivery/online card over a fuel card
    const { cards } = estimateCards(txs, '2026-09', kinds)
    const rank = (id: string) => cards.findIndex((c) => c.cardId === id)
    expect(rank('hdfc-swiggy-blck')).toBeLessThan(rank('hdfc-indianoil'))

    // AI context is a sanitised summary: no raw statement text or reference numbers
    const ctx = buildAiContext({
      report,
      savings,
      commitments,
      categoryName: name,
      goalText: 'Save for a trip',
      dataRange: { start: '2026-04-01', end: today }
    })
    expect(ctx).toContain('## Spending by category')
    expect(ctx).toContain('Save for a trip')
    expect(ctx).not.toMatch(/UPI\/|NEFT|@okbank|\d{9,}/)
  })
})
