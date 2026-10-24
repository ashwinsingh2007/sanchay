/**
 * Date helpers working on plain ISO strings ("YYYY-MM-DD") and month keys ("YYYY-MM").
 * All arithmetic is done in UTC so local timezones never shift a transaction date.
 */

export type ISODate = string
export type MonthKey = string
export type DateOrder = 'dmy' | 'mdy' | 'ymd'

const MS_PER_DAY = 86_400_000

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

export function makeISODate(y: number, m: number, d: number): ISODate | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`
}

export function isISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return !!m && makeISODate(Number(m[1]), Number(m[2]), Number(m[3])) !== null
}

function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

function fromUTC(dt: Date): ISODate {
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Today's date in the user's local timezone. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(new Date(toUTC(date).getTime() + days * MS_PER_DAY))
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / MS_PER_DAY)
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate()
}

/** Adds calendar months, clamping the day to the month end (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsClamped(date: ISODate, months: number, preferredDay?: number): ISODate {
  const [y, m, d] = date.split('-').map(Number)
  const total = y! * 12 + (m! - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const day = Math.min(preferredDay ?? d!, daysInMonth(`${pad(ny, 4)}-${pad(nm)}`))
  return `${pad(ny, 4)}-${pad(nm)}-${pad(day)}`
}

export function toMonthKey(date: ISODate): MonthKey {
  return date.slice(0, 7)
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  return toMonthKey(addMonthsClamped(`${month}-01`, n))
}

export function previousMonth(month: MonthKey): MonthKey {
  return addMonths(month, -1)
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`
}

export function monthEnd(month: MonthKey): ISODate {
  return `${month}-${pad(daysInMonth(month))}`
}

/** Whole calendar months from `from` until `to` (floor). Negative if `to` is earlier. */
export function wholeMonthsBetween(from: ISODate, to: ISODate): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  let months = (ty! - fy!) * 12 + (tm! - fm!)
  if (td! < fd!) months -= 1
  return months
}

export function monthLabel(month: MonthKey, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: style,
    year: 'numeric',
    timeZone: 'UTC'
  }).format(toUTC(`${month}-01`))
}

export function monthName(month: MonthKey): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
    toUTC(`${month}-01`)
  )
}

export function formatDate(date: ISODate, style: 'short' | 'medium' = 'medium'): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: style === 'medium' ? 'numeric' : undefined,
    timeZone: 'UTC'
  }).format(toUTC(date))
}

/** Splits a raw date cell into parts, ignoring any trailing time component. */
function dateParts(raw: string): string[] {
  const s = raw
    .trim()
    .replace(/[T\s]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(am|pm)?.*$/i, '')
    .trim()
  return s.split(/[\s\-/.,]+/).filter(Boolean)
}

function fullYear(y: string): number {
  const n = Number(y)
  return y.length <= 2 ? 2000 + n : n
}

/**
 * Parses common statement date formats: 2026-09-01, 01/09/2026, 09/01/2026 (with order),
 * 01-Sep-2026, 1 Sep 26, Sep 1, 2026, 20260901, and the same with trailing times.
 */
export function parseDate(raw: string | null | undefined, order: DateOrder): ISODate | null {
  if (!raw) return null
  const parts = dateParts(String(raw))
  if (parts.length === 1 && /^\d{8}$/.test(parts[0]!)) {
    const p = parts[0]!
    return makeISODate(Number(p.slice(0, 4)), Number(p.slice(4, 6)), Number(p.slice(6, 8)))
  }
  if (parts.length !== 3) return null

  const alphaIdx = parts.findIndex((p) => /^[a-z]+$/i.test(p))
  if (alphaIdx >= 0) {
    const month = MONTH_NAMES[parts[alphaIdx]!.toLowerCase()]
    if (!month) return null
    const rest = parts.filter((_, i) => i !== alphaIdx)
    if (!rest.every((p) => /^\d+$/.test(p))) return null
    if (rest[0]!.length === 4) return makeISODate(Number(rest[0]), month, Number(rest[1]))
    // "01 Sep 2026" or "Sep 01 2026": day comes first among the remaining numbers.
    return makeISODate(fullYear(rest[1]!), month, Number(rest[0]))
  }

  if (!parts.every((p) => /^\d+$/.test(p))) return null
  const [a, b, c] = parts as [string, string, string]
  if (a.length === 4) return makeISODate(Number(a), Number(b), Number(c))
  if (order === 'mdy') return makeISODate(fullYear(c), Number(a), Number(b))
  if (order === 'ymd') return makeISODate(fullYear(a), Number(b), Number(c))
  return makeISODate(fullYear(c), Number(b), Number(a))
}

/** Guesses day/month order from sample values. Defaults to day-first. */
export function detectDateOrder(samples: readonly string[]): DateOrder {
  let firstOver12 = false
  let secondOver12 = false
  let yearFirst = 0
  for (const raw of samples) {
    const parts = dateParts(raw)
    if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) continue
    if (parts[0]!.length === 4) yearFirst++
    else {
      if (Number(parts[0]) > 12) firstOver12 = true
      if (Number(parts[1]) > 12) secondOver12 = true
    }
  }
  if (secondOver12 && !firstOver12) return 'mdy'
  if (yearFirst > 0 && !firstOver12 && !secondOver12) return 'ymd'
  return 'dmy'
}
