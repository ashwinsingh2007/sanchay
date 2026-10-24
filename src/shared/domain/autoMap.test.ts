import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'
import { accountNameFromFile, autoMapStatement } from './autoMap'

const load = (name: string): string[][] =>
  parse(readFileSync(join(__dirname, '../../../fixtures', name), 'utf8'), {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true
  }) as string[][]

describe('autoMapStatement', () => {
  it('reads a bank statement with a preamble and debit/credit/balance columns', () => {
    const r = autoMapStatement(load('sample-bank-statement.csv'), 'HDFC_Statement_Sep2026.csv')
    expect(r.confident).toBe(true)
    expect(r.accountType).toBe('bank')
    expect(r.accountName).toBe('HDFC')
    expect(r.mapping).toMatchObject({
      amountMode: 'debit_credit',
      dateOrder: 'dmy',
      balanceColumn: 5
    })
    expect(r.parseRate).toBe(1)
  })

  it('reads a card export where purchases are positive and payments are marked Cr', () => {
    const r = autoMapStatement(load('sample-credit-card.csv'), 'card-export.csv')
    expect(r.confident).toBe(true)
    expect(r.accountType).toBe('credit_card')
    expect(r.mapping).toMatchObject({ amountMode: 'signed', positiveMeans: 'outflow' })
  })

  it('uses the running balance to pick the sign of a single amount column', () => {
    const rows = [
      ['Posted', 'Payee', 'Amount', 'Running Bal'],
      ['09/28/2026', 'COFFEE', '4.50', '995.50'],
      ['09/29/2026', 'PAYROLL', '2000.00', '2995.50'],
      ['09/30/2026', 'RENT', '1200.00', '1795.50'],
      ['10/01/2026', 'GROCER', '80.00', '1715.50'],
      ['10/13/2026', 'GYM', '40.00', '1675.50']
    ]
    // Payroll is the only deposit; everything else is spending — no Cr markers, no minus signs.
    rows[2]![2] = '-2000.00'
    rows.forEach((r, i) => i > 0 && i !== 2 && (r[2] = r[2]!))
    const r = autoMapStatement(rows, 'chase.csv')
    expect(r.mapping.dateOrder).toBe('mdy')
    expect(r.mapping.amountMode).toBe('signed')
    // Balance falls when amounts are positive → positive means money out.
    expect(r.mapping.positiveMeans).toBe('outflow')
    expect(r.accountType).toBe('bank') // has a running balance, so it's a bank account
    expect(r.confident).toBe(true)
  })

  it('treats an all-positive export with no balance as card spending', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['2026-09-01', 'NETFLIX', '649.00'],
      ['2026-09-03', 'SWIGGY', '420.00'],
      ['2026-09-07', 'UBER', '230.00']
    ]
    const r = autoMapStatement(rows, 'export.csv')
    expect(r.mapping.positiveMeans).toBe('outflow')
    expect(r.accountType).toBe('credit_card')
    expect(r.confident).toBe(true)
  })

  it('asks for review when it cannot find the columns', () => {
    const rows = [
      ['foo', 'bar'],
      ['x', 'y'],
      ['z', 'w']
    ]
    const r = autoMapStatement(rows, 'weird.csv')
    expect(r.confident).toBe(false)
    expect(r.reasons.length).toBeGreaterThan(0)
  })
})

describe('accountNameFromFile', () => {
  it('builds a friendly name', () => {
    expect(accountNameFromFile('icici_acct_statement_oct-2026.csv', 'bank')).toBe('ICICI')
    expect(accountNameFromFile('amex-gold.csv', 'credit_card')).toBe('AMEX Gold card')
    expect(accountNameFromFile('2026-09.csv', 'bank')).toBe('Bank account')
    expect(accountNameFromFile('HDFC Statement Sep 2026.pdf', 'bank')).toBe('HDFC')
  })
})
