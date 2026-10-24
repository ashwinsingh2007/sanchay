import type { AccountType, ColumnMapping } from '../types'
import { detectHeaderRow, normaliseRows, suggestMapping, validateMapping } from './csvNormalise'

export interface AutoMapResult {
  mapping: ColumnMapping
  confident: boolean
  /** Human-readable reasons when not confident. */
  reasons: string[]
  accountType: AccountType
  accountName: string
  parsedRows: number
  parseRate: number
}

/**
 * Checks a sign convention against the statement's running balance: if balance[i] - balance[i-1]
 * equals the signed amount for most consecutive rows, the mapping (and its sign) is right.
 * Works for files sorted oldest-first or newest-first. Returns null when there is no balance.
 */
export function balanceAgreement(
  rows: { amountMinor: number; balanceMinor: number | null }[]
): number | null {
  const pairs = rows.filter((r) => r.balanceMinor != null)
  if (pairs.length < 4) return null
  let fwd = 0
  let back = 0
  for (let i = 1; i < pairs.length; i++) {
    const delta = pairs[i]!.balanceMinor! - pairs[i - 1]!.balanceMinor!
    if (delta === pairs[i]!.amountMinor) fwd++
    if (-delta === pairs[i - 1]!.amountMinor) back++
  }
  return Math.max(fwd, back) / (pairs.length - 1)
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
}

/** A friendly account name from the file name, e.g. "hdfc_statement_sep-2026.csv" → "HDFC Statement". */
export function accountNameFromFile(filename: string, type: AccountType): string {
  const base = filename
    .replace(/\.(csv|txt|pdf)$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\d*\b/gi, ' ')
    .replace(/\b\d{1,4}\b/g, ' ')
    .replace(/\b(statement|stmt|export|transactions?|download|account|acct)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const known = /^(hdfc|icici|sbi|axis|kotak|idfc|rbl|yes|hsbc|amex|indusind|au|federal)$/i
  const words = base
    .split(' ')
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => (known.test(w) || w.length <= 3 ? w.toUpperCase() : titleCase(w)))
  const fallback = type === 'credit_card' ? 'Credit card' : 'Bank account'
  if (words.length === 0) return fallback
  const name = words.join(' ')
  return type === 'credit_card' && !/card/i.test(name) ? `${name} card` : name
}

/**
 * Works out how to read a statement with no user input: header row, columns, date order, the sign
 * convention, account type and a name. `confident` is true only when the result checks out against
 * the data itself (parse rate, and running balance when present).
 */
export function autoMapStatement(
  rows: readonly string[][],
  filename: string,
  decimals = 2
): AutoMapResult {
  const headerRow = detectHeaderRow(rows)
  const base = suggestMapping(rows, headerRow)
  const reasons: string[] = []
  const preamble = rows.slice(0, headerRow).flat().join(' ')
  const cardHint = /\b(credit\s*card|card\s*statement|card\s*no|card\s*number)\b/i.test(
    `${preamble} ${filename}`
  )

  let mapping = base
  let accountType: AccountType = cardHint ? 'credit_card' : 'bank'

  if (validateMapping(mapping).length) {
    return {
      mapping,
      confident: false,
      reasons: validateMapping(mapping),
      accountType,
      accountName: accountNameFromFile(filename, accountType),
      parsedRows: 0,
      parseRate: 0
    }
  }

  if (mapping.amountMode === 'signed') {
    // Try both sign conventions; prefer the one the running balance confirms.
    const inflow = normaliseRows(rows, { ...mapping, positiveMeans: 'inflow' }, decimals)
    const outflow = normaliseRows(rows, { ...mapping, positiveMeans: 'outflow' }, decimals)
    const bIn = balanceAgreement(inflow.rows)
    const bOut = balanceAgreement(outflow.rows)
    if (bIn != null || bOut != null) {
      mapping = { ...mapping, positiveMeans: (bOut ?? 0) > (bIn ?? 0) ? 'outflow' : 'inflow' }
    } else if (mapping.positiveMeans === 'outflow' || cardHint) {
      mapping = { ...mapping, positiveMeans: 'outflow' }
    } else {
      // No balance and no Cr markers: if every amount is positive it's almost certainly a card
      // export listing purchases; mixed signs mean the bank convention (negative = money out).
      const signs = inflow.rows.map((r) => Math.sign(r.amountMinor))
      if (signs.length > 0 && signs.every((x) => x > 0)) {
        mapping = { ...mapping, positiveMeans: 'outflow' }
        accountType = 'credit_card'
        reasons.push('All amounts are positive, so we treated them as card spending.')
      }
    }
    // Card exports rarely carry a running balance; a statement with one is a bank account.
    if (mapping.positiveMeans === 'outflow' && mapping.balanceColumn == null)
      accountType = 'credit_card'
    if (mapping.balanceColumn != null && !cardHint) accountType = 'bank'
  }

  const result = normaliseRows(rows, mapping, decimals)
  const dataRows = rows.length - headerRow - 1 - result.blankCount
  const parseRate = dataRows > 0 ? result.rows.length / dataRows : 0
  const balance = balanceAgreement(result.rows)

  let confident = result.rows.length >= 1 && parseRate >= 0.9
  if (!confident) reasons.push(`Only ${Math.round(parseRate * 100)}% of rows could be read.`)
  if (balance != null && balance < 0.7) {
    confident = false
    reasons.push('Amounts don’t add up to the running balance — columns may be mixed up.')
  }

  return {
    mapping,
    confident,
    reasons,
    accountType,
    accountName: accountNameFromFile(filename, accountType),
    parsedRows: result.rows.length,
    parseRate
  }
}
