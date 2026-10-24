import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'
import { detectDateOrder, parseDate } from '../dates'
import type { ColumnMapping } from '../types'
import { detectHeaderRow, normaliseRows, suggestMapping, validateMapping } from './csvNormalise'

const base: ColumnMapping = {
  headerRow: 0,
  dateColumn: 0,
  descriptionColumn: 1,
  amountMode: 'debit_credit',
  amountColumn: null,
  positiveMeans: 'inflow',
  debitColumn: 2,
  creditColumn: 3,
  balanceColumn: 4,
  dateOrder: 'dmy'
}

describe('parseDate', () => {
  it.each([
    ['2026-09-01', 'dmy', '2026-09-01'],
    ['01/09/2026', 'dmy', '2026-09-01'],
    ['09/01/2026', 'mdy', '2026-09-01'],
    ['01-09-26', 'dmy', '2026-09-01'],
    ['01-Sep-2026', 'dmy', '2026-09-01'],
    ['1 Sept 2026', 'dmy', '2026-09-01'],
    ['Sep 1, 2026', 'mdy', '2026-09-01'],
    ['2026/09/01', 'dmy', '2026-09-01'],
    ['20260901', 'dmy', '2026-09-01'],
    ['01/09/2026 14:32:10', 'dmy', '2026-09-01'],
    ['2026-09-01T10:00:00Z', 'dmy', '2026-09-01']
  ] as const)('%s (%s) -> %s', (raw, order, expected) => {
    expect(parseDate(raw, order)).toBe(expected)
  })

  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2026', 'dmy')).toBeNull()
    expect(parseDate('hello', 'dmy')).toBeNull()
    expect(parseDate('', 'dmy')).toBeNull()
  })

  it('detects date order from samples', () => {
    expect(detectDateOrder(['13/01/2026', '02/03/2026'])).toBe('dmy')
    expect(detectDateOrder(['01/13/2026', '02/03/2026'])).toBe('mdy')
    expect(detectDateOrder(['02/03/2026'])).toBe('dmy')
  })
})

describe('normaliseRows', () => {
  it('turns debit/credit columns into signed minor units', () => {
    const rows = [
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['01/09/2026', 'SALARY', '', '1,85,000.00', '2,00,000.00'],
      ['03/09/2026', 'RENT', '42,000.00', '', '1,58,000.00']
    ]
    const result = normaliseRows(rows, base, 2)
    expect(result.issues).toEqual([])
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        date: '2026-09-01',
        description: 'SALARY',
        amountMinor: 18500000,
        balanceMinor: 20000000
      },
      {
        rowNumber: 3,
        date: '2026-09-03',
        description: 'RENT',
        amountMinor: -4200000,
        balanceMinor: 15800000
      }
    ])
  })

  it('supports a single signed column where positive means outflow (card exports)', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['2026-09-05', 'NETFLIX', '649.00'],
      ['2026-09-18', 'PAYMENT RECEIVED', '5,000.00 Cr']
    ]
    const mapping: ColumnMapping = {
      ...base,
      amountMode: 'signed',
      amountColumn: 2,
      debitColumn: null,
      creditColumn: null,
      balanceColumn: null,
      positiveMeans: 'outflow'
    }
    const result = normaliseRows(rows, mapping, 2)
    expect(result.rows.map((r) => r.amountMinor)).toEqual([-64900, 500000])
  })

  it('reports invalid rows without throwing and skips blank/footer lines', () => {
    const rows = [
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      ['32/09/2026', 'BAD DATE', '10', '', ''],
      ['02/09/2026', 'NO AMOUNT', '', '', ''],
      ['', '', '', '', ''],
      ['', 'Closing balance', '', '', '1,000.00'],
      ['03/09/2026', '', '50', '', ''],
      ['04/09/2026', 'ZERO', '0.00', '', '']
    ]
    const result = normaliseRows(rows, base, 2)
    expect(result.invalidCount).toBe(2)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.description).toBe('Unknown transaction')
    expect(result.issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber)).toEqual([
      2, 3
    ])
  })

  it('validates incomplete mappings', () => {
    expect(validateMapping({ ...base, dateColumn: -1 })).toContain('Choose the date column.')
    expect(validateMapping({ ...base, debitColumn: null, creditColumn: null })).toHaveLength(1)
    expect(validateMapping(base)).toEqual([])
  })
})

describe('sign detection', () => {
  it('assumes positive = money out when payments are marked Cr', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['01/09/2026', 'NETFLIX', '649.00'],
      ['02/09/2026', 'SWIGGY', '420.00'],
      ['18/09/2026', 'PAYMENT RECEIVED', '5,000.00 Cr']
    ]
    expect(suggestMapping(rows, 0)).toMatchObject({
      amountMode: 'signed',
      amountColumn: 2,
      positiveMeans: 'outflow'
    })
  })
  it('keeps positive = money in for ordinary signed exports', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['01/09/2026', 'SALARY', '1000.00'],
      ['02/09/2026', 'SWIGGY', '-420.00']
    ]
    expect(suggestMapping(rows, 0).positiveMeans).toBe('inflow')
  })
})

describe('fixture CSV', () => {
  const text = readFileSync(join(__dirname, '../../../fixtures/sample-bank-statement.csv'), 'utf8')
  const rows = parse(text, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true
  }) as string[][]

  it('detects the header row after the bank preamble and suggests a mapping', () => {
    const header = detectHeaderRow(rows)
    expect(rows[header]![0]).toBe('Date')
    const mapping = suggestMapping(rows, header)
    expect(mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountMode: 'debit_credit',
      debitColumn: 3,
      creditColumn: 4,
      balanceColumn: 5,
      dateOrder: 'dmy'
    })
    const result = normaliseRows(rows, mapping, 2)
    expect(result.invalidCount).toBe(0)
    expect(result.rows.length).toBeGreaterThan(70)
    expect(result.rows.every((r) => r.date >= '2026-04-01' && r.date <= '2026-09-30')).toBe(true)
  })
})
