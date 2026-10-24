/**
 * Parser for Indian Consolidated Account Statements (CAS): NSDL and CDSL demat CAS, and the
 * CAMS / KFintech mutual-fund CAS (detailed and summary). Works on the plain text lines from
 * `pdfLines`, where cells on one row are separated by 3+ spaces and wrapped cells become
 * separate lines. Never extracts PAN, investor names, addresses, emails or phone numbers.
 *
 * Layouts and rules adapted from casparser (MIT), https://github.com/codereverser/casparser
 */
import { makeISODate } from '../dates'

export type CasKind = 'nsdl' | 'cdsl' | 'cams' | 'kfintech'

export interface CasHolding {
  kind: 'equity' | 'mutual_fund' | 'etf' | 'bond' | 'other'
  name: string
  isin: string | null
  units: number
  /** Market price / NAV in rupees. */
  price: number | null
  /** Current value in rupees. */
  value: number
  /** Invested amount in rupees, when the statement prints it. */
  cost: number | null
  folio: string | null
  amc: string | null
}

export interface CasAccount {
  type: 'demat' | 'mf_folios'
  label: string
  /** Masked to the last 4 characters, e.g. "••1234". */
  dpId: string | null
  holdings: CasHolding[]
  value: number
}

export interface CasStatement {
  kind: CasKind
  /** ISO period end / "as on" date. */
  statementDate: string | null
  periodStart: string | null
  accounts: CasAccount[]
  totalValue: number
  /** Anything skipped or ambiguous. */
  warnings: string[]
}

// --- shared patterns ---

const ISIN_TOKEN = /\bIN[A-Z0-9]{9}\d\b/
// Detection only trusts equity / MF ISINs (INE…, INF…); bank narrations rarely carry them.
const DETECT_ISIN = /\bIN[EF][0-9A-Z]{8}\d\b/
const CAS_PHRASE = /consolidated\s+account\s+(statement|summary)/i
const DATE_SRC = String.raw`\d{1,2}[-/ ](?:[A-Za-z]{3,9}|\d{1,2})[-/ ]\d{4}`
const PERIOD_RE = new RegExp(String.raw`(${DATE_SRC})\s+to\s+(${DATE_SRC})`, 'i')
const AS_ON_RE = new RegExp(String.raw`as\s+on\s+(${DATE_SRC})`, 'i')
const DATE_CELL = new RegExp(String.raw`^${DATE_SRC}$`)
// Indian grouping ("1,23,456.78"), optional sign / parentheses, and a bare ".196" fraction.
const NUMBER_CELL = /^\(?-?[₹`]?\s?(?:\d[\d,]*(?:\.\d+)?|\.\d+)\)?%?$/
const PLACEHOLDER_CELL = /^(?:-+|n\.?a\.?|nil)$/i
const PERIOD_NOISE = new RegExp(String.raw`(?:period|as\s+on)\b.*${DATE_SRC}`, 'i')
const TOTAL_LINE = /^(?:sub[\s-]*total|grand\s+total|portfolio\s+total|total)\b/i
const AMC_LINE = /^[A-Za-z][A-Za-z&.' ()-]+\s(?:MF|Mutual\s*Fund|Fund\s*House)$/i
const WATERMARK = /(?:CAMS|KFIN|NSDL|CDSL)CASWS/i
const FOLIO_SLASH = /^\d+\s*\/\s*\d+$/
const FOLIO_TAIL = /^\d+\/\d+$/
// UCC / ticker / distributor codes that sit under the ISIN or in their own column.
const CODE_LIKE = /^(?=[A-Z0-9.&-]*\d)(?=[A-Z0-9.&-]*[A-Z])[A-Z0-9.&-]+$/
const DISTRIBUTOR = /^(?:ARN-?\d+|INA\d+|DIRECT|REGULAR|EXECUTION ONLY|NOT AVAILABLE|N\.?A\.?|@)$/i
const CORPORATE =
  /\b(?:LIMITED|LTD|BROKING|BROKERS?|SECURITIES|BANK|CAPITAL|FINANCIAL|FINANCE|SERVICES|PVT|PRIVATE|INVESTMENTS?|WEALTH|STOCK|DEPOSITORY|TRADING|LLP|CORPORATION)\b/i

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Cells of one `pdfLines` row: columns are joined by 3+ spaces, words within a cell by one. */
function cellsOf(line: string): string[] {
  const out: string[] = []
  for (const raw of line.split(/\s{3,}/)) {
    const cell = raw.trim()
    if (!cell) continue
    // An ISIN glued to the next cell ("INE…  RELIANCE…") when the gap was narrow.
    const isin = /^(IN[A-Z0-9]{9}\d)\s+(.+)$/.exec(cell)
    if (isin) {
      out.push(isin[1]!, ...cellsOf(isin[2]!))
      continue
    }
    const parts = cell.split(' ')
    if (parts.length > 1 && parts.every((p) => isNumberCell(p) || PLACEHOLDER_CELL.test(p))) {
      out.push(...parts)
      continue
    }
    out.push(cell)
  }
  return out
}

function isNumberCell(s: string): boolean {
  return NUMBER_CELL.test(s) && /\d/.test(s)
}

/** "1,23,456.78" -> 123456.78, "(500.00)" -> -500, "--" / blank -> null. */
function num(raw: string | undefined): number | null {
  if (raw == null) return null
  let s = raw.trim()
  if (!s || PLACEHOLDER_CELL.test(s)) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[₹`,%\s]|^(?:INR|Rs\.?)/gi, '')
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
  }
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function isoDate(raw: string | undefined): string | null {
  if (!raw) return null
  const m = /^(\d{1,2})[-/ ]([A-Za-z]{3,9}|\d{1,2})[-/ ](\d{4})$/.exec(raw.trim())
  if (!m) return null
  const month = /\d/.test(m[2]!)
    ? Number(m[2])
    : MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1
  return makeISODate(Number(m[3]), month, Number(m[1]))
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function maskId(id: string): string {
  return `••${id.replace(/\s/g, '').slice(-4)}`
}

function classify(isin: string | null, name: string, section: Section | 'rta'): CasHolding['kind'] {
  if (section === 'bond') return 'bond'
  if (/\bETF\b|BEES\b|exchange\s+traded/i.test(name)) return 'etf'
  if (isin?.startsWith('INF')) return section === 'equity' ? 'etf' : 'mutual_fund'
  if (section === 'rta' || section === 'mf' || section === 'mf_folios') return 'mutual_fund'
  if (isin?.startsWith('INE') || isin?.startsWith('IN9')) return 'equity'
  if (isin?.startsWith('IN0')) return 'bond'
  return 'other'
}

/** Scheme / security name cleanup: drop RTA codes, "(formerly …)" and "(Non-Demat)" trailers. */
function cleanName(raw: string): string {
  let s = norm(raw)
  s = s.replace(/\((?:formerly|erstwhile)[^)]*\)/gi, '')
  s = s.replace(/\((?:Demat|Non-Demat).*$/i, '')
  // CDSL / CAMS summary prefix the RTA scheme code: "D110 - DSP ELSS…", "128TSGPG-Axis…".
  s = s.replace(/^(?=[A-Z0-9]*\d)[A-Z0-9]{2,12}\s*-\s*(?=[A-Za-z])/, '')
  return norm(s).replace(/[^a-zA-Z0-9_)%]+$/, '')
}

// --- detection ---

/**
 * Identifies a CAS by its issuer text. Conservative: needs the CAS heading or watermark plus
 * holdings structure (ISINs, folios, unit balances), so bank statements that merely mention
 * NSDL / CAMS in a narration, and payslips, are not matched.
 */
export function detectCas(lines: string[]): CasKind | null {
  const full = lines.map(norm).join('\n')
  const head = lines.slice(0, 300).map(norm).join('\n')
  const hasCasPhrase = CAS_PHRASE.test(full)
  const hasIsin = DETECT_ISIN.test(full)
  const mfShape =
    /Folio\s*No/i.test(full) &&
    (/(?:Opening|Closing)\s+Unit\s+Balance/i.test(full) ||
      lines.some((l) => /^\d{6,}(?:\s*\/\s*\d+)?\s.*\bINF[0-9A-Z]{8}\d\b/.test(norm(l))))

  // casparser keys on the rotated CAMSCASWS / KFINCASWS watermark first.
  if (/CAMSCASWS/.test(full) && (hasCasPhrase || mfShape)) return 'cams'
  if (/KFINCASWS/.test(full) && (hasCasPhrase || mfShape)) return 'kfintech'
  if (
    /NSDL\s+Consolidated\s+Account\s+Statement/i.test(head) &&
    (hasIsin || /(?:NSDL|CDSL)\s+Demat\s+Account|Mutual\s+Fund\s+Folios/i.test(full))
  )
    return 'nsdl'
  if (
    /Central\s+Depository\s+Services\s*\(India\)\s*Limited/i.test(full) &&
    hasCasPhrase &&
    (hasIsin || /holding\s+statement|BO\s*ID/i.test(full))
  )
    return 'cdsl'
  if (hasCasPhrase && mfShape && hasIsin) {
    // Every scheme line names its registrar, so ignore those when guessing the issuer.
    const issuerText = full.replace(/Registrar\s*:\s*\S+/gi, '')
    const kfin = (issuerText.match(/kfintech|kfin\s+technologies|karvy/gi) ?? []).length
    const cams = (issuerText.match(/camsonline|computer\s+age\s+management|\bCAMS\b/gi) ?? [])
      .length
    return kfin > cams ? 'kfintech' : 'cams'
  }
  return null
}

/** Parses a CAS into accounts and holdings. Returns null when it isn't a CAS or nothing parses. */
export function parseCas(lines: string[]): CasStatement | null {
  const kind = detectCas(lines)
  if (!kind) return null
  try {
    const parsed = kind === 'nsdl' || kind === 'cdsl' ? parseDemat(lines, kind) : parseRta(lines)
    const accounts = parsed.accounts.filter((a) => a.holdings.length > 0)
    if (!accounts.length) return null
    const { start, end } = statementPeriod(lines)
    return {
      kind,
      statementDate: end ?? parsed.asOn,
      periodStart: start,
      accounts,
      totalValue: round(accounts.reduce((s, a) => s + a.value, 0)),
      warnings: parsed.warnings
    }
  } catch {
    return null
  }
}

function statementPeriod(lines: string[]): { start: string | null; end: string | null } {
  for (const raw of lines.slice(0, 200)) {
    const line = norm(raw)
    // Transaction rows carry two dates too ("01-Apr-2024 To 30-Sep-2024" only as a heading).
    const m = PERIOD_RE.exec(line)
    if (m && (/period|statement/i.test(line) || line.length <= m[0].length + 4)) {
      return { start: isoDate(m[1]), end: isoDate(m[2]) }
    }
  }
  return { start: null, end: null }
}

interface Parsed {
  accounts: CasAccount[]
  asOn: string | null
  warnings: string[]
}

// --- holdings rows shared by demat tables and the CAMS summary ---

type Section = 'equity' | 'mf' | 'bond' | 'mf_folios' | 'cams_summary'

interface RowRecord {
  isin: string
  section: Section
  names: string[]
  folio: string | null
  nums: (number | null)[]
  amc: string | null
  hasCost: boolean
  continuations: number
}

function startRecord(
  line: string,
  section: Section,
  amc: string | null,
  hasCost: boolean
): RowRecord | null {
  const cells = cellsOf(line)
  const isinIdx = cells.findIndex((c) => /^IN[A-Z0-9]{9}\d$/.test(c))
  if (isinIdx < 0) return null
  const rec: RowRecord = {
    isin: cells[isinIdx]!,
    section,
    names: [],
    folio: null,
    nums: [],
    amc,
    hasCost,
    continuations: 0
  }
  const takesFolio = section === 'mf_folios' || section === 'cams_summary'
  // CDSL MF rows and the CAMS summary put the name / folio before the ISIN.
  for (const c of cells.slice(0, isinIdx)) {
    if (takesFolio && !rec.folio && /^\d{5,}(?:\s*\/\s*\d+)?$/.test(c))
      rec.folio = c.replace(/\s/g, '')
    else if (!isNumberCell(c) && !DISTRIBUTOR.test(c)) rec.names.push(c)
  }
  let inNumbers = false
  const rest = cells.slice(isinIdx + 1)
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]!
    if (!inNumbers && takesFolio && !rec.folio) {
      if (FOLIO_SLASH.test(c) || /^\d{5,}$/.test(c)) {
        rec.folio = c.replace(/\s/g, '')
        // A long folio wraps its "/0" tail into the next cell (casparser's FOLIO_TAIL_RE).
        if (!rec.folio.includes('/') && FOLIO_TAIL.test(rest[i + 1] ?? '')) {
          rec.folio += rest[++i]!
        }
        continue
      }
    }
    if (DATE_CELL.test(c)) continue // NAV date / maturity date
    if (isNumberCell(c) || PLACEHOLDER_CELL.test(c)) {
      inNumbers = true
      rec.nums.push(num(c))
      continue
    }
    if (inNumbers) continue // registrar name, coupon frequency after the numbers
    if (DISTRIBUTOR.test(c)) continue
    if (section === 'bond' && /once a|annual|yearly|quarter|monthly|maturity|cumulative/i.test(c))
      continue
    if (rec.names.length === 0 && CODE_LIKE.test(c) && rest.length > 2 && section !== 'equity') {
      continue // UCC printed beside the ISIN
    }
    rec.names.push(c)
  }
  return rec
}

/**
 * Folds a wrapped line into the open row (name / symbol / folio tail, or numbers that sat on
 * their own baseline). Returns false when the line doesn't look like part of the row.
 */
function continueRecord(rec: RowRecord, line: string): boolean {
  const cells = cellsOf(line)
  const numeric = cells.filter((c) => isNumberCell(c) || PLACEHOLDER_CELL.test(c))
  if (numeric.length) {
    if (rec.nums.filter((n) => n != null).length >= 3) return false
    rec.nums.push(...numeric.map(num))
  }
  const text = cells.filter((c) => !numeric.includes(c))
  if (!text.length) return numeric.length > 0
  const joined = text.join(' ')
  if (rec.continuations >= 3 || /:/.test(joined) || joined.split(' ').length > 10) return false
  rec.continuations++
  text.forEach((c, i) => {
    if (FOLIO_TAIL.test(c) && rec.folio && !rec.folio.includes('/')) {
      rec.folio += c
      return
    }
    if (DISTRIBUTOR.test(c) || CODE_LIKE.test(c)) return
    // NSDL stacks the stock symbol under the ISIN: "RELIANCE   LIMITED" or a lone "RELIANCE".
    const single = /^[A-Z0-9&.-]+$/.test(c)
    if (rec.section === 'equity' && single && text.length > 1 && i === 0) return
    if (rec.section === 'equity' && single && text.length === 1 && isSymbolOf(c, rec.names)) return
    rec.names.push(c)
  })
  return true
}

/**
 * After page furniture, only a row still missing its numbers carries on; a complete row is
 * closed so text at the top of the next page (which may be personal) never joins its name.
 */
function continueAcrossBreak(rec: RowRecord, line: string, pageBreak: boolean): boolean {
  if (pageBreak && rec.nums.filter((n) => n != null).length >= 3) return false
  return continueRecord(rec, line)
}

/** A lone ticker under the ISIN: a prefix of the name ("TATAMOTORS"), or the name is complete. */
function isSymbolOf(token: string, names: string[]): boolean {
  const name = names.join(' ')
  const compact = name.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  const sym = token.split('.')[0]!.replace(/[^A-Z0-9]/g, '')
  return (sym.length >= 2 && compact.startsWith(sym)) || /\b(?:LIMITED|LTD\.?)$/i.test(name)
}

/** |units × price − value| within casparser's 0.5% (or 1 paisa) tolerance. */
function closes(u: number, p: number, v: number): boolean {
  if (u <= 0 || p <= 0 || v <= 0) return false
  return Math.abs(u * p - v) <= Math.max(0.01, v * 0.005)
}

/**
 * Resolves units / price / value (and cost) from a row's numbers. Column sets vary by template,
 * so like casparser we find the rightmost triple that satisfies units × price ≈ value instead of
 * trusting positions.
 */
function finishRecord(rec: RowRecord, warnings: string[]): CasHolding | null {
  const n = rec.nums.filter((x): x is number => x != null)
  const name = cleanName(rec.names.join(' ')) || rec.isin
  let best: [number, number, number] | null = null
  for (let k = n.length - 1; k >= 2 && !best; k--) {
    for (let j = k - 1; j >= Math.max(1, k - 2) && !best; j--) {
      for (let i = 0; i < j; i++) {
        if (closes(n[i]!, n[j]!, n[k]!)) {
          best = [i, j, k]
          break
        }
      }
    }
  }
  let units: number
  let price: number | null
  let value: number
  let cost: number | null = null
  if (best) {
    const [i, j, k] = best
    units = n[i]!
    price = n[j]!
    value = n[k]!
    if (rec.hasCost) {
      if (k === j + 2)
        cost = n[j + 1]! // CDSL: units | NAV | invested | value
      else if (j - i >= 2)
        cost = n[j - 1]! // NSDL: units | avg cost | total cost | NAV | value
      else if (i >= 1) cost = n[i - 1]! // CAMS summary: cost | units | NAV | value
    }
  } else if (rec.section === 'bond' && n.length >= 2) {
    // Bond summary rows print coupon, quantity, face value, value — no market price.
    units = n.length >= 3 ? n[n.length - 3]! : n[0]!
    value = n[n.length - 1]!
    price = units > 0 ? round(value / units, 4) : null
  } else if (n.length >= 3) {
    units = n[0]!
    price = n[n.length - 2]!
    value = n[n.length - 1]!
    warnings.push(`${name} (${rec.isin}): units × price didn't match value; used column order.`)
  } else {
    if (n.some((x) => x !== 0)) warnings.push(`${name} (${rec.isin}): couldn't read its numbers.`)
    return null
  }
  if (units === 0 && value === 0) return null
  return {
    kind: classify(rec.isin, name, rec.section),
    name,
    isin: rec.isin,
    units,
    price,
    value: round(value),
    cost: cost == null ? null : round(cost),
    folio: rec.folio,
    amc: rec.amc
  }
}

// --- NSDL / CDSL demat CAS ---

const DP_CLIENT_RE = /DP\s*ID\s*:?\s*([A-Z0-9]+)\s+Client\s*ID\s*:?\s*(\d+)/i
// CDSL transaction / holding pages: "DP Name : <broker>  BO ID : <dp id + client id>".
const BO_ID_RE = /(?:BO\s*ID|DPID)\s*:?\s*([A-Z0-9]{16})\b/i
const DP_NAME_RE = /DP\s*Name\s*:\s*(.+?)(?:\s+(?:BO\s*ID|DPID|DP\s*ID)\b|$)/i
const TYPE_RE = /\b(NSDL|CDSL)\s+Demat\s+Account\b/i
const TXN_MARKER =
  /statement\s+of\s+transactions|transaction\s+details|transactions\s+for\s+the\s+period/i

const SECTION_MARKERS: [RegExp, Section | 'skip'][] = [
  [/^(?:equity\s+shares|equities\s*\(e\)|equities)$/i, 'equity'],
  [/^(?:mutual\s+funds\s*\(m\)|mutual\s+fund\s+units\s+held\s+with\s+the\s+amc)$/i, 'mf'],
  [/^(?:corporate\s+bonds\s*\(c\)|government\s+securities\s*\(g\))$/i, 'bond'],
  [
    /^(?:preference\s+shares\s*\(p\)|alternate\s+investment\s+funds?\s*\(a\)|money\s+market\s+instruments\s*\(i\)|securiti[sz]ed\s+instruments\s*\(s\)|postal\s+saving\s+scheme\s*\(o\)|national\s+pension\s+system\s*\(n\)|zero\s+coupon\s+zero\s+principal\s*\(z\))$/i,
    'skip'
  ]
]

const HEADER_WORDS = [
  'isin',
  'security',
  'company name',
  'stock symbol',
  'scheme name',
  'description',
  'folio no',
  'no. of',
  'current bal',
  'free bal',
  'frozen bal',
  'pledge',
  'lent bal',
  'market price',
  'value in',
  'value (',
  'nav',
  'face value',
  'total cost',
  'average cost',
  'unrealised',
  'annualised',
  'invested',
  'cost value',
  'unit balance',
  'market value',
  'current value',
  'registrar',
  'coupon',
  'maturity',
  'units'
]

function isColumnHeader(line: string): boolean {
  if (ISIN_TOKEN.test(line) || /\d[\d,]*\.\d/.test(line)) return false
  const l = line.toLowerCase()
  return HEADER_WORDS.filter((w) => l.includes(w)).length >= 2
}

/** Page furniture repeated mid-table: page numbers, titles, watermark, "contd". */
function isNoise(line: string): boolean {
  return (
    /^page\s*\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(line) ||
    /^\d+\s*(?:of|\/)\s*\d+$/.test(line) ||
    WATERMARK.test(line) ||
    (CAS_PHRASE.test(line) && line.length < 80) ||
    /^(?:central\s+depository\s+services|national\s+securities\s+depository)/i.test(line) ||
    /^cas\s*id\b/i.test(line) ||
    PERIOD_NOISE.test(line) ||
    /^\(?(?:contd|continued)\b/i.test(line)
  )
}

interface AccountBuild {
  account: CasAccount
  stated: number | null
}

function parseDemat(lines: string[], kind: 'nsdl' | 'cdsl'): Parsed {
  const warnings: string[] = []
  const accounts = new Map<string, AccountBuild>()
  const mfFolios: AccountBuild = {
    account: { type: 'mf_folios', label: 'Mutual fund folios', dpId: null, holdings: [], value: 0 },
    stated: null
  }
  const skipped = new Map<string, number>()
  const folioAmc = new Map<string, string>()
  let current: AccountBuild | null = null
  let section: Section | 'skip' | 'txn' | null = null
  let skipLabel = ''
  let hint = ''
  let amc: string | null = null
  let rec: RowRecord | null = null
  let asOn: string | null = null
  let metaAmc: string | null = null
  let pageBreak = false

  const flush = (): void => {
    if (rec && current) {
      const h = finishRecord(rec, warnings)
      if (h) {
        if (!h.amc && h.folio) h.amc = folioAmc.get(h.folio.split('/')[0]!) ?? null
        current.account.holdings.push(h)
      }
    }
    rec = null
  }
  const enter = (s: typeof section): void => {
    flush()
    section = s
    hint = ''
    amc = null
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]!
    const line = norm(raw)
    if (!line) continue

    // CDSL lists each folio's AMC before the holdings table; keep folio -> AMC for later rows.
    const amcMeta = /AMC\s*Name\s*:\s*(.+?)(?:\s{2,}|$)/i.exec(raw)
    if (amcMeta) metaAmc = norm(amcMeta[1]!)
    const folioMeta = /Folio\s*No\s*:\s*(\d+)/i.exec(line)
    if (folioMeta && metaAmc && !ISIN_TOKEN.test(line)) folioAmc.set(folioMeta[1]!, metaAmc)

    // Per-account header (also matches the roster rows on the summary page).
    const dpc = DP_CLIENT_RE.exec(line)
    const bo = dpc ? null : BO_ID_RE.exec(line)
    if (dpc || bo) {
      enter(null)
      const dp = dpc ? dpc[1]!.toUpperCase() : bo![1]!.slice(0, 8).toUpperCase()
      const client = dpc ? dpc[2]! : bo![1]!.slice(8)
      // Nearest lines first, stopping at the previous account's own DP line.
      const context = [raw]
      for (const prev of [lines[idx - 1], lines[idx - 2]]) {
        if (prev == null || DP_CLIENT_RE.test(prev) || BO_ID_RE.test(prev)) break
        context.push(prev)
      }
      const typeWord =
        context.map((l) => TYPE_RE.exec(l)?.[1]).find(Boolean) ??
        (dp.startsWith('IN') ? 'NSDL' : bo ? 'CDSL' : kind.toUpperCase())
      const key = `${typeWord.toUpperCase()}|${dp}|${client}`
      let build = accounts.get(key)
      if (!build) {
        build = {
          account: {
            type: 'demat',
            label: `${typeWord.toUpperCase()} demat`,
            dpId: maskId(dp + client),
            holdings: [],
            value: 0
          },
          stated: null
        }
        accounts.set(key, build)
      }
      const broker = brokerName(context)
      if (broker && build.account.label.indexOf('–') < 0) build.account.label += ` – ${broker}`
      // Roster rows end in the account's value; remember it to cross-check the holdings.
      if (build.stated == null) {
        for (const l of [raw, TYPE_RE.test(lines[idx - 1] ?? '') ? lines[idx - 1]! : '']) {
          const last = cellsOf(l).at(-1)
          if (last && /\.\d{2}$/.test(last) && isNumberCell(last)) build.stated = num(last)
        }
      }
      current = build
      continue
    }

    if (TXN_MARKER.test(line)) {
      enter('txn')
      continue
    }
    if (/holding\s+statement\s+as\s+on/i.test(line)) {
      enter('equity')
      asOn ??= isoDate(AS_ON_RE.exec(line)?.[1])
      continue
    }
    if (/mutual\s+fund\s+units\s+held\s+as\s+on|mutual\s+fund\s+folios\s*\(f\)/i.test(line)) {
      enter('mf_folios')
      current = mfFolios
      asOn ??= isoDate(AS_ON_RE.exec(line)?.[1])
      continue
    }
    const marker = SECTION_MARKERS.find(([re]) => re.test(line))
    if (marker) {
      enter(marker[1])
      skipLabel = line
      if (marker[1] === 'skip') skipped.set(line, skipped.get(line) ?? 0)
      continue
    }
    if (TOTAL_LINE.test(line)) {
      flush()
      continue
    }
    if (isColumnHeader(line)) {
      // Repeated on every page; a row split across pages continues after it.
      if (section !== 'txn') {
        hint += ` ${line.toLowerCase()}`
        section = headerSection(hint, section)
      }
      pageBreak = true
      continue
    }
    if (isNoise(line)) {
      pageBreak = true
      continue
    }

    // "ISIN : INE…" labels belong to transaction listings and CDSL's folio details, not rows.
    if (ISIN_TOKEN.test(line) && !/ISIN\s*:/i.test(line)) {
      if (section === 'skip') {
        skipped.set(skipLabel, (skipped.get(skipLabel) ?? 0) + 1)
        continue
      }
      if (!current || section == null || section === 'txn') continue
      flush()
      rec = startRecord(raw, section, amc, /cost|invested/.test(hint))
      pageBreak = false
      continue
    }
    if ((section === 'mf_folios' || section === 'mf') && AMC_LINE.test(line) && !/\d/.test(line)) {
      flush()
      amc = line
      continue
    }
    if (rec && !continueAcrossBreak(rec, raw, pageBreak)) flush()
  }
  flush()

  for (const [label, count] of skipped) {
    warnings.push(
      count
        ? `Skipped ${count} holding${count === 1 ? '' : 's'} under "${label}" (not supported yet).`
        : `Skipped the "${label}" section (not supported yet).`
    )
  }
  const all = [...accounts.values(), mfFolios]
  for (const b of all) {
    b.account.value = round(b.account.holdings.reduce((s, h) => s + h.value, 0))
    if (b.stated != null && Math.abs(b.stated - b.account.value) > Math.max(1, b.stated * 0.01)) {
      warnings.push(
        `${b.account.label} ${b.account.dpId ?? ''}: holdings add up to ${b.account.value}, statement says ${b.stated}.`.replace(
          /\s+:/,
          ':'
        )
      )
    }
  }
  return { accounts: all.map((b) => b.account), asOn, warnings }
}

/** Which table a column header introduces (casparser's `_detect_mode_from_header`). */
function headerSection(
  hint: string,
  section: Section | 'skip' | 'txn' | null
): Section | 'skip' | 'txn' | null {
  if (section === 'skip' || section === 'mf_folios') return section
  if (hint.includes('folio no') && /average|total cost|invested/.test(hint)) return 'mf_folios'
  if (section) return section
  if (hint.includes('coupon') && /maturity|frequency/.test(hint)) return 'bond'
  if (hint.includes('stock symbol') || hint.includes('company name')) return 'equity'
  if (hint.includes('isin description') && /nav|value/.test(hint)) return 'mf'
  if (hint.includes('current bal') && /market price|value/.test(hint)) return 'equity'
  return null
}

/** The DP's (broker's) name from the header lines — only company-like cells, never holders. */
function brokerName(context: string[]): string | null {
  for (const l of context) {
    const m = DP_NAME_RE.exec(norm(l))
    if (m) return norm(m[1]!)
  }
  for (const l of context) {
    for (let c of cellsOf(l)) {
      c = norm(c.replace(DP_CLIENT_RE, '').replace(TYPE_RE, ''))
      if (!c || /PAN|\(|account\s+holder|:/i.test(c) || isNumberCell(c)) continue
      if (CORPORATE.test(c)) return c
    }
  }
  return null
}

// --- CAMS / KFintech mutual fund CAS ---

const FOLIO_LINE_RE = /Folio\s+No\s*[.:]?\s*:?\s*(\d+(?:\s*\/\s*\d+)?)/i
const OPEN_BAL_RE = /Opening\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i
const CLOSE_BAL_RE = /Closing\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i
const NAV_RE = /NAV\s+on\s+[\w-]+\s*:\s*INR\s*([\d,.]+)/i
const VALUATION_RE = /(?:Valuation|Market\s+Value)\s+on\s+([\w-]+)\s*:\s*INR\s*([\d,.]+)/i
const COST_RE = /Total\s+Cost\s+Value\s*:?\s*([\d,.]+)/i
const TXN_DATE = /^\d{1,2}[-\s]*[A-Za-z]{3}[-\s]*\d{4}\b/
// "<RTA code>-<scheme name>": code is alphanumeric with a letter, dash glued to it, so
// "Entry Load - NIL" and "01-Jan-1990" don't qualify.
const SCHEME_CODE_RE = /^\s*(?=[A-Z0-9 ]{0,40}[A-Z])[A-Z0-9]+(?: [A-Z0-9]+)*-/i
const HEADER_MARKER =
  /Registrar\s*:|Advisor\s*:|ISIN\s*:|Nominee\s+\d|\bARN-?\d+\b|\bINA\d+\b|\b(?:CAMS|KFINTECH|KFIN|KARVY)\b/i
const DANGLING = /(?:Registrar\s*:|Advisor\s*:|ISIN\s*:|\(\s*Advisor\s*:)\s*$/i
const NAME_TERMINATOR =
  /\(\s*Advisor\s*:|Registrar\s*:?|Nominee\s+\d|\bARN-?\d+\b|\bINA\d+\b|\b(?:CAMS|KFINTECH|KFIN|KARVY)\b/i

interface Scheme {
  name: string
  isin: string | null
  folio: string | null
  amc: string | null
  units: number | null
  nav: number | null
  value: number | null
  valueDate: string | null
  cost: number | null
}

function parseRta(lines: string[]): Parsed {
  const detailed = lines.some((l) => OPEN_BAL_RE.test(l) || CLOSE_BAL_RE.test(l))
  return detailed ? parseRtaDetailed(lines) : parseRtaSummary(lines)
}

/** Builds a scheme from the lines between a folio / previous footer and "Opening Unit Balance". */
function schemeFromRegion(region: string[]): Omit<Scheme, 'folio' | 'amc'> | null {
  const ls = region.map(norm).filter((l) => l && !isNoise(l))
  const candidates = ls
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => SCHEME_CODE_RE.test(l) && l.split('-')[0]!.trim().toUpperCase() !== 'ARN')
  const pick = candidates.find(({ l }) => HEADER_MARKER.test(l)) ?? candidates[0]
  if (!pick) return null
  // Wrapped header lines join only if they carry a marker or follow a dangling "ISIN :" etc.
  const members: string[] = [pick.l]
  let forced = DANGLING.test(pick.l)
  for (const l of ls.slice(pick.i + 1)) {
    if (forced || HEADER_MARKER.test(l)) {
      members.push(l)
      forced = DANGLING.test(l)
    } else forced = false
  }
  const header = members.join(' ')
  if (!/Registrar/i.test(header) && !/ISIN\s*:/i.test(header)) return null
  let nameText = header.slice(header.indexOf('-') + 1)
  nameText = nameText.replace(/[-\s]*\(\s*Advisor\s*:\s*[^)]+?\)/gi, '')
  nameText = nameText.replace(/[-\s]*ISIN\s*:\s*INF[A-Z0-9]*/gi, '')
  const cut = NAME_TERMINATOR.exec(nameText)
  const name = cleanName(cut ? nameText.slice(0, cut.index) : nameText)
  const labelled = /ISIN\s*:\s*([A-Z0-9]+)/i.exec(header)?.[1]
  const isin =
    labelled && /^INF[0-9A-Z]{8}\d$/.test(labelled)
      ? labelled
      : (/\bINF[0-9A-Z]{8}\d\b/.exec(header)?.[0] ?? null)
  return { name, isin, units: null, nav: null, value: null, valueDate: null, cost: null }
}

function parseRtaDetailed(lines: string[]): Parsed {
  const warnings: string[] = []
  const schemes: Scheme[] = []
  let amc: string | null = null
  let folio: string | null = null
  let scheme: Scheme | null = null
  let region: string[] = []
  let regionOpen = false

  for (const raw of lines) {
    const line = norm(raw)
    if (!line) continue
    if (AMC_LINE.test(line) && !/\d/.test(line)) {
      amc = line
      region = []
      regionOpen = false
      continue
    }
    // A gift transaction can mention "Folio No" too, but it starts with a date.
    const fm = /Folio\s*No/i.test(line) && !TXN_DATE.test(line) ? FOLIO_LINE_RE.exec(line) : null
    if (fm) {
      folio = fm[1]!.replace(/\s/g, '')
      scheme = null
      region = []
      regionOpen = true
      continue
    }
    if (OPEN_BAL_RE.test(line)) {
      if (regionOpen) {
        const s = schemeFromRegion(region)
        if (s) {
          scheme = { ...s, folio, amc }
          schemes.push(scheme)
        } else {
          scheme = null
          warnings.push(`A scheme in folio ${folio ?? '?'} had an unreadable header; skipped.`)
        }
        region = []
        regionOpen = false
      }
      continue
    }
    let footer = false
    if (scheme) {
      const close = CLOSE_BAL_RE.exec(line)
      if (close) {
        scheme.units = num(close[1])
        region = []
        regionOpen = true
        footer = true
      }
      const nav = NAV_RE.exec(line)
      if (nav) {
        scheme.nav = num(nav[1])
        footer = true
      }
      const val = VALUATION_RE.exec(line)
      if (val) {
        scheme.value = num(val[2])
        scheme.valueDate = isoDate(val[1])
        footer = true
      }
      const cost = COST_RE.exec(line)
      if (cost) {
        scheme.cost = num(cost[1])
        footer = true
      }
    }
    if (regionOpen && !footer && !isColumnHeader(line)) region.push(raw)
  }

  const holdings: CasHolding[] = []
  let asOn: string | null = null
  for (const s of schemes) {
    const units = s.units ?? 0
    const value = s.value ?? (s.nav != null ? units * s.nav : null)
    if (value == null) {
      warnings.push(`${s.name}: no closing valuation found; skipped.`)
      continue
    }
    if (units === 0 && value === 0) continue
    asOn ??= s.valueDate
    holdings.push({
      kind: classify(s.isin, s.name, 'rta'),
      name: s.name,
      isin: s.isin,
      units,
      price: s.nav,
      value: round(value),
      cost: s.cost == null ? null : round(s.cost),
      folio: s.folio,
      amc: s.amc
    })
  }
  return { accounts: [mfAccount(holdings)], asOn, warnings }
}

function parseRtaSummary(lines: string[]): Parsed {
  const warnings: string[] = []
  const holdings: CasHolding[] = []
  let amc: string | null = null
  let rec: RowRecord | null = null
  let asOn: string | null = null
  let pageBreak = false
  const flush = (): void => {
    const h = rec && finishRecord(rec, warnings)
    if (h) holdings.push(h)
    rec = null
  }
  for (const raw of lines) {
    const line = norm(raw)
    if (!line) continue
    asOn ??= isoDate(AS_ON_RE.exec(line)?.[1])
    if (AMC_LINE.test(line) && !/\d/.test(line)) {
      flush()
      amc = line
      continue
    }
    if (TOTAL_LINE.test(line)) {
      flush()
      continue
    }
    if (isColumnHeader(line) || isNoise(line)) {
      pageBreak = true
      continue
    }
    // Row: <folio> <ISIN> <code>-<scheme> <cost> <units> <NAV date> <NAV> <value> <registrar>
    if (/^\d{5,}(?:\s*\/\s*\d+)?\s/.test(line) && /\bINF[0-9A-Z]{8}\d\b/.test(line)) {
      flush()
      rec = startRecord(raw, 'cams_summary', amc, true)
      pageBreak = false
      continue
    }
    if (rec && !continueAcrossBreak(rec, raw, pageBreak)) flush()
  }
  flush()
  return { accounts: [mfAccount(holdings)], asOn, warnings }
}

function mfAccount(holdings: CasHolding[]): CasAccount {
  return {
    type: 'mf_folios',
    label: 'Mutual fund folios',
    dpId: null,
    holdings,
    value: round(holdings.reduce((s, h) => s + h.value, 0))
  }
}
