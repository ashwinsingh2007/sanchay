import { describe, expect, it } from 'vitest'
import { SEED_CATEGORIES } from '../categories'
import type { RecurringCommitment, Transaction } from '../types'
import { directionFor, kindMap } from './cashflow'
import { merchantKey } from './merchant'
import { buildMoneyFlow } from './moneyFlow'
import { suggestionFor } from './suggestions'

const kinds = kindMap(SEED_CATEGORIES)
let seq = 0
function tx(date: string, merchant: string, amountMinor: number, categoryId: string): Transaction {
  const kind = kinds.get(categoryId)
  return {
    id: `t${++seq}`,
    accountId: 'a1',
    importSourceId: null,
    transactionDate: date,
    descriptionOriginal: merchant.toUpperCase(),
    descriptionKey: merchant.toLowerCase(),
    merchantNormalised: merchant,
    amountMinor,
    currency: 'INR',
    direction: directionFor(kind, kind === 'transfer', amountMinor),
    categoryId,
    categoryConfidence: 0.9,
    categorySource: 'keyword',
    isRecurring: false,
    isTransfer: kind === 'transfer',
    notes: null,
    createdAt: ''
  }
}

function sub(t: Transaction[], merchant: string, categoryId: string): RecurringCommitment {
  return {
    id: merchant,
    merchantKey: merchantKey(merchant),
    merchantName: merchant,
    categoryId,
    typicalAmountMinor: Math.abs(t[0]!.amountMinor),
    cadence: 'monthly',
    nextExpectedDate: null,
    lastSeenDate: null,
    confidence: 0.9,
    status: 'active',
    userConfirmed: false,
    userEdited: false,
    linkedTransactionIds: t.map((x) => x.id),
    createdAt: '',
    updatedAt: ''
  }
}

describe('suggestionFor', () => {
  it('offers free alternatives sized from what you pay', () => {
    const s = suggestionFor('Adobe', 'ADOBE SYSTEMS', 'software', 167500, 'INR')
    expect(s).toMatchObject({ kind: 'free', monthlySavingMinor: 167500 })
    expect(s?.alternatives).toContain('Photopea')
  })

  it('returns nothing when there is no sensible suggestion', () => {
    expect(suggestionFor('Dr Mehta Clinic', 'DR MEHTA', 'health', 200000, 'INR')).toBeNull()
    expect(suggestionFor('Amazon', 'AMAZON', 'shopping', 1000, 'INR')).toBeNull() // too small
  })

  it('treats fees as avoidable', () => {
    expect(suggestionFor('Late fee', 'LATE PAYMENT FEE', 'fees', 59000, 'INR')?.kind).toBe('avoid')
  })
})

describe('buildMoneyFlow', () => {
  const netflix = [
    tx('2026-08-05', 'Netflix', -64900, 'subscriptions'),
    tx('2026-09-05', 'Netflix', -64900, 'subscriptions')
  ]
  const hotstar = [
    tx('2026-08-07', 'Hotstar', -29900, 'subscriptions'),
    tx('2026-09-07', 'Hotstar', -29900, 'subscriptions')
  ]
  const txs = [
    ...netflix,
    ...hotstar,
    tx('2026-09-01', 'Acme Salary', 15000000, 'income'),
    tx('2026-09-03', 'Swiggy', -60000, 'dining'),
    tx('2026-09-03', 'Swiggy', -60000, 'dining'),
    tx('2026-09-10', 'To FD', -5000000, 'investments'),
    tx('2026-09-12', 'L&T Finance', -1250000, 'emi'),
    tx('2026-09-15', 'Late fee', -59000, 'fees'),
    tx('2026-09-20', 'Card bill', -2000000, 'transfers'),
    tx('2026-09-21', 'Amazon refund', 120000, 'shopping')
  ]
  const flow = buildMoneyFlow({
    transactions: txs,
    commitments: [
      sub(netflix, 'Netflix', 'subscriptions'),
      sub(hotstar, 'Hotstar', 'subscriptions')
    ],
    kinds,
    month: '2026-09',
    currency: 'INR',
    accountNames: new Map([['a1', 'HDFC']])
  })

  it('splits incoming into income, refunds and own money', () => {
    expect(flow.incoming.groups.map((g) => g.id)).toEqual(['income', 'refunds'])
    expect(flow.incoming.totalMinor).toBe(15120000)
  })

  it('separates spending, investing, debt and money moved', () => {
    expect(flow.outgoing.investingMinor).toBe(5000000)
    expect(flow.outgoing.debtMinor).toBe(1250000)
    expect(flow.outgoing.movedMinor).toBe(2000000)
    expect(flow.outgoing.categories.find((c) => c.categoryId === 'transfers')).toBeUndefined()
  })

  it('never suggests cutting investments or EMIs', () => {
    const keys = flow.outgoing.suggestions.map((s) => s.categoryId)
    expect(keys).not.toContain('investments')
    expect(keys).not.toContain('emi')
    expect(flow.outgoing.suggestions.some((s) => s.merchant === 'Netflix')).toBe(true)
  })

  it('finds hidden costs: fees, overlapping streaming, double charges', () => {
    const kindsFound = flow.outgoing.hidden.map((h) => h.kind)
    expect(kindsFound).toContain('fee')
    expect(kindsFound).toContain('overlap')
    expect(kindsFound).toContain('duplicate')
    expect(flow.outgoing.subscriptions).toHaveLength(2)
  })
})
