/**
 * Money helpers. All amounts are integer minor units (paise, cents…).
 * Floating point is only used for display ratios (percentages), never for stored amounts.
 */

export interface CurrencyInfo {
  code: string
  name: string
  decimals: number
  locale: string
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', name: 'Indian Rupee', decimals: 2, locale: 'en-IN' },
  { code: 'USD', name: 'US Dollar', decimals: 2, locale: 'en-US' },
  { code: 'EUR', name: 'Euro', decimals: 2, locale: 'en-IE' },
  { code: 'GBP', name: 'British Pound', decimals: 2, locale: 'en-GB' },
  { code: 'AED', name: 'UAE Dirham', decimals: 2, locale: 'en-AE' },
  { code: 'SGD', name: 'Singapore Dollar', decimals: 2, locale: 'en-SG' },
  { code: 'AUD', name: 'Australian Dollar', decimals: 2, locale: 'en-AU' },
  { code: 'CAD', name: 'Canadian Dollar', decimals: 2, locale: 'en-CA' },
  { code: 'JPY', name: 'Japanese Yen', decimals: 0, locale: 'ja-JP' }
]

export const DEFAULT_CURRENCY = 'INR'

export function currencyInfo(code: string): CurrencyInfo {
  return (
    CURRENCIES.find((c) => c.code === code) ?? { code, name: code, decimals: 2, locale: 'en-US' }
  )
}

function assertSafe(n: number): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Amount out of safe integer range: ${n}`)
  return n
}

export function sumMinor(values: readonly number[]): number {
  let total = 0
  for (const v of values) total = assertSafe(total + v)
  return total
}

/** Integer average, rounded half away from zero. */
export function averageMinor(values: readonly number[]): number {
  if (values.length === 0) return 0
  const total = sumMinor(values)
  return Math.sign(total) * Math.round(Math.abs(total) / values.length)
}

export function medianMinor(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/** Percentage of `part` over `whole`, one decimal place. */
export function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null
  return Math.round((part / whole) * 1000) / 10
}

/** (income - expenses) / income * 100. Null when income is zero or negative. */
export function savingRate(incomeMinor: number, expensesMinor: number): number | null {
  if (incomeMinor <= 0) return null
  return percentOf(incomeMinor - expensesMinor, incomeMinor)
}

export interface ParsedAmount {
  /** Signed value from minus sign / parentheses. Dr/Cr markers are reported separately. */
  minor: number
  marker: 'dr' | 'cr' | null
}

/**
 * Parses a human/bank formatted amount string into integer minor units without floats.
 * Handles: "1,234.56", "₹ 1,23,456.00", "(500.00)", "500.00-", "-500", "1.234,56", "250.00 Dr", "CR 90".
 */
export function parseAmount(raw: string | null | undefined, decimals: number): ParsedAmount | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (s === '' || s === '-' || s === '—') return null

  let marker: ParsedAmount['marker'] = null
  const markerMatch = s.match(/(?<![a-z])(dr|cr)\.?\s*$/i) ?? s.match(/^\s*(dr|cr)\.?(?![a-z])/i)
  if (markerMatch) {
    marker = markerMatch[1]!.toLowerCase() as 'dr' | 'cr'
    s = s.replace(markerMatch[0], '').trim()
  }

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[^\d.,\-+]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.endsWith('-')) {
    negative = !negative
    s = s.slice(0, -1)
  }
  s = s.replace(/^\+/, '')
  if (s === '' || /[-+]/.test(s)) return null

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let intPart: string
  let fracPart = ''
  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? '.' : ','
    const idx = Math.max(lastDot, lastComma)
    intPart = s.slice(0, idx).replace(/[.,]/g, '')
    fracPart = s.slice(idx + 1)
    if (fracPart.includes(decSep === '.' ? ',' : '.')) return null
  } else if (lastComma >= 0) {
    const commaCount = (s.match(/,/g) ?? []).length
    const after = s.slice(lastComma + 1)
    if (commaCount === 1 && after.length > 0 && after.length <= 2) {
      intPart = s.slice(0, lastComma)
      fracPart = after
    } else {
      intPart = s.replace(/,/g, '')
    }
  } else if (lastDot >= 0) {
    const dotCount = (s.match(/\./g) ?? []).length
    if (dotCount > 1) {
      // "1.234.567" thousands separators
      intPart = s.replace(/\./g, '')
    } else {
      intPart = s.slice(0, lastDot)
      fracPart = s.slice(lastDot + 1)
    }
  } else {
    intPart = s
  }
  if (intPart === '') intPart = '0'
  if (!/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) return null

  // Round extra fractional digits half-up using string digits only.
  let frac = fracPart.padEnd(decimals, '0')
  let roundUp = false
  if (frac.length > decimals) {
    roundUp = Number(frac[decimals]) >= 5
    frac = frac.slice(0, decimals)
  }
  // Long digit runs are reference / account / card numbers, not money (₹10 trillion+ is not a
  // transaction). Treat them as "not an amount" instead of failing the whole file.
  if (intPart.replace(/^0+/, '').length > 13) return null
  const scale = 10 ** decimals
  let minor = Number(intPart) * scale + (decimals > 0 ? Number(frac) : 0)
  if (roundUp) minor += 1
  if (!Number.isSafeInteger(minor)) return null
  return { minor: negative ? -minor : minor, marker }
}

/** Parses user-typed form input (e.g. "15,000" or "15000.50") into minor units. Null if empty/invalid. */
export function parseMoneyInput(raw: string, currency: string): number | null {
  const parsed = parseAmount(raw, currencyInfo(currency).decimals)
  return parsed ? Math.abs(parsed.minor) : null
}

/** Exact decimal string for a minor amount: (-123456, 2) -> "-1234.56". */
export function minorToDecimalString(minor: number, decimals: number): string {
  assertSafe(minor)
  const negative = minor < 0
  const abs = String(Math.abs(minor)).padStart(decimals + 1, '0')
  const intPart = decimals > 0 ? abs.slice(0, -decimals) : abs
  const frac = decimals > 0 ? abs.slice(-decimals) : ''
  return `${negative ? '-' : ''}${intPart}${frac ? '.' + frac : ''}`
}

/** Plain editable value for inputs, e.g. 1500000 -> "15000" (drops trailing zero cents). */
export function minorToInputValue(minor: number | null | undefined, currency: string): string {
  if (minor == null) return ''
  const s = minorToDecimalString(minor, currencyInfo(currency).decimals)
  return s.replace(/\.0+$/, '')
}

export interface FormatOptions {
  /** Show minor units (e.g. ₹1,234.50). Default false: whole units. */
  precise?: boolean
  /** Prefix positive values with "+". */
  signed?: boolean
  /** Compact notation (₹1.2L / $12K) for chart axes. */
  compact?: boolean
}

const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: string, opts: FormatOptions): Intl.NumberFormat {
  const key = `${currency}|${opts.precise ? 1 : 0}|${opts.signed ? 1 : 0}|${opts.compact ? 1 : 0}`
  let f = formatterCache.get(key)
  if (!f) {
    const info = currencyInfo(currency)
    f = new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: opts.precise ? info.decimals : 0,
      maximumFractionDigits: opts.compact ? 1 : opts.precise ? info.decimals : 0,
      signDisplay: opts.signed ? 'exceptZero' : 'auto',
      notation: opts.compact ? 'compact' : 'standard'
    })
    formatterCache.set(key, f)
  }
  return f
}

export function formatMoney(minor: number, currency: string, opts: FormatOptions = {}): string {
  const decimal = minorToDecimalString(minor, currencyInfo(currency).decimals)
  // Intl accepts exact decimal strings, so no float conversion is involved in rounding.
  return getFormatter(currency, opts).format(decimal as unknown as number)
}

export function formatPercent(value: number | null, opts: { signed?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = opts.signed && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1).replace(/\.0$/, '')}%`
}
