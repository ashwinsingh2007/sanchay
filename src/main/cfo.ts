import {
  buildCfoReview,
  type CfoReview,
  type FundFacts,
  type ReviewInput,
  type Row
} from '../shared/domain/cfoReview'
import type { Db } from './db/client'
import { getMonthlyClose, getMonths } from './analysis'
import { portfolioRows } from './portfolio'
import { listProfile } from './profile'

/** Assembles the CFO review from the INDmoney sync, statements and the CFO profile. */
function parse(content: string | undefined): unknown {
  if (!content || content.startsWith('Error:')) return null
  try {
    const v = JSON.parse(content) as unknown
    if (v && typeof v === 'object' && typeof (v as Row)['result'] === 'string')
      return JSON.parse((v as Row)['result'] as string)
    return v
  } catch {
    return null
  }
}

const answer = (entries: { key: string; value: string }[], key: string): string | null => {
  const v = entries.find((e) => e.key === key)?.value?.trim()
  return v && v !== '__skipped__' ? v : null
}

/** "None", "no", "nil" mean the user has none. */
const hasCover = (v: string | null): string | null =>
  v && !/^(none|no|nil|nothing|not yet|-)\b/i.test(v) ? v : null

export function getCfoReview(db: Db): CfoReview | null {
  const rows = portfolioRows(db)
  const snapRow = rows.find((r) => r.tool === 'networth_snapshot')
  const snapshot = parse(snapRow?.content) as Row | null
  if (!snapshot) return null

  const holdings: Record<string, Row[]> = {}
  for (const r of rows) {
    if (!r.tool.startsWith('networth_holdings:')) continue
    const list = (parse(r.content) as Row | null)?.['holdings']
    if (Array.isArray(list)) holdings[r.tool.split(':')[1]!] = list as Row[]
  }

  const sectors = (parse(rows.find((r) => r.tool === 'stock_sectors')?.content) ??
    {}) as ReviewInput['sectors']

  const funds: Record<string, FundFacts> = {}
  const details = parse(rows.find((r) => r.tool === 'mf_details')?.content)
  for (const batch of Array.isArray(details) ? (details as Row[]) : []) {
    for (const item of ((batch['data'] as Row[] | undefined) ?? []) as Row[]) {
      const d = ((item['data'] as Row | undefined)?.['fund_detail'] ?? null) as Row | null
      if (!d) continue
      const ranking = (d['ind_ranking'] ?? {}) as Row
      const returns = (d['returns'] ?? {}) as Row
      funds[String(item['fund_id'])] = {
        category: typeof d['category'] === 'string' ? d['category'] : null,
        expenseRatio: typeof d['expense_ratio'] === 'number' ? d['expense_ratio'] : null,
        rankTag: typeof ranking['tag'] === 'string' ? ranking['tag'] : null,
        rank: typeof ranking['rank'] === 'string' ? ranking['rank'] : null,
        return3y: typeof returns['3Y'] === 'number' ? returns['3Y'] : null
      }
    }
  }

  // Full months only: a half-finished month would understate typical spending.
  let monthlySpendMinor: number[] = []
  const { months, defaultMonth } = getMonths(db)
  if (months.length > 0) {
    const report = getMonthlyClose(db, defaultMonth)
    const trend = report.isPartialMonth ? report.trend.slice(0, -1) : report.trend
    monthlySpendMinor = trend.map((t) => t.spendingMinor)
  }

  const profile = listProfile(db)
  const ageText = answer(profile, 'age')
  const age = ageText ? Number.parseInt(ageText, 10) : NaN
  const riskText = answer(profile, 'risk')
  const dependents = answer(profile, 'dependents')

  return buildCfoReview({
    asOf: snapRow!.syncedAt.slice(0, 10),
    snapshot,
    holdings,
    sectors,
    funds,
    monthlySpendMinor,
    profile: {
      age: Number.isFinite(age) && age > 15 && age < 100 ? age : null,
      risk: riskText
        ? /low/i.test(riskText)
          ? 'low'
          : /high/i.test(riskText)
            ? 'high'
            : 'medium'
        : null,
      hasDependents: dependents ? !/^(nobody|none|no)\b/i.test(dependents) : null,
      termInsurance: hasCover(answer(profile, 'term_insurance')),
      healthInsurance: hasCover(answer(profile, 'health_insurance'))
    }
  })
}
