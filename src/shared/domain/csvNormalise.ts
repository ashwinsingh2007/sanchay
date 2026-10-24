import { detectDateOrder, parseDate, type ISODate } from '../dates'
import { parseAmount } from '../money'
import type { ColumnMapping } from '../types'

export interface NormalisedRow {
  /** 1-based line number in the original file, for user-facing warnings. */
  rowNumber: number
  date: ISODate
  description: string
  /** Signed: positive = money in, negative = money out. */
  amountMinor: number
  balanceMinor: number | null
}

export interface RowIssue {
  rowNumber: number
  severity: 'error' | 'warning'
  message: string
}

export interface NormaliseResult {
  rows: NormalisedRow[]
  issues: RowIssue[]
  /** Rows that will not be imported (errors). */
  invalidCount: number
  /** Rows silently skipped (blank lines). */
  blankCount: number
}

const cell = (row: readonly string[], idx: number | null): string =>
  idx == null || idx < 0 ? '' : (row[idx] ?? '').trim()

export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = []
  if (mapping.dateColumn < 0) errors.push('Choose the date column.')
  if (mapping.descriptionColumn < 0) errors.push('Choose the description column.')
  if (
    mapping.amountMode === 'signed' &&
    (mapping.amountColumn == null || mapping.amountColumn < 0)
  ) {
    errors.push('Choose the amount column.')
  }
  if (
    mapping.amountMode === 'debit_credit' &&
    (mapping.debitColumn == null || mapping.debitColumn < 0) &&
    (mapping.creditColumn == null || mapping.creditColumn < 0)
  ) {
    errors.push('Choose the debit and/or credit columns.')
  }
  return errors
}

/**
 * Converts raw CSV rows into normalised, signed, minor-unit rows using a column mapping.
 * Never throws on bad data: problems are reported per row.
 */
export function normaliseRows(
  allRows: readonly string[][],
  mapping: ColumnMapping,
  decimals: number
): NormaliseResult {
  const rows: NormalisedRow[] = []
  const issues: RowIssue[] = []
  let invalidCount = 0
  let blankCount = 0

  const error = (rowNumber: number, message: string): void => {
    issues.push({ rowNumber, severity: 'error', message })
    invalidCount++
  }

  for (let i = mapping.headerRow + 1; i < allRows.length; i++) {
    const raw = allRows[i]!
    const rowNumber = i + 1
    if (raw.every((c) => c.trim() === '')) {
      blankCount++
      continue
    }

    const dateRaw = cell(raw, mapping.dateColumn)
    const description = cell(raw, mapping.descriptionColumn).replace(/\s+/g, ' ')

    let amountMinor: number | null = null
    if (mapping.amountMode === 'signed') {
      const parsed = parseAmount(cell(raw, mapping.amountColumn), decimals)
      if (parsed) {
        if (parsed.marker === 'dr') amountMinor = -Math.abs(parsed.minor)
        else if (parsed.marker === 'cr') amountMinor = Math.abs(parsed.minor)
        else amountMinor = mapping.positiveMeans === 'outflow' ? -parsed.minor : parsed.minor
      }
    } else {
      const debit = parseAmount(cell(raw, mapping.debitColumn), decimals)
      const credit = parseAmount(cell(raw, mapping.creditColumn), decimals)
      if (debit || credit) {
        amountMinor = Math.abs(credit?.minor ?? 0) - Math.abs(debit?.minor ?? 0)
      }
    }

    if (!dateRaw && amountMinor == null) {
      // Footer/summary lines such as "Total" or "Closing balance" with no date.
      issues.push({
        rowNumber,
        severity: 'warning',
        message: `Skipped non-transaction line "${description || raw.join(' ').slice(0, 40)}".`
      })
      blankCount++
      continue
    }

    const date = parseDate(dateRaw, mapping.dateOrder)
    if (!date) {
      error(rowNumber, dateRaw ? `Unrecognised date "${dateRaw}".` : 'Missing date.')
      continue
    }
    if (amountMinor == null) {
      error(rowNumber, 'Missing or unreadable amount.')
      continue
    }
    if (amountMinor === 0) {
      issues.push({ rowNumber, severity: 'warning', message: 'Zero amount — skipped.' })
      blankCount++
      continue
    }

    let finalDescription = description
    if (!finalDescription) {
      finalDescription = 'Unknown transaction'
      issues.push({
        rowNumber,
        severity: 'warning',
        message: 'Missing description — imported as "Unknown transaction".'
      })
    }

    const balance = parseAmount(cell(raw, mapping.balanceColumn), decimals)
    rows.push({
      rowNumber,
      date,
      description: finalDescription,
      amountMinor,
      balanceMinor: balance
        ? balance.marker === 'dr'
          ? -Math.abs(balance.minor)
          : balance.minor
        : null
    })
  }

  return { rows, issues, invalidCount, blankCount }
}

const HEADER_HINTS = [
  'date',
  'description',
  'narration',
  'details',
  'particulars',
  'merchant',
  'remarks',
  'amount',
  'debit',
  'credit',
  'withdrawal',
  'deposit',
  'balance',
  'transaction',
  'reference',
  'value'
]

function headerScore(row: readonly string[]): number {
  return row.filter((c) => {
    const v = c.toLowerCase().trim()
    return v.length > 0 && v.length < 40 && HEADER_HINTS.some((h) => v.includes(h))
  }).length
}

/** Many bank exports start with a preamble (account number, address…). Find the header line. */
export function detectHeaderRow(rows: readonly string[][]): number {
  let best = 0
  let bestScore = 0
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const score = headerScore(rows[i]!)
    if (score > bestScore) {
      best = i
      bestScore = score
    }
    if (score >= 3) return i
  }
  return bestScore >= 2 ? best : 0
}

function findColumn(
  headers: readonly string[],
  candidates: string[],
  exclude: number[] = []
): number {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = lower.findIndex((h, i) => !exclude.includes(i) && h === candidate)
    if (idx >= 0) return idx
  }
  for (const candidate of candidates) {
    if (candidate.length < 4) continue
    const idx = lower.findIndex((h, i) => !exclude.includes(i) && h.includes(candidate))
    if (idx >= 0) return idx
  }
  return -1
}

/** Best-effort initial mapping from headers + sample rows. The user always confirms it. */
export function suggestMapping(rows: readonly string[][], headerRow: number): ColumnMapping {
  const headers = rows[headerRow] ?? []
  const sample = rows.slice(headerRow + 1, headerRow + 40)
  let dateColumn = findColumn(headers, [
    'transaction date',
    'txn date',
    'tran date',
    'trans date',
    'date',
    'posting date',
    'posted',
    'value date'
  ])
  // Unfamiliar header? Pick the column whose values look like dates.
  if (dateColumn < 0)
    dateColumn = columnByContent(
      sample,
      headers.length,
      (v) => parseDate(v, 'dmy') !== null || parseDate(v, 'mdy') !== null
    )
  let descriptionColumn = findColumn(
    headers,
    [
      'description',
      'narration',
      'transaction details',
      'details',
      'particulars',
      'merchant',
      'remarks',
      'payee',
      'name',
      'memo'
    ],
    [dateColumn]
  )
  const debitColumn = findColumn(headers, [
    'debit amount',
    'withdrawal amt',
    'withdrawal',
    'debit',
    'dr',
    'paid out',
    'money out'
  ])
  const creditColumn = findColumn(headers, [
    'credit amount',
    'deposit amt',
    'deposit',
    'credit',
    'cr',
    'paid in',
    'money in'
  ])
  const balanceColumn = findColumn(headers, [
    'balance',
    'closing balance',
    'running balance',
    'running bal',
    'bal'
  ])
  let amountColumn = findColumn(
    headers,
    ['amount', 'transaction amount', 'amt'],
    [dateColumn, debitColumn, creditColumn, balanceColumn]
  )
  const numeric = (v: string): boolean =>
    v.trim() !== '' && parseAmount(v, 2) !== null && /\d/.test(v)
  // No recognisable amount columns: use the first mostly-numeric column that isn't the balance.
  if (amountColumn < 0 && debitColumn < 0 && creditColumn < 0) {
    amountColumn = columnByContent(sample, headers.length, numeric, [dateColumn, balanceColumn])
  }
  // No recognisable description: the column with the longest non-numeric text.
  if (descriptionColumn < 0) {
    let best = -1
    let bestLen = 0
    for (let c = 0; c < headers.length; c++) {
      if ([dateColumn, amountColumn, debitColumn, creditColumn, balanceColumn].includes(c)) continue
      const vals = sample.map((r) => r[c] ?? '').filter((v) => v && !numeric(v))
      const avg = vals.reduce((t, v) => t + v.length, 0) / Math.max(1, sample.length)
      if (avg > bestLen) {
        best = c
        bestLen = avg
      }
    }
    descriptionColumn = best
  }

  const useDebitCredit = debitColumn >= 0 && creditColumn >= 0 && debitColumn !== creditColumn
  const dataRows = rows.slice(headerRow + 1, headerRow + 60)
  const dateOrder = detectDateOrder(
    dataRows.map((r) => (dateColumn >= 0 ? (r[dateColumn] ?? '') : ''))
  )

  // Card exports often list purchases as plain positives and mark payments/refunds with "Cr".
  let positiveMeans: ColumnMapping['positiveMeans'] = 'inflow'
  if (amountColumn >= 0) {
    const parsed = dataRows.map((r) => parseAmount(r[amountColumn], 2)).filter((p) => p != null)
    const credits = parsed.filter((p) => p.marker === 'cr').length
    const plain = parsed.filter((p) => p.marker == null && p.minor > 0).length
    const negatives = parsed.filter((p) => p.marker == null && p.minor < 0).length
    if (credits > 0 && plain > credits && negatives === 0) positiveMeans = 'outflow'
  }

  return {
    headerRow,
    dateColumn,
    descriptionColumn,
    amountMode: useDebitCredit || amountColumn < 0 ? 'debit_credit' : 'signed',
    amountColumn: amountColumn >= 0 ? amountColumn : null,
    positiveMeans,
    debitColumn: debitColumn >= 0 ? debitColumn : null,
    creditColumn: creditColumn >= 0 ? creditColumn : null,
    balanceColumn: balanceColumn >= 0 ? balanceColumn : null,
    dateOrder
  }
}

/** Index of the column where at least 80% of sample values satisfy `test`, or -1. */
function columnByContent(
  sample: readonly string[][],
  width: number,
  test: (v: string) => boolean,
  exclude: number[] = []
): number {
  for (let c = 0; c < width; c++) {
    if (exclude.includes(c)) continue
    const vals = sample.map((r) => (r[c] ?? '').trim()).filter(Boolean)
    if (vals.length >= 2 && vals.filter(test).length / vals.length >= 0.8) return c
  }
  return -1
}
