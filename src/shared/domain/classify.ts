import { parseDate } from '../dates'
import { parseAmount } from '../money'

export interface StatementCheck {
  isStatement: boolean
  /** "high" when the evidence is clear either way; "low" means worth a second opinion. */
  confidence: 'high' | 'low'
  transactionLines: number
  reason: string
}

const KEYWORDS = [
  /statement/i,
  /account|a\/c/i,
  /balance/i,
  /transaction/i,
  /debit|withdrawal/i,
  /credit|deposit/i,
  /narration|particulars|description/i,
  /card/i,
  /ifsc|branch|customer id/i,
  /opening|closing/i
]

/**
 * Is this file a bank or credit-card statement? Looks for many lines that carry both a date and
 * a money amount, plus typical statement vocabulary. Invoices, salary slips, resumes and random
 * spreadsheets fail one of those tests.
 */
export function checkStatement(rows: readonly string[][]): StatementCheck {
  let transactionLines = 0
  for (const row of rows.slice(0, 4000)) {
    const cells = row.map((c) => c.trim()).filter(Boolean)
    const hasDate = cells.some(
      (c) => c.length <= 30 && (parseDate(c, 'dmy') !== null || parseDate(c, 'mdy') !== null)
    )
    const hasAmount = cells.some(
      (c) =>
        c.length <= 24 &&
        /\d/.test(c) &&
        /[.,]\d{2}\b|^\d+$/.test(c) &&
        parseAmount(c, 2) !== null &&
        !/^\d{6,}$/.test(c)
    )
    if (hasDate && hasAmount) transactionLines++
  }
  const text = rows.slice(0, 80).flat().join(' ')
  const keywordHits = KEYWORDS.filter((k) => k.test(text)).length

  if (transactionLines >= 3 && keywordHits >= 3) {
    return {
      isStatement: true,
      confidence: 'high',
      transactionLines,
      reason: `Found ${transactionLines} dated transactions.`
    }
  }
  if (transactionLines >= 3) {
    return {
      isStatement: true,
      confidence: 'low',
      transactionLines,
      reason: `Found ${transactionLines} dated amounts but few statement terms.`
    }
  }
  if (transactionLines > 0) {
    return {
      isStatement: false,
      confidence: 'low',
      transactionLines,
      reason: 'Only a couple of dated amounts — this may not be a statement.'
    }
  }
  return {
    isStatement: false,
    confidence: 'high',
    transactionLines,
    reason: 'No dated transactions found. This doesn’t look like a bank or credit-card statement.'
  }
}
