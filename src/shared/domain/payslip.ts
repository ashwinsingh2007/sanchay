import { addMonths, toMonthKey, type MonthKey } from '../dates'
import { parseAmount, sumMinor } from '../money'
import type { Payslip, PayslipLine, SalaryProfile, Transaction } from '../types'
import type { PdfTextItem } from './pdfTable'

/** Plain text lines of a PDF, top to bottom, left to right. */
export function pdfLines(pages: readonly (readonly PdfTextItem[])[]): string[] {
  const out: string[] = []
  for (const items of pages) {
    const rows = new Map<number, PdfTextItem[]>()
    for (const it of items) {
      if (!it.str.trim()) continue
      const key = Math.round(it.y / 3)
      rows.set(key, [...(rows.get(key) ?? []), it])
    }
    for (const key of [...rows.keys()].sort((a, b) => b - a)) {
      const row = rows.get(key)!.sort((a, b) => a.x - b.x)
      let line = ''
      let lastEnd = -Infinity
      for (const it of row) {
        line += (it.x - lastEnd > 6 && line ? '   ' : line ? ' ' : '') + it.str.trim()
        lastEnd = it.x + it.width
      }
      out.push(line.trim())
    }
  }
  return out
}

const PAYSLIP_WORDS = [
  /pay\s*slip/i,
  /salary\s*slip/i,
  /salary\s*statement/i,
  /\bearnings\b/i,
  /\bdeductions\b/i,
  /net\s*(pay|salary|amount)/i,
  /take\s*home/i,
  /\bbasic\b/i,
  /\bh\.?r\.?a\b|house\s*rent/i,
  /provident\s*fund|\bp\.?f\b|\bepf\b/i,
  /professional\s*tax/i,
  /income\s*tax|\btds\b/i
]

/** True when the text reads like a salary slip rather than a bank statement. */
export function isPayslip(lines: readonly string[]): boolean {
  const text = lines.slice(0, 120).join('\n')
  const score = PAYSLIP_WORDS.filter((r) => r.test(text)).length
  return score >= 5 && /net\s*(pay|salary|amount)|take\s*home/i.test(text)
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]

/** "Payslip for the month of September 2026", "Sep-26", "09/2026"… */
export function payslipPeriod(lines: readonly string[]): MonthKey | null {
  const text = lines.slice(0, 40).join(' ').toLowerCase()
  const named =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,'’.-]*(\d{4}|\d{2})\b/.exec(
      text
    )
  if (named) {
    const m = MONTHS.findIndex((x) => x.startsWith(named[1]!.slice(0, 3))) + 1
    let y = Number(named[2])
    if (y < 100) y += 2000
    if (m > 0 && y > 2000 && y < 2100) return `${y}-${String(m).padStart(2, '0')}`
  }
  const numeric = /\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/.exec(text)
  if (numeric) return `${numeric[2]}-${numeric[1]!.padStart(2, '0')}`
  return null
}

/** Every "Label   12,345.00" pair on the slip (two-column slips give two pairs per line). */
export function labelAmountPairs(lines: readonly string[]): PayslipLine[] {
  const out: PayslipLine[] = []
  const re =
    /([A-Za-z][A-Za-z0-9 .&/()'%-]{1,48}?)\s*[:-]?\s*(?:₹|Rs\.?|INR)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?=\s|$)/g
  for (const line of lines) {
    for (const m of line.matchAll(re)) {
      const label = m[1]!.replace(/\s+/g, ' ').trim()
      if (
        label.length < 2 ||
        /^(page|no|sl|s no|date|year|month|days?|pan|uan|esic?|a\/c|account)\b/i.test(label)
      )
        continue
      const amt = parseAmount(m[2]!, 2)
      if (!amt || amt.minor <= 0) continue
      out.push({ label, amountMinor: amt.minor })
    }
  }
  return out
}

const pick = (pairs: readonly PayslipLine[], ...patterns: RegExp[]): number | null => {
  for (const p of patterns) {
    const hit = pairs.find((x) => p.test(x.label))
    if (hit) return hit.amountMinor
  }
  return null
}

const EARNING =
  /basic|h\.?r\.?a|house rent|special|allowance|conveyance|lta|leave travel|bonus|incentive|overtime|arrear|medical|reimburse|perquisite|variable|commission|stipend|da\b|dearness|transport|food|meal|telephone|internet|shift/i
const DEDUCTION =
  /provident|\bp\.?f\b|epf|vpf|professional tax|\bp\.?t\b|income tax|\btds\b|esi|nps|labour welfare|lwf|loan|advance|recovery|insurance|canteen|gratuity/i

/**
 * Pulls the salary structure out of a payslip's text. Returns null when the key numbers can't be
 * found or don't add up.
 */
export function parsePayslip(
  lines: readonly string[],
  fileHash: string,
  filename: string
): Omit<Payslip, 'id' | 'createdAt'> | null {
  const pairs = labelAmountPairs(lines)
  const gross = pick(pairs, /gross (earnings|salary|pay)|total earnings|total gross|gross$/i)
  const totalDeductions = pick(pairs, /total deductions?|deductions total|gross deductions/i)
  const net = pick(pairs, /net (pay|salary|amount|payable)|take ?home|amount (credited|payable)/i)
  const earnings = pairs.filter((p) => EARNING.test(p.label) && !/total|gross|net/i.test(p.label))
  const deductions = pairs.filter(
    (p) => DEDUCTION.test(p.label) && !/total|gross|net/i.test(p.label)
  )
  const dedupe = (list: PayslipLine[]): PayslipLine[] => {
    const seen = new Set<string>()
    return list.filter((p) => {
      const k = p.label.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  const e = dedupe(earnings)
  const d = dedupe(deductions)
  const grossMinor = gross ?? (e.length ? sumMinor(e.map((x) => x.amountMinor)) : null)
  const deductionsMinor = totalDeductions ?? (d.length ? sumMinor(d.map((x) => x.amountMinor)) : 0)
  const netMinor = net ?? (grossMinor != null ? grossMinor - deductionsMinor : null)
  if (grossMinor == null || netMinor == null || netMinor <= 0 || netMinor > grossMinor) return null

  const employer =
    lines
      .slice(0, 8)
      .find((l) =>
        /(pvt|private|ltd|limited|llp|inc|technologies|solutions|services|corporation|company)\b/i.test(
          l
        )
      )
      ?.replace(/\s{2,}.*/, '')
      .trim() ?? null

  return {
    period: payslipPeriod(lines),
    employer,
    grossMinor,
    netMinor,
    deductionsMinor: grossMinor - netMinor,
    basicMinor: pick(e, /basic/i),
    hraMinor: pick(e, /h\.?r\.?a|house rent/i),
    pfMinor: pick(d, /provident|\bp\.?f\b|epf/i),
    vpfMinor: pick(d, /vpf|voluntary/i),
    npsMinor: pick(d, /\bnps\b/i),
    taxMinor: pick(d, /income tax|\btds\b/i),
    professionalTaxMinor: pick(d, /professional tax|\bp\.?t\b/i),
    earnings: e,
    deductions: d,
    fileHash,
    filename
  }
}

/** Financial year (India, April–March) a month belongs to, e.g. "FY 2026-27". */
export function financialYear(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const start = m >= 4 ? y : y - 1
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/**
 * What the payslips say about the user's salary, and how it lines up with the bank statements.
 */
export function buildSalaryProfile(
  payslips: readonly Payslip[],
  transactions: readonly Transaction[]
): SalaryProfile | null {
  const dated = payslips.filter((p) => p.period).sort((a, b) => b.period!.localeCompare(a.period!))
  const latest = dated[0] ?? payslips[0]
  if (!latest) return null
  const fy = latest.period ? financialYear(latest.period) : null
  const sameFy = fy ? dated.filter((p) => financialYear(p.period!) === fy) : [latest]
  const sum = (f: (p: Payslip) => number | null): number => sumMinor(sameFy.map((p) => f(p) ?? 0))

  // Was this net pay credited to the bank? Look for an income within ±3% around the pay month.
  let creditedMinor: number | null = null
  if (latest.period) {
    const window = new Set([latest.period, addMonths(latest.period, 1)])
    const credit = transactions.find(
      (t) =>
        t.amountMinor > 0 &&
        window.has(toMonthKey(t.transactionDate)) &&
        Math.abs(t.amountMinor - latest.netMinor) <= latest.netMinor * 0.03
    )
    creditedMinor = credit?.amountMinor ?? null
  }

  const retirementMonthly = (latest.pfMinor ?? 0) + (latest.vpfMinor ?? 0) + (latest.npsMinor ?? 0)
  return {
    latestPeriod: latest.period,
    employer: latest.employer,
    grossMonthlyMinor: latest.grossMinor,
    netMonthlyMinor: latest.netMinor,
    annualGrossMinor: latest.grossMinor * 12,
    takeHomePct: Math.round((latest.netMinor / latest.grossMinor) * 1000) / 10,
    taxMonthlyMinor: latest.taxMinor ?? 0,
    retirementMonthlyMinor: retirementMonthly,
    financialYear: fy,
    fyTaxMinor: sum((p) => p.taxMinor),
    fyRetirementMinor: sum((p) => (p.pfMinor ?? 0) + (p.vpfMinor ?? 0) + (p.npsMinor ?? 0)),
    fyGrossMinor: sum((p) => p.grossMinor),
    payslipsInFy: sameFy.length,
    creditedMinor,
    creditMatches: creditedMinor != null,
    trend: dated
      .slice(0, 12)
      .reverse()
      .map((p) => ({ period: p.period!, grossMinor: p.grossMinor, netMinor: p.netMinor }))
  }
}

/** Plain-text salary summary for the AI CFO. */
export function salarySummary(p: SalaryProfile, fmt: (m: number) => string): string {
  return [
    `Latest slip ${p.latestPeriod ?? 'unknown month'}${p.employer ? ` from ${p.employer}` : ''}: gross ${fmt(p.grossMonthlyMinor)}/month, take-home ${fmt(p.netMonthlyMinor)}/month (${p.takeHomePct}% of gross), income tax ${fmt(p.taxMonthlyMinor)}/month, PF/VPF/NPS ${fmt(p.retirementMonthlyMinor)}/month.`,
    `Annual gross ≈ ${fmt(p.annualGrossMinor)}.${p.financialYear ? ` ${p.financialYear} so far (${p.payslipsInFy} slips): gross ${fmt(p.fyGrossMinor)}, tax ${fmt(p.fyTaxMinor)}, PF/NPS ${fmt(p.fyRetirementMinor)}.` : ''}`,
    p.creditMatches
      ? `Salary credit found in the bank: ${fmt(p.creditedMinor!)}.`
      : 'No bank credit matching this take-home was found in the statements.',
    p.trend.length > 1
      ? `Trend: ${p.trend.map((t) => `${t.period} net ${fmt(t.netMinor)}`).join(', ')}.`
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}
