import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'
import { autoMapStatement } from './autoMap'
import { normaliseRows } from './csvNormalise'

const load = (name: string): string[][] =>
  parse(readFileSync(join(__dirname, '../../../fixtures', name), 'utf8'), {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true
  }) as string[][]

describe('autoMapStatement — SBI savings account statement', () => {
  it('reads the SBI layout: account-details preamble, Txn Date header, Debit/Credit columns', () => {
    const r = autoMapStatement(load('sample-sbi-statement.csv'), 'SBI_Statement_Apr2026.csv')
    expect(r.confident).toBe(true)
    expect(r.accountType).toBe('bank')
    expect(r.accountName).toBe('SBI')
    expect(r.mapping).toMatchObject({
      amountMode: 'debit_credit',
      dateColumn: 0,
      descriptionColumn: 2,
      debitColumn: 4,
      creditColumn: 5,
      balanceColumn: 6
    })
    expect(r.parseRate).toBe(1)
    expect(r.parsedRows).toBe(5)
  })

  it('signs credits positive and debits negative, matching the running balance', () => {
    const rows = load('sample-sbi-statement.csv')
    const r = autoMapStatement(rows, 'SBI_Statement_Apr2026.csv')
    const { rows: parsed } = normaliseRows(rows, r.mapping, 2)
    expect(parsed).toHaveLength(5)
    // Salary credit.
    expect(parsed[0]).toMatchObject({ date: '2026-04-01', amountMinor: 8_500_000, balanceMinor: 13_500_000 })
    // Rent debit.
    expect(parsed[1]).toMatchObject({ date: '2026-04-03', amountMinor: -2_500_000, balanceMinor: 11_000_000 })
    // Interest credit, in the Credit column with an empty Debit cell.
    expect(parsed[3]).toMatchObject({ date: '2026-04-07', amountMinor: 61_200, balanceMinor: 10_061_200 })
    // Final UPI debit lands on the closing balance.
    expect(parsed[4]).toMatchObject({ date: '2026-04-10', amountMinor: -84_500, balanceMinor: 9_976_700 })
  })
})
