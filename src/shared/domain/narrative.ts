import { formatDate, monthName } from '../dates'
import { formatMoney, formatPercent } from '../money'
import type { ChangeDriver, MonthlyCloseReport } from '../types'

function describeDriver(d: ChangeDriver, fmt: (m: number) => string): string {
  if (d.kind === 'one_off')
    return `a one-off payment to ${d.label.replace(/^One-off: /, '')} (${fmt(d.diffMinor)})`
  if (d.kind === 'previous_one_off')
    return `last month's one-off ${d.label.replace(/^Last month's one-off: /, '')} not repeating (${fmt(d.diffMinor)})`
  return `${d.label} (${fmt(d.diffMinor)})`
}

/**
 * Deterministic "CFO narrative" for the monthly close. Every number comes straight from the
 * report; nothing is inferred beyond what the evidence panels show.
 */
export function buildNarrative(
  report: MonthlyCloseReport,
  _categoryName: (id: string) => string
): string[] {
  const fmt = (m: number): string => formatMoney(m, report.currency)
  const fmtSigned = (m: number): string => formatMoney(m, report.currency, { signed: true })
  const name = monthName(report.month)
  const c = report.current
  const out: string[] = []

  if (!report.hasData) {
    return [
      `There are no transactions for ${name} yet. Import a statement that covers this month to close it.`
    ]
  }

  if (c.incomeMinor > 0) {
    const verb =
      c.netCashFlowMinor >= 0
        ? `leaving a surplus of ${fmt(c.netCashFlowMinor)}`
        : `a shortfall of ${fmt(-c.netCashFlowMinor)}`
    let line = `In ${name} you brought in ${fmt(c.incomeMinor)} and spent ${fmt(c.spendingMinor)}, ${verb} (saving rate ${formatPercent(c.savingRate)}).`
    if (c.investedMinor > 0)
      line += ` ${fmt(c.investedMinor)} of that went into investments and savings.`
    out.push(line)
  } else {
    out.push(
      `In ${name} you spent ${fmt(c.spendingMinor)}. No income was recorded in the imported statements, so a saving rate isn't available.`
    )
  }

  const cmp = report.comparison
  if (cmp.hasPrevious) {
    const top = cmp.drivers
      .slice(0, 2)
      .map((d) => describeDriver({ ...d, label: d.label }, fmtSigned))
    out.push(
      top.length > 0 ? `${cmp.headline} The biggest changes: ${top.join(' and ')}.` : cmp.headline
    )
  }

  const sts = report.safeToSpend
  if (sts.status === 'ok') {
    out.push(
      `Before your next income on ${formatDate(sts.nextIncomeDate)}, an estimated ${fmt(sts.valueMinor)} is safe to spend after ${fmt(sts.commitmentsMinor)} of expected commitments${sts.bufferMinor > 0 ? ` and your ${fmt(sts.bufferMinor)} buffer` : ''}.`
    )
  }

  if (report.isPartialMonth) {
    out.push(`Your data for ${name} is incomplete, so totals may change after your next import.`)
  }
  return out
}
