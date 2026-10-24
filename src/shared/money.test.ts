import { describe, expect, it } from 'vitest'
import {
  averageMinor,
  formatMoney,
  medianMinor,
  minorToDecimalString,
  parseAmount,
  parseMoneyInput,
  savingRate,
  sumMinor
} from './money'

describe('parseAmount', () => {
  const p = (s: string, d = 2) => parseAmount(s, d)

  it('parses plain and thousands-separated amounts into minor units', () => {
    expect(p('1234.56')).toEqual({ minor: 123456, marker: null })
    expect(p('1,234.56')?.minor).toBe(123456)
    expect(p('₹ 1,23,456.00')?.minor).toBe(12345600)
    expect(p('$12')?.minor).toBe(1200)
    expect(p('0.1')?.minor).toBe(10)
  })

  it('never introduces floating point error', () => {
    // 0.1 + 0.2 style values stay exact
    expect(p('0.29')?.minor).toBe(29)
    expect(p('1.005')?.minor).toBe(101) // rounds half-up on the third decimal
    expect(p('19.99')?.minor).toBe(1999)
  })

  it('handles negative notations', () => {
    expect(p('-500')?.minor).toBe(-50000)
    expect(p('(500.00)')?.minor).toBe(-50000)
    expect(p('500.00-')?.minor).toBe(-50000)
  })

  it('reports Dr/Cr markers separately', () => {
    expect(p('250.00 Dr')).toEqual({ minor: 25000, marker: 'dr' })
    expect(p('1,000.00 Cr')).toEqual({ minor: 100000, marker: 'cr' })
    expect(p('90CR')).toEqual({ minor: 9000, marker: 'cr' })
  })

  it('supports European decimal commas', () => {
    expect(p('1.234,56')?.minor).toBe(123456)
    expect(p('12,5')?.minor).toBe(1250)
  })

  it('returns null for empty or garbage input', () => {
    expect(p('')).toBeNull()
    expect(p('  ')).toBeNull()
    expect(p('-')).toBeNull()
    expect(p('abc')).toBeNull()
    expect(p('1-2')).toBeNull()
  })

  it('treats long reference numbers as not-an-amount instead of failing', () => {
    expect(p('330422026031177600')).toBeNull()
    expect(p('3304220260311776')).toBeNull()
    expect(p('99,99,99,99,999.00')?.minor).toBe(9999999999900)
  })

  it('respects zero-decimal currencies', () => {
    expect(parseAmount('1,200', 0)?.minor).toBe(1200)
  })
})

describe('money arithmetic', () => {
  it('sums, averages and medians integers exactly', () => {
    expect(sumMinor([10, 20, -5])).toBe(25)
    expect(averageMinor([100, 101])).toBe(101)
    expect(averageMinor([-100, -101])).toBe(-101)
    expect(averageMinor([])).toBe(0)
    expect(medianMinor([5, 1, 3])).toBe(3)
    expect(medianMinor([1, 2, 3, 4])).toBe(3)
  })

  it('throws instead of silently overflowing', () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError)
  })

  it('calculates saving rate and handles zero income', () => {
    expect(savingRate(100000, 75000)).toBe(25)
    expect(savingRate(300000, 100000)).toBe(66.7)
    expect(savingRate(100000, 120000)).toBe(-20)
    expect(savingRate(0, 5000)).toBeNull()
  })
})

describe('formatting', () => {
  it('converts minor units to exact decimal strings', () => {
    expect(minorToDecimalString(123456, 2)).toBe('1234.56')
    expect(minorToDecimalString(-5, 2)).toBe('-0.05')
    expect(minorToDecimalString(1200, 0)).toBe('1200')
  })

  it('formats INR with Indian grouping', () => {
    expect(formatMoney(1425000, 'INR')).toBe('₹14,250')
    expect(formatMoney(1234567890, 'INR')).toBe('₹1,23,45,679')
    expect(formatMoney(123456, 'INR', { precise: true })).toBe('₹1,234.56')
    expect(formatMoney(420000, 'INR', { signed: true })).toBe('+₹4,200')
  })

  it('parses form input', () => {
    expect(parseMoneyInput('15,000', 'INR')).toBe(1500000)
    expect(parseMoneyInput('', 'INR')).toBeNull()
  })
})
