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

describe('autoMapStatement — ICICI Bank savings account statement', () => {
  it('reads the ICICI layout: Transaction Date (not Value Date), Withdrawal/Deposit columns', () => {
    const r = autoMapStatement(load('sample-icici-statement.csv'), 'ICICI_Statement_Apr2026.csv')
    expect(r.confident).toBe(true)
    expect(r.accountType).toBe('bank')
    expect(r.accountName).toBe('ICICI')
    expect(r.mapping).toMatchObject({
      amountMode: 'debit_credit',
      dateColumn: 2,
      dateOrder: 'dmy',
      descriptionColumn: 4,
      debitColumn: 5,
      creditColumn: 6,
      balanceColumn: 7
    })
    expect(r.parseRate).toBe(1)
    expect(r.parsedRows).toBe(6)
  })

  it('signs deposits positive and withdrawals negative, matching the running balance', () => {
    const rows = load('sample-icici-statement.csv')
    const r = autoMapStatement(rows, 'ICICI_Statement_Apr2026.csv')
    const { rows: parsed } = normaliseRows(rows, r.mapping, 2)
    expect(parsed).toHaveLength(6)
    // Salary deposit.
    expect(parsed[0]).toMatchObject({ date: '2026-04-01', amountMinor: 18_500_000, balanceMinor: 26_025_000 })
    // Rent withdrawal.
    expect(parsed[1]).toMatchObject({ date: '2026-04-03', amountMinor: -4_200_000, balanceMinor: 21_825_000 })
    // Cheque withdrawal.
    expect(parsed[2]).toMatchObject({ date: '2026-04-05', amountMinor: -2_000_000, balanceMinor: 19_825_000 })
    // Interest deposit lands on the closing balance.
    expect(parsed[5]).toMatchObject({ date: '2026-04-20', amountMinor: 48_600, balanceMinor: 19_158_600 })
  })
})
