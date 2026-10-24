import { describe, expect, it } from 'vitest'
import { SEED_CATEGORIES } from '../categories'
import type { Transaction } from '../types'
import { directionFor, kindMap } from './cashflow'
import { monthsToTarget, projectFi } from './fi'

const kinds = kindMap(SEED_CATEGORIES)
let n = 0
const tx = (date: string, amountMinor: number, categoryId: string): Transaction => {
  const kind = kinds.get(categoryId)
  return {
    id: `t${++n}`,
    accountId: 'a',
    importSourceId: null,
    transactionDate: date,
    descriptionOriginal: categoryId,
    descriptionKey: categoryId,
    merchantNormalised: categoryId,
    amountMinor,
    currency: 'INR',
    direction: directionFor(kind, false, amountMinor),
    categoryId,
    categoryConfidence: 1,
    categorySource: 'manual',
    isRecurring: false,
    isTransfer: false,
    notes: null,
    createdAt: ''
  }
}

// ₹1,00,000 income and ₹60,000 spending every month → ₹40,000 saved.
const txs = ['07', '08', '09'].flatMap((m) => [
  tx(`2026-${m}-01`, 10_000_000, 'income'),
  tx(`2026-${m}-05`, -6_000_000, 'housing')
])
const settings = {
  primaryCurrency: 'INR',
  fiCorpusMinor: 100_000_000,
  fiReturnPct: 5,
  fiWithdrawalPct: 4,
  fiTargetSpendMinor: null
}

describe('monthsToTarget', () => {
  it('handles simple cases', () => {
    expect(monthsToTarget(100, 0, 50, 5)).toBe(0)
    expect(monthsToTarget(0, 100, 1200, 0)).toBe(12)
    expect(monthsToTarget(0, 0, 1000, 0)).toBeNull()
  })
})

describe('projectFi', () => {
  const p = projectFi({
    transactions: txs,
    kinds,
    settings,
    month: '2026-09',
    today: '2026-10-03',
    levers: [{ id: 'x', label: 'Cancel X', monthlyMinor: 500_000 }]
  })

  it('derives the FI number from spending and the withdrawal rate', () => {
    expect(p.avgMonthlySpendMinor).toBe(6_000_000)
    expect(p.monthlySavingsMinor).toBe(4_000_000)
    expect(p.savingRate).toBe(40)
    expect(p.fiNumberMinor).toBe(6_000_000 * 12 * 25) // ₹1.8 Cr
    expect(p.progressPct).toBeCloseTo(5.6, 1)
  })

  it('projects a finite date and converts savings into months sooner', () => {
    expect(p.monthsToFi).toBeGreaterThan(12 * 15)
    expect(p.monthsToFi).toBeLessThan(12 * 25)
    expect(p.fiDate).not.toBeNull()
    expect(p.levers[0]!.monthsSooner).toBeGreaterThan(12) // ₹5,000/month less spend = >1 year sooner
    expect(p.series[0]!.corpusMinor).toBe(100_000_000)
    expect(p.assumptions[0]).toMatch(/^Estimate only/)
  })

  it('returns no date when nothing is being saved', () => {
    const broke = projectFi({
      transactions: txs.filter((t) => t.categoryId !== 'income'),
      kinds,
      settings: { ...settings, fiCorpusMinor: 0 },
      month: '2026-09',
      today: '2026-10-03'
    })
    expect(broke.monthsToFi).toBeNull()
  })
})
