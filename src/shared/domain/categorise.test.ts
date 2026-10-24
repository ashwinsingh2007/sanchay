import { describe, expect, it } from 'vitest'
import type { MerchantRule } from '../types'
import {
  AiMemoryProvider,
  aiMemoryKey,
  Categoriser,
  isAutoDebit,
  type CategorisationProvider
} from './categorise'
import { cleanMerchantName } from './merchant'

describe('cleanMerchantName', () => {
  it.each([
    ['UPI/412345678901/SWIGGY/swiggy@icici/Payment', 'Swiggy'],
    ['NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY SEP', 'Acme Technologies'],
    ['POS 4321XXXXXX1234 BLUE DOOR BAKERY', 'Blue Door Bakery'],
    ['IMPS-P2A-5523412233-CLIENT DESIGN PROJECT', 'Client Design Project'],
    ['ACH D- BSE STAR MF SIP-123456789', 'BSE Star MF SIP'],
    ['NACH DR-CAR LOAN EMI-73156604', 'Car Loan EMI']
  ])('%s -> %s', (raw, expected) => {
    expect(cleanMerchantName(raw)).toBe(expected)
  })
})

describe('Categoriser', () => {
  const c = new Categoriser([])

  it('uses seeded keyword rules with sensible merchants', () => {
    expect(c.categorise({ description: 'SWIGGY BANGALORE IN', amountMinor: -45000 })).toMatchObject(
      {
        categoryId: 'dining',
        merchantNormalised: 'Swiggy',
        source: 'keyword'
      }
    )
    expect(c.categorise({ description: 'SWIGGY INSTAMART', amountMinor: -45000 }).categoryId).toBe(
      'groceries'
    )
    expect(
      c.categorise({ description: 'AMAZON PRIME MEMBERSHIP', amountMinor: -149900 }).categoryId
    ).toBe('subscriptions')
    expect(
      c.categorise({ description: 'AMAZON PAY INDIA PVT LTD 123', amountMinor: -149900 }).categoryId
    ).toBe('shopping')
    expect(c.categorise({ description: 'UBER EATS', amountMinor: -50000 }).categoryId).toBe(
      'dining'
    )
    expect(
      c.categorise({ description: 'UBER INDIA SYSTEMS', amountMinor: -50000 }).categoryId
    ).toBe('transport')
    expect(
      c.categorise({ description: 'CC BILL PAYMENT - CARD XX9921', amountMinor: -5000000 })
        .categoryId
    ).toBe('transfers')
  })

  it('matches whole words only', () => {
    // "CURRENT" must not match the RENT rule
    expect(
      c.categorise({ description: 'CURRENT ACCOUNT XYZ', amountMinor: -1000 }).categoryId
    ).toBe('other')
  })

  it('only treats inflows as salary', () => {
    expect(c.categorise({ description: 'SALARY SEP', amountMinor: 18500000 }).categoryId).toBe(
      'income'
    )
    expect(
      c.categorise({ description: 'SALARY ADVANCE REPAY', amountMinor: -100 }).categoryId
    ).not.toBe('income')
  })

  it('lowers confidence for refunds into spending categories', () => {
    const r = c.categorise({ description: 'MYNTRA DESIGNS REFUND', amountMinor: 129900 })
    expect(r.categoryId).toBe('shopping')
    expect(r.confidence).toBeLessThan(0.6)
  })

  it('falls back to low-confidence "needs review"', () => {
    const r = c.categorise({ description: 'UPI/123/RAVI K/ravik@okbank', amountMinor: -600000 })
    expect(r).toMatchObject({
      categoryId: 'other',
      source: 'fallback',
      merchantNormalised: 'Ravi K'
    })
    expect(r.confidence).toBeLessThan(0.5)
    expect(c.categorise({ description: 'IMPS FROM SOMEONE', amountMinor: 100 }).categoryId).toBe(
      'income'
    )
  })

  it('applies user rules first, by priority', () => {
    const rules: MerchantRule[] = [
      {
        id: 'r1',
        matchType: 'contains',
        matchValue: 'ravi k',
        merchantNormalised: 'Ravi (rent share)',
        categoryId: 'housing',
        priority: 100,
        createdAt: '1'
      },
      {
        id: 'r2',
        matchType: 'regex',
        matchValue: '^UPI/\\d+/RAVI',
        merchantNormalised: null,
        categoryId: 'transfers',
        priority: 200,
        createdAt: '2'
      },
      {
        id: 'r3',
        matchType: 'exact',
        matchValue: 'Swiggy',
        merchantNormalised: null,
        categoryId: 'groceries',
        priority: 50,
        createdAt: '3'
      }
    ]
    const withRules = new Categoriser(rules)
    expect(
      withRules.categorise({ description: 'UPI/123/RAVI K/ravik@okbank', amountMinor: -600000 })
    ).toMatchObject({
      categoryId: 'transfers',
      source: 'user_rule',
      ruleId: 'r2',
      confidence: 1
    })
    expect(
      withRules.categorise({ description: 'IMPS RAVI K', amountMinor: -600000 })
    ).toMatchObject({
      categoryId: 'housing',
      merchantNormalised: 'Ravi (rent share)'
    })
    expect(
      withRules.categorise({ description: 'UPI/1/SWIGGY/x@y', amountMinor: -1 }).categoryId
    ).toBe('groceries')
  })

  it('accepts additional providers (future local AI) before the fallback', () => {
    const ai: CategorisationProvider = {
      name: 'fake-ai',
      categorise: () => ({
        categoryId: 'education',
        merchantNormalised: 'Course',
        confidence: 0.65,
        source: 'keyword'
      })
    }
    expect(
      new Categoriser([], [ai]).categorise({ description: 'MYSTERY', amountMinor: -1 }).categoryId
    ).toBe('education')
  })
})

describe('Categoriser — where the money actually goes', () => {
  const c = new Categoriser([])
  const cat = (description: string, amountMinor = -100000): string =>
    c.categorise({ description, amountMinor }).categoryId

  it.each([
    ['NACH DR L&T FINANCE LTD 12345', 'emi'],
    ['ACH D- LTFS PERSONAL LOAN', 'emi'],
    ['BAJAJ FINANCE LTD EMI', 'emi'],
    ['TATA CAPITAL FINANCIAL SERVICES', 'emi'],
    ['UPI/KREDITBEE/repay@axis', 'emi'],
    ['TO FD 1234567890', 'investments'],
    ['FIXED DEPOSIT BOOKING A/C 9988', 'investments'],
    ['RD INSTALMENT 202609', 'investments'],
    ['ACH D- BSE STAR MF SIP-123456789', 'investments'],
    ['UPI/ZERODHA BROKING/zerodha@hdfc', 'investments'],
    ['NPS CONTRIBUTION PROTEAN', 'investments'],
    ['HDFC LIFE INSURANCE PREMIUM', 'insurance'],
    ['AWS EMEA aws.amazon.com', 'software'],
    ['GITHUB INC', 'software'],
    ['OPENAI CHATGPT SUBSCR', 'software'],
    ['CINEPOLIS INDIA PVT LTD', 'entertainment'],
    ['NETFLIX.COM', 'subscriptions']
  ])('%s -> %s', (description, expected) => {
    expect(cat(description)).toBe(expected)
  })

  it('treats FD maturity and fund redemptions as your own money returning, not income', () => {
    expect(cat('FD CLOSURE PROCEEDS 1234', 250000)).toBe('transfers')
    expect(cat('MF REDEMPTION AXIS MUTUAL', 250000)).toBe('transfers')
    expect(cat('SALARY SEP ACME', 250000)).toBe('income')
  })

  it('does not mistake road addresses for recurring deposits', () => {
    expect(cat('POS BLUE DOOR BAKERY MG RD')).not.toBe('investments')
  })
})

describe('auto-debits and AI memory', () => {
  it('flags mandates', () => {
    expect(isAutoDebit('NACH DR-SOMETHING 123')).toBe(true)
    expect(isAutoDebit('ECS/ACME/456')).toBe(true)
    expect(isAutoDebit('UPI AUTOPAY SPOTIFY')).toBe(true)
    expect(isAutoDebit('POS STARBUCKS')).toBe(false)
  })

  it('reuses what the AI learned for a merchant, per direction', () => {
    const memory = new Map([[aiMemoryKey('UPI/RANDOM TRADERS/rt@ybl', -5000), 'shopping']])
    const c = new Categoriser([], [new AiMemoryProvider(memory)])
    expect(
      c.categorise({ description: 'UPI/RANDOM TRADERS/xx@okaxis', amountMinor: -9900 })
    ).toMatchObject({ categoryId: 'shopping', source: 'ai' })
    expect(
      c.categorise({ description: 'UPI/RANDOM TRADERS/xx@okaxis', amountMinor: 9900 }).source
    ).toBe('fallback')
  })
})
