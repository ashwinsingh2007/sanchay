import { describe, expect, it } from 'vitest'
import { dedupeKey, descriptionSimilarity, matchDuplicates, partitionDuplicates } from './dedupe'

const tx = (date: string, description: string, amountMinor: number, accountId = 'acc1') => ({
  accountId,
  date,
  description,
  amountMinor
})

describe('description similarity', () => {
  it('treats the same merchant with different reference numbers as the same', () => {
    expect(
      descriptionSimilarity(
        'UPI/412345678901/SWIGGY/swiggy@icici/Payment',
        'UPI/998877665544/SWIGGY/swiggy@icici/Payment'
      )
    ).toBeGreaterThanOrEqual(0.9)
    expect(descriptionSimilarity('NETFLIX.COM MUMBAI', 'Netflix.com  Mumbai')).toBe(1)
  })

  it('scores unrelated merchants low', () => {
    expect(descriptionSimilarity('SWIGGY BANGALORE', 'ZOMATO BANGALORE')).toBeLessThan(0.5)
  })
})

describe('duplicate detection', () => {
  it('normalises case and whitespace in exact keys', () => {
    expect(dedupeKey(tx('2026-09-01', 'SWIGGY  Bangalore', -500))).toBe(
      dedupeKey(tx('2026-09-01', 'swiggy bangalore ', -500))
    )
  })

  it('skips everything when the same statement is imported twice', () => {
    const rows = [tx('2026-09-01', 'A STORE', -100), tx('2026-09-02', 'B STORE', -200)]
    const { fresh, duplicates } = partitionDuplicates(rows, rows)
    expect(fresh).toHaveLength(0)
    expect(duplicates).toHaveLength(2)
  })

  it('imports only the new rows of an overlapping statement', () => {
    const existing = [tx('2026-09-01', 'A STORE', -100), tx('2026-09-02', 'B STORE', -200)]
    const incoming = [tx('2026-09-02', 'B STORE', -200), tx('2026-09-03', 'C STORE', -300)]
    const { fresh, duplicates } = partitionDuplicates(incoming, existing)
    expect(fresh.map((r) => r.description)).toEqual(['C STORE'])
    expect(duplicates.map((r) => r.description)).toEqual(['B STORE'])
  })

  it('matches a different export of the same transaction (new ref number, value date +1)', () => {
    const existing = [tx('2026-09-05', 'UPI/111111111111/BIGBASKET/bb@okbank/Groceries', -342000)]
    const incoming = [tx('2026-09-06', 'UPI-222222222222-BIGBASKET-GROCERIES', -342000)]
    expect(partitionDuplicates(incoming, existing).duplicates).toHaveLength(1)
  })

  it('does not merge different merchants or different amounts', () => {
    const existing = [tx('2026-09-05', 'SWIGGY BANGALORE', -45000)]
    expect(
      partitionDuplicates([tx('2026-09-05', 'ZOMATO BANGALORE', -45000)], existing).fresh
    ).toHaveLength(1)
    expect(
      partitionDuplicates([tx('2026-09-05', 'SWIGGY BANGALORE', -45100)], existing).fresh
    ).toHaveLength(1)
    expect(
      partitionDuplicates([tx('2026-09-05', 'SWIGGY BANGALORE', 45000)], existing).fresh
    ).toHaveLength(1)
  })

  it('keeps genuine identical transactions on the same day (one-to-one matching)', () => {
    const coffee = tx('2026-09-05', 'STARBUCKS', -35000)
    const { fresh, duplicates } = partitionDuplicates([coffee, { ...coffee }], [coffee])
    expect(fresh).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
    expect(partitionDuplicates([coffee, { ...coffee }], []).fresh).toHaveLength(2)
  })

  it('prefers exact-date matches before ±1 day ones', () => {
    const existing = [tx('2026-09-05', 'SWIGGY', -40000), tx('2026-09-06', 'SWIGGY', -40000)]
    const incoming = [tx('2026-09-06', 'SWIGGY', -40000), tx('2026-09-07', 'SWIGGY', -40000)]
    const r = matchDuplicates(incoming, existing)
    expect(r.duplicates.find((d) => d.incoming.date === '2026-09-06')?.existing.date).toBe(
      '2026-09-06'
    )
    // 7 Sept is two days from the only unused candidate (5 Sept), so it's a genuinely new order.
    expect(r.duplicates).toHaveLength(1)
    expect(r.fresh.map((t) => t.date)).toEqual(['2026-09-07'])
  })
})
