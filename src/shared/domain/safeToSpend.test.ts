import { describe, expect, it } from 'vitest'
import type { RecurringCommitment } from '../types'
import { computeSafeToSpend, effectiveNextIncomeDate, inferNextIncomeDate } from './safeToSpend'

const commitment = (over: Partial<RecurringCommitment>): RecurringCommitment => ({
  id: over.id ?? 'c',
  merchantKey: over.id ?? 'c',
  merchantName: over.merchantName ?? 'Commitment',
  categoryId: null,
  typicalAmountMinor: 0,
  cadence: 'monthly',
  nextExpectedDate: null,
  lastSeenDate: null,
  confidence: 0.9,
  status: 'active',
  userConfirmed: false,
  userEdited: false,
  linkedTransactionIds: [],
  createdAt: '',
  updatedAt: '',
  ...over
})

const bank = (
  balance: number | null,
  type: 'bank' | 'credit_card' | 'cash' = 'bank',
  id = 'b1'
) => ({
  id,
  name: `Account ${id}`,
  type,
  currentBalanceMinor: balance,
  balanceAsOf: '2026-10-03'
})

const today = '2026-10-03'

describe('safe to spend', () => {
  it('subtracts commitments before next income and the buffer', () => {
    const result = computeSafeToSpend({
      today,
      accounts: [bank(10000000), bank(2000000, 'cash', 'c1'), bank(-5000000, 'credit_card', 'cc')],
      settings: { nextIncomeDate: '2026-11-01', emergencyBufferMinor: 3000000 },
      commitments: [
        commitment({ id: 'emi', typicalAmountMinor: 1240000, nextExpectedDate: '2026-10-05' }),
        commitment({
          id: 'sip',
          typicalAmountMinor: 1500000,
          nextExpectedDate: '2026-10-07',
          status: 'review'
        }),
        commitment({ id: 'after', typicalAmountMinor: 999900, nextExpectedDate: '2026-11-01' }), // on income day: excluded
        commitment({
          id: 'ignored',
          typicalAmountMinor: 500000,
          nextExpectedDate: '2026-10-10',
          status: 'ignored'
        })
      ]
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.availableCashMinor).toBe(12000000) // credit card balance not counted as cash
    expect(result.commitmentsMinor).toBe(2740000)
    expect(result.valueMinor).toBe(12000000 - 2740000 - 3000000)
    expect(result.shortfallMinor).toBe(0)
    expect(result.daysUntilIncome).toBe(29)
    expect(result.dailyAllowanceMinor).toBe(Math.floor(6260000 / 29))
  })

  it('never goes below zero and reports the shortfall', () => {
    const result = computeSafeToSpend({
      today,
      accounts: [bank(1000000)],
      settings: { nextIncomeDate: '2026-11-01', emergencyBufferMinor: 500000 },
      commitments: [commitment({ typicalAmountMinor: 800000, nextExpectedDate: '2026-10-10' })]
    })
    expect(result).toMatchObject({ status: 'ok', valueMinor: 0, shortfallMinor: 300000 })
  })

  it('asks for setup instead of inventing a number', () => {
    expect(
      computeSafeToSpend({
        today,
        accounts: [bank(null)],
        settings: { nextIncomeDate: null, emergencyBufferMinor: 0 },
        commitments: []
      })
    ).toEqual({ status: 'needs_setup', missing: ['balance', 'next_income_date'] })
    expect(
      computeSafeToSpend({
        today,
        accounts: [bank(-100, 'credit_card')],
        settings: { nextIncomeDate: '2026-11-01', emergencyBufferMinor: 0 },
        commitments: []
      })
    ).toEqual({ status: 'needs_setup', missing: ['balance'] })
  })

  it('rolls a past income date forward monthly', () => {
    expect(effectiveNextIncomeDate('2026-08-31', today)).toBe('2026-10-31')
    expect(effectiveNextIncomeDate('2026-10-03', today)).toBe('2026-10-03')
    expect(effectiveNextIncomeDate(null, today)).toBeNull()
  })
})

describe('inferNextIncomeDate', () => {
  const tx = (date: string, merchant: string, amount: number, direction = 'income') => ({
    transactionDate: date,
    merchantNormalised: merchant,
    amountMinor: amount,
    direction
  })
  it('projects the main income source a month forward', () => {
    const txs = [
      tx('2026-08-01', 'Acme', 18500000),
      tx('2026-09-01', 'Acme', 18500000),
      tx('2026-09-28', 'Bank interest', 130000),
      tx('2026-09-20', 'Swiggy', -50000, 'expense')
    ]
    expect(inferNextIncomeDate(txs, '2026-10-03')).toBe('2026-11-01')
    expect(inferNextIncomeDate(txs, '2026-09-15')).toBe('2026-10-01')
  })
  it('returns null without income', () => {
    expect(
      inferNextIncomeDate([tx('2026-09-20', 'Swiggy', -50000, 'expense')], '2026-10-03')
    ).toBeNull()
  })
})
