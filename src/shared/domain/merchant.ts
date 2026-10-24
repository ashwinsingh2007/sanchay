/**
 * Merchant / description normalisation. The original description is always preserved separately;
 * these helpers only derive cleaner display names and matching keys.
 */

const NOISE_WORDS = new Set([
  'UPI',
  'POS',
  'NEFT',
  'IMPS',
  'RTGS',
  'ACH',
  'NACH',
  'ECS',
  'BIL',
  'BILLPAY',
  'ONL',
  'ECOM',
  'VPS',
  'IPS',
  'MB',
  'IB',
  'INB',
  'DR',
  'CR',
  'TO',
  'FROM',
  'BY',
  'PAYMENT',
  'PAY',
  'TXN',
  'REF',
  'TRANSFER',
  'TRF',
  'P2M',
  'P2A',
  'DEBIT',
  'CREDIT',
  'CARD',
  'PURCHASE',
  'INR',
  'ATW',
  'NWD',
  'D',
  'SI',
  'BBPS',
  'AUTOPAY',
  'MANDATE',
  'ID',
  'NO',
  'VIA',
  'THE',
  'AT',
  'ON',
  'FOR',
  'TPT',
  'OTHERS',
  'COLLECT',
  'REQUEST',
  'SENT',
  'RECEIVED',
  'DIRECT'
])

const SUFFIX_WORDS = new Set([
  'PVT',
  'PRIVATE',
  'LTD',
  'LIMITED',
  'LLP',
  'INC',
  'LLC',
  'CO',
  'CORP',
  'INDIA',
  'IN',
  'COM',
  'WWW'
])

/** Uppercase, punctuation to spaces, collapsed whitespace. Used for keyword / rule matching. */
export function normaliseForMatch(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** Stable key for duplicate detection: case/whitespace-insensitive description. */
export function descriptionKey(description: string): string {
  return description.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Stable key for grouping a merchant across transactions. */
export function merchantKey(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Short forms that should stay uppercase in display names. */
const ACRONYMS = new Set([
  'ATM',
  'EMI',
  'SIP',
  'MF',
  'BSE',
  'NSE',
  'LIC',
  'SBI',
  'HDFC',
  'ICICI',
  'KFC',
  'IKEA',
  'ACT',
  'BSNL',
  'NPS',
  'PPF',
  'FD',
  'RD',
  'GST',
  'IGL',
  'OYO',
  'PVR',
  'HPCL',
  'BPCL',
  'IOCL',
  'SMS',
  'DTH',
  'IRCTC',
  'MMT',
  'USA',
  'UK',
  'AI',
  'TV',
  'QTR',
  'HSBC',
  'AXIS',
  'IDFC',
  'YES',
  'BMS'
])

function titleCase(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => {
      const upper = w.toUpperCase()
      if (ACRONYMS.has(upper) || (/\d/.test(w) && w.length <= 4)) return upper
      return upper.charAt(0) + upper.slice(1).toLowerCase()
    })
    .join(' ')
}

function isMeaningfulWord(word: string): boolean {
  if (word.length < 2 && !/^[A-Z0-9]$/.test(word)) return false
  if (NOISE_WORDS.has(word)) return false
  if (/^\d+$/.test(word)) return false
  // Reference-like tokens: mostly digits, or long alphanumeric codes.
  const digits = (word.match(/\d/g) ?? []).length
  if (digits >= 4 || (digits > 0 && digits / word.length > 0.4)) return false
  return true
}

/**
 * Derives a readable merchant name from a raw bank description.
 * "UPI/412345678901/SWIGGY/swiggy@icici/Payment" -> "Swiggy"
 * "NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY SEP" -> "Acme Technologies"
 */
export function cleanMerchantName(description: string): string {
  const upper = description
    .toUpperCase()
    .replace(/[^\s/|,;-]+@[^\s/|,;-]+/g, ' ') // UPI VPAs / emails
    .replace(/\b\d*[X*]{2,}\d*\b/g, ' ') // masked card / account numbers
    .replace(/\s+/g, ' ')

  const segments = upper.split(/[/\-|:_*#,;~]+|\s{2,}/)
  for (const segment of segments) {
    const words = segment
      .trim()
      .replace(/[^A-Z0-9&' .]/g, ' ')
      .split(/[\s.]+/)
      .filter(Boolean)
      .filter(isMeaningfulWord)
    while (words.length > 1 && SUFFIX_WORDS.has(words[words.length - 1]!)) words.pop()
    const meaningful = words.filter((w) => !SUFFIX_WORDS.has(w) || words.length === 1)
    if (meaningful.length > 0 && meaningful.join('').length >= 2) {
      return titleCase(meaningful.slice(0, 4).join(' '))
    }
  }
  const fallback = titleCase(description.replace(/\s+/g, ' ').trim().slice(0, 40))
  return fallback || 'Unknown'
}
