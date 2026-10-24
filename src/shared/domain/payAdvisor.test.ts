import { describe, expect, it } from 'vitest'
import { SEED_CATEGORIES } from '../categories'
import type { Transaction } from '../types'
import { directionFor, kindMap } from './cashflow'
import { adviseCards, payChannel, payTipFor } from './payAdvisor'

const kinds = kindMap(SEED_CATEGORIES)
let seq = 0
function tx(
  date: string,
  merchant: string,
  desc: string,
  amountMinor: number,
  categoryId: string
): Transaction {
  const kind = kinds.get(categoryId)
  return {
    id: `t${++seq}`,
    accountId: 'a1',
    importSourceId: null,
    transactionDate: date,
    descriptionOriginal: desc,
    descriptionKey: desc.toLowerCase(),
    merchantNormalised: merchant,
    amountMinor,
    currency: 'INR',
    direction: directionFor(kind, kind === 'transfer', amountMinor),
    categoryId,
    categoryConfidence: 0.9,
    categorySource: 'keyword',
    isRecurring: false,
    isTransfer: false,
    notes: null,
    createdAt: ''
  }
}

describe('payChannel', () => {
  it('reads how a payment was made', () => {
    expect(payChannel('UPI/SWIGGY/swiggy@icici/Payment')).toBe('upi')
    expect(payChannel('NACH DR NETFLIX')).toBe('autodebit')
    expect(payChannel('POS 4321XXXX1234 STARBUCKS')).toBe('card')
    expect(payChannel('ATM WDL MG ROAD')).toBe('cash')
    expect(payChannel('SWIGGY BANGALORE', 'credit_card')).toBe('card')
  })
})

describe('payTipFor', () => {
  it('points Swiggy to the co-branded card', () => {
    const tip = payTipFor({
      merchant: 'Swiggy',
      description: 'UPI/SWIGGY',
      categoryId: 'dining',
      monthlyMinor: 500000,
      channel: 'upi'
    })
    expect(tip?.best.label).toContain('Swiggy HDFC')
    expect(tip?.monthlyGainMinor).toBe(50000)
  })

  it('suggests RuPay-on-UPI for a kirana paid from the bank', () => {
    const tip = payTipFor({
      merchant: 'Sharma Kirana',
      description: 'UPI/SHARMA KIRANA/x@ybl',
      categoryId: 'groceries',
      monthlyMinor: 800000,
      channel: 'upi'
    })
    expect(tip?.playbookId).toBe('upi-shops')
  })

  it('stays quiet for tiny amounts and for investments', () => {
    expect(
      payTipFor({
        merchant: 'Swiggy',
        description: 'SWIGGY',
        categoryId: 'dining',
        monthlyMinor: 10000,
        channel: 'upi'
      })
    ).toBeNull()
    expect(
      payTipFor({
        merchant: 'Zerodha',
        description: 'ZERODHA',
        categoryId: 'investments',
        monthlyMinor: 5000000,
        channel: 'bank'
      })
    ).toBeNull()
  })
})

describe('adviseCards', () => {
  const txs: Transaction[] = []
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    txs.push(tx(`${m}-03`, 'Swiggy', 'UPI/SWIGGY/swiggy@icici', -800000, 'dining'))
    txs.push(tx(`${m}-05`, 'Kirana Store', 'UPI/KIRANA STORE/k@ybl', -600000, 'groceries'))
    txs.push(tx(`${m}-09`, 'Amazon', 'AMAZON PAY INDIA', -400000, 'shopping'))
    txs.push(tx(`${m}-10`, 'House Rent', 'NEFT RENT', -3000000, 'housing'))
  }
  const advice = adviseCards({
    transactions: txs,
    kinds,
    month: '2026-09',
    accountTypes: new Map(),
    currency: 'INR'
  })

  it('excludes rent and reports UPI share', () => {
    expect(advice.annualSpendMinor).toBe((800000 + 600000 + 400000) * 12)
    expect(advice.upiSharePct).toBe(78)
  })

  it('ranks a card that wins on this spending first, and only RuPay earns on shop QR payments', () => {
    expect(advice.cards[0]!.netAnnualGainMinor).toBeGreaterThan(0)
    const visaOnly = advice.cards.find((c) => c.cardId === 'sbi-cashback')!
    const rupay = advice.cards.find((c) => c.cardId === 'kiwi-yes-rupay')!
    expect(rupay.why.join(' ')).toMatch(/Kirana|everything else/)
    expect(visaOnly.annualRewardMinor).toBeGreaterThan(0)
  })

  it('may suggest a two-card combo', () => {
    if (advice.combo)
      expect(advice.combo.netAnnualGainMinor).toBeGreaterThan(advice.cards[0]!.netAnnualGainMinor)
  })
})
