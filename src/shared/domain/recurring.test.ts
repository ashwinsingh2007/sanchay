import { describe, expect, it } from 'vitest'
import type { RecurringCommitment } from '../types'
import {
  detectRecurring,
  monthlyEquivalentMinor,
  occurrencesBetween,
  type RecurringInputTx
} from './recurring'

let n = 0
const t = (
  date: string,
  merchant: string,
  amountMinor: number,
  extra: Partial<RecurringInputTx> = {}
): RecurringInputTx => ({
  id: `t${++n}`,
  date,
  merchant,
  amountMinor,
  categoryId: 'subscriptions',
  isTransfer: false,
  ...extra
})

const opts = { amountTolerance: 0.15, referenceDate: '2026-10-03', dataEndDate: '2026-09-30' }

describe('detectRecurring', () => {
  it('detects a monthly subscription and predicts the next charge', () => {
    const txs = ['2026-05-08', '2026-06-08', '2026-07-08', '2026-08-08', '2026-09-08'].map((d) =>
      t(d, 'Netflix', -64900)
    )
    const [c] = detectRecurring(txs, opts)
    expect(c).toMatchObject({
      merchantName: 'Netflix',
      cadence: 'monthly',
      typicalAmountMinor: 64900,
      nextExpectedDate: '2026-10-08',
      suggestedStatus: 'active',
      possiblyEnded: false,
      occurrences: 5
    })
    expect(c!.confidence).toBeGreaterThanOrEqual(0.75)
  })

  it('tolerates small amount changes (e.g. price rise) within tolerance', () => {
    const txs = [
      t('2026-06-12', 'Electricity', -195000),
      t('2026-07-12', 'Electricity', -210000),
      t('2026-08-11', 'Electricity', -220000),
      t('2026-09-12', 'Electricity', -205000)
    ]
    const result = detectRecurring(txs, opts)
    expect(result).toHaveLength(1)
    expect(result[0]!.typicalAmountMinor).toBe(207500)
  })

  it('requires at least three monthly occurrences', () => {
    const txs = [t('2026-08-08', 'Spotify', -11900), t('2026-09-08', 'Spotify', -11900)]
    expect(detectRecurring(txs, opts)).toEqual([])
  })

  it('does not flag frequent variable spending like food delivery', () => {
    const txs: RecurringInputTx[] = []
    for (const m of ['05', '06', '07', '08', '09']) {
      for (const [day, amt] of [
        [2, 45000],
        [9, 31000],
        [15, 52000],
        [21, 45500],
        [27, 28000]
      ] as const) {
        txs.push(
          t(`2026-${m}-${String(day).padStart(2, '0')}`, 'Swiggy', -amt, { categoryId: 'dining' })
        )
      }
    }
    expect(detectRecurring(txs, opts)).toEqual([])
  })

  it('detects quarterly and yearly cadences', () => {
    const quarterly = ['2025-12-28', '2026-03-28', '2026-06-28', '2026-09-28'].map((d) =>
      t(d, 'Gym', -900000)
    )
    const yearly = ['2024-09-19', '2025-09-19'].map((d) => t(d, 'Insurance', -1850000))
    const result = detectRecurring([...quarterly, ...yearly], {
      ...opts,
      dataEndDate: '2026-09-30'
    })
    const gym = result.find((r) => r.merchantName === 'Gym')
    const ins = result.find((r) => r.merchantName === 'Insurance')
    expect(gym?.cadence).toBe('quarterly')
    expect(gym?.nextExpectedDate).toBe('2026-12-28')
    expect(ins?.cadence).toBe('yearly')
    expect(ins?.confidence).toBeLessThanOrEqual(0.6)
    expect(ins?.suggestedStatus).toBe('review')
  })

  it('marks commitments that stopped appearing as possibly ended', () => {
    const txs = ['2026-03-05', '2026-04-05', '2026-05-05'].map((d) => t(d, 'OldApp', -29900))
    const [c] = detectRecurring(txs, opts)
    expect(c!.possiblyEnded).toBe(true)
    expect(c!.suggestedStatus).toBe('review')
  })

  it('ignores income and transfers', () => {
    const txs = ['2026-07-01', '2026-08-01', '2026-09-01'].map((d) => t(d, 'Acme', 18500000))
    const transfers = ['2026-07-18', '2026-08-18', '2026-09-18'].map((d) =>
      t(d, 'Card bill', -2000000, { isTransfer: true })
    )
    expect(detectRecurring([...txs, ...transfers], opts)).toEqual([])
  })

  it('picks the regular cluster when a merchant also has one-off purchases', () => {
    const subs = ['2026-06-03', '2026-07-03', '2026-08-03', '2026-09-03'].map((d) =>
      t(d, 'Amazon', -29900)
    )
    const oneOffs = [t('2026-06-20', 'Amazon', -249900), t('2026-08-14', 'Amazon', -89900)]
    const [c] = detectRecurring([...subs, ...oneOffs], opts)
    expect(c!.typicalAmountMinor).toBe(29900)
    expect(c!.transactionIds).toHaveLength(4)
  })
})

describe('commitment occurrences', () => {
  const commitment = (over: Partial<RecurringCommitment>): RecurringCommitment => ({
    id: 'c1',
    merchantKey: 'x',
    merchantName: 'X',
    categoryId: null,
    typicalAmountMinor: 10000,
    cadence: 'monthly',
    nextExpectedDate: '2026-10-05',
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

  it('lists repeated monthly charges in a long window and skips ignored ones', () => {
    const list = occurrencesBetween(
      [commitment({}), commitment({ id: 'c2', status: 'ignored' })],
      '2026-10-03',
      '2026-12-10'
    )
    expect(list.map((o) => o.date)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05'])
  })

  it('excludes the end date itself', () => {
    expect(occurrencesBetween([commitment({})], '2026-10-01', '2026-10-05')).toEqual([])
  })

  it('converts cadences to a monthly equivalent', () => {
    expect(monthlyEquivalentMinor(120000, 'yearly')).toBe(10000)
    expect(monthlyEquivalentMinor(30000, 'quarterly')).toBe(10000)
    expect(monthlyEquivalentMinor(10000, 'monthly')).toBe(10000)
  })
})
