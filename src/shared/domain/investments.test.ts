import { describe, expect, it } from 'vitest'
import { SEED_CATEGORIES } from '../categories'
import type { Transaction } from '../types'
import { directionFor, kindMap } from './cashflow'
import { buildInvestmentReport, investmentType } from './investments'

const kinds = kindMap(SEED_CATEGORIES)
let seq = 0
function tx(
  date: string,
  desc: string,
  amountMinor: number,
  categoryId = 'investments'
): Transaction {
  const kind = kinds.get(categoryId)
  return {
    id: `t${++seq}`,
    accountId: 'a1',
    importSourceId: null,
    transactionDate: date,
    descriptionOriginal: desc,
    descriptionKey: desc.toLowerCase(),
    merchantNormalised: desc,
    amountMinor,
    currency: 'INR',
    direction: directionFor(kind, false, amountMinor),
    categoryId,
    categoryConfidence: 0.9,
    categorySource: 'keyword',
    isRecurring: false,
    isTransfer: false,
    notes: null,
    createdAt: ''
  }
}

describe('investmentType', () => {
  it.each([
    ['ACH D- BSE STAR MF SIP-123', 'mf'],
    ['TO FD 99887766', 'fd'],
    ['RD INSTALMENT 202609', 'fd'],
    ['UPI/ZERODHA BROKING', 'stocks'],
    ['NPS CONTRIBUTION PROTEAN', 'retirement'],
    ['SAFEGOLD DIGITAL GOLD', 'gold'],
    ['SOMETHING ELSE', 'other']
  ])('%s -> %s', (d, t) => expect(investmentType(d)).toBe(t))
})

describe('buildInvestmentReport', () => {
  const txs = ['2026-07', '2026-08', '2026-09'].flatMap((m) => [
    tx(`${m}-05`, 'ACH D- BSE STAR MF SIP', -500000),
    tx(`${m}-10`, 'GROCERY', -100000, 'groceries')
  ])
  txs.push(tx('2026-09-12', 'TO FD 123', -5000000))
  const r = buildInvestmentReport({ transactions: txs, kinds, month: '2026-09' })

  it('splits by type and projects recurring SIPs only', () => {
    expect(r.thisMonthMinor).toBe(5500000)
    expect(r.expectedMonthlyMinor).toBe(500000)
    expect(r.next12MonthsMinor).toBe(6000000)
    expect(r.series.filter((s) => s.projected)).toHaveLength(3)
    expect(r.recurring.map((x) => x.type)).toEqual(['mf'])
  })
})
