import { describe, expect, it } from 'vitest'
import { buildCfoReview, median, targetEquityPct, type ReviewInput } from './cfoReview'

const L = 100_000 // rupees in a lakh

function input(over: Partial<ReviewInput> = {}): ReviewInput {
  return {
    asOf: '2026-10-24',
    snapshot: {
      total_networth: 100 * L,
      assets: [
        { assetclass_l2: 'Equity', current_value: 40 * L },
        { assetclass_l2: 'Liquid', current_value: 50 * L },
        { assetclass_l2: 'Debt', current_value: 10 * L }
      ]
    },
    holdings: {
      IND_STOCK: [
        { investment: 'Big Oil', investment_code: 'A', market_value: 12 * L },
        { investment: 'Metal Co', investment_code: 'B', market_value: 8 * L },
        { investment: 'Bank', investment_code: 'C', market_value: 20 * L }
      ],
      MF: [
        { investment: 'X ELSS Tax Saver Direct', investment_code: '1', market_value: 1 * L },
        { investment: 'Y Tax Saver Fund Direct', investment_code: '2', market_value: 1 * L },
        { investment: 'Z ELSS Direct', investment_code: '3', market_value: 1 * L },
        { investment: 'Hybrid Fund Regular Plan', investment_code: '4', market_value: 1 * L }
      ]
    },
    sectors: {
      A: { macroSector: 'Energy' },
      B: { macroSector: 'Commodities' },
      C: { macroSector: 'Financial Services' }
    },
    funds: {
      '4': {
        category: 'conservative allocation',
        expenseRatio: 1.4,
        rankTag: 'Lagging',
        rank: '5/10',
        return3y: 8
      }
    },
    // Paise: typical ₹1L/month with one ₹10L spike that the median ignores.
    monthlySpendMinor: [1 * L * 100, 1.2 * L * 100, 10 * L * 100, 0.9 * L * 100, 1 * L * 100],
    profile: {
      age: 34,
      risk: 'medium',
      hasDependents: true,
      termInsurance: null,
      healthInsurance: 'Employer 5L'
    },
    ...over
  }
}

describe('cfo review', () => {
  it('sizes the emergency fund from the median month, not the spike', () => {
    expect(median([1, 3, 2])).toBe(2)
    const r = buildCfoReview(input())
    expect(r.typicalMonthlySpendMinor).toBe(1 * L * 100)
    expect(r.emergencyFundMinor).toBe(6 * L * 100)
    expect(r.investableSurplusMinor).toBe(44 * L * 100)
    expect(r.findings[0]?.id).toBe('idle-cash')
  })

  it('targets equity by age and risk, within bounds', () => {
    expect(targetEquityPct(34, 'medium')).toBe(66)
    expect(targetEquityPct(34, 'low')).toBe(51)
    expect(targetEquityPct(20, 'high')).toBe(85)
    expect(targetEquityPct(null, null)).toBe(60)
  })

  it('flags concentration, fund clutter, costs and missing cover', () => {
    const r = buildCfoReview(input())
    const ids = r.findings.map((f) => f.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'single-stock',
        'sector',
        'fund-clutter',
        'costly-funds',
        'lagging-funds',
        'term-cover'
      ])
    )
    expect(r.funds.elssCount).toBe(3)
    expect(r.stocks.top[0]).toEqual({ name: 'Bank', pct: 50 })
    expect(r.stocks.sectors[0]).toEqual({ name: 'Financial Services', pct: 50 })
    expect(ids).not.toContain('health-cover')
  })

  it('is stable: same input, same numbers', () => {
    expect(buildCfoReview(input())).toEqual(buildCfoReview(input()))
  })
})
