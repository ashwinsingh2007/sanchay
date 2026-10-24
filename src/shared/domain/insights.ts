import { addMonths, formatDate, monthName, type ISODate, type MonthKey } from '../dates'
import { averageMinor, formatMoney, percentOf, sumMinor } from '../money'
import type {
  CalcLine,
  EvidenceTx,
  GoalProjection,
  Insight,
  MonthSummary,
  RecurringCommitment,
  SafeToSpend,
  Severity,
  UserFinancialSettings
} from '../types'
import {
  categorySpend,
  inMonth,
  isSpending,
  spendOf,
  toEvidence,
  type AnalysisTx,
  type KindMap
} from './cashflow'
import { monthlyEquivalentMinor } from './recurring'

export interface InsightContext {
  month: MonthKey
  currency: string
  today: ISODate
  isPartialMonth: boolean
  settings: UserFinancialSettings
  current: MonthSummary
  transactions: readonly AnalysisTx[]
  kinds: KindMap
  categoryName: (id: string) => string
  commitments: readonly RecurringCommitment[]
  safeToSpend: SafeToSpend
  goals: readonly GoalProjection[]
  oneOffIds: ReadonlySet<string>
  /** One-off ids for each prior month, so baselines exclude them too. */
  priorOneOffIds: ReadonlySet<string>
  /** Months (before `month`) that contain enough data to form a baseline. */
  monthsWithData: ReadonlySet<MonthKey>
  needsReviewCount: number
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, attention: 2, info: 1 }

export function rankInsights(insights: Insight[]): Insight[] {
  return [...insights].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      (b.estimatedImpactMinor ?? 0) - (a.estimatedImpactMinor ?? 0)
  )
}

/** Deterministic, evidence-backed CFO actions for a month. No model, no network. */
export function generateInsights(ctx: InsightContext): Insight[] {
  const fmt = (m: number): string => formatMoney(m, ctx.currency)
  const monthTxs = inMonth(ctx.transactions, ctx.month)
  const out: Insight[] = []
  const make = (
    type: string,
    key: string,
    fields: Omit<Insight, 'id' | 'month' | 'type'>
  ): Insight => ({ id: `${ctx.month}:${type}:${key}`, month: ctx.month, type, ...fields })

  // 1. Subscriptions to review
  const subs = ctx.commitments.filter(
    (c) =>
      c.status !== 'ignored' &&
      (c.categoryId === 'subscriptions' || c.categoryId === 'entertainment')
  )
  if (subs.length > 0) {
    const monthly = subs.map((c) => monthlyEquivalentMinor(c.typicalAmountMinor, c.cadence))
    const total = sumMinor(monthly)
    const confidence =
      Math.round((subs.reduce((s, c) => s + c.confidence, 0) / subs.length) * 100) / 100
    const linked = new Set(subs.flatMap((c) => c.linkedTransactionIds))
    out.push(
      make('subscriptions_review', 'all', {
        title: 'Review recurring subscriptions',
        summary: `${subs.length} recurring subscription${subs.length === 1 ? '' : 's'} cost about ${fmt(total)} a month (${fmt(total * 12)} a year).`,
        action:
          'Go through each one and cancel anything you no longer use. Every cancellation saves its full monthly cost.',
        why: 'These merchants charged you similar amounts at regular intervals, so they look like subscriptions.',
        estimatedImpactMinor: total,
        impactLabel: 'per month under review',
        confidence,
        severity:
          ctx.current.incomeMinor > 0 && total > ctx.current.incomeMinor * 0.05
            ? 'attention'
            : 'info',
        isEstimate: true,
        evidence: {
          calculation: [
            ...subs.map((c, i) => ({
              label: `${c.merchantName} (${c.cadence}, ${Math.round(c.confidence * 100)}% confidence)`,
              amountMinor: monthly[i]!,
              op: '+' as const
            })),
            { label: 'Monthly equivalent', amountMinor: total, op: '=' as const }
          ],
          transactions: ctx.transactions
            .filter((t) => linked.has(t.id))
            .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
            .slice(0, 12)
            .map(toEvidence),
          notes: ['Quarterly and yearly charges are converted to a monthly equivalent.']
        }
      })
    )
  }

  // 2. Commitments before next income / safe-to-spend
  const sts = ctx.safeToSpend
  if (sts.status === 'needs_setup') {
    const what = sts.missing
      .map((m) => (m === 'balance' ? 'your current bank balance' : 'your next income date'))
      .join(' and ')
    out.push(
      make('safe_to_spend_setup', 'setup', {
        title: 'Unlock your safe-to-spend estimate',
        summary: `Add ${what} so Sanchay can estimate what is safe to spend before your next income.`,
        action: sts.missing.includes('balance')
          ? 'Open Accounts and enter the current balance of your bank account.'
          : 'Open Settings and set your next income date.',
        why: 'Safe-to-spend is calculated from real balances. We will not guess a number.',
        estimatedImpactMinor: null,
        impactLabel: null,
        confidence: null,
        severity: 'info',
        isEstimate: false,
        evidence: { calculation: [], transactions: [], notes: [] }
      })
    )
  } else if (
    sts.commitmentsMinor > 0 &&
    (sts.shortfallMinor > 0 || sts.commitmentsMinor >= sts.availableCashMinor * 0.4)
  ) {
    out.push(
      make('commitments_before_income', 'next', {
        title: 'Your fixed commitments are high before next income',
        summary:
          sts.shortfallMinor > 0
            ? `${fmt(sts.commitmentsMinor)} is due before ${formatDate(sts.nextIncomeDate)}, which leaves you ${fmt(sts.shortfallMinor)} short of your emergency buffer.`
            : `${fmt(sts.commitmentsMinor)} of commitments is due before ${formatDate(sts.nextIncomeDate)} — ${percentOf(sts.commitmentsMinor, sts.availableCashMinor)}% of your available cash.`,
        action:
          sts.shortfallMinor > 0
            ? 'Hold back discretionary spending until income arrives, or move money in from savings to cover the gap.'
            : `Keep discretionary spending under about ${fmt(sts.valueMinor)} until ${formatDate(sts.nextIncomeDate)}.`,
        why: 'Recurring payments expected before your next income date are compared with your current cash balance.',
        estimatedImpactMinor: sts.commitmentsMinor,
        impactLabel: 'due before next income',
        confidence: null,
        severity: sts.shortfallMinor > 0 ? 'high' : 'attention',
        isEstimate: true,
        evidence: {
          calculation: safeToSpendLines(sts),
          transactions: [],
          notes: sts.commitments.map(
            (c) =>
              `${formatDate(c.date)} · ${c.merchantName} · ${fmt(c.amountMinor)}${c.status === 'review' ? ' (unconfirmed)' : ''}`
          )
        }
      })
    )
  }

  // 3. Categories meaningfully above their normal range (one-offs excluded both sides)
  const priorMonths = [1, 2, 3]
    .map((n) => addMonths(ctx.month, -n))
    .filter((m) => ctx.monthsWithData.has(m))
  if (priorMonths.length >= 2) {
    const current = categorySpend(monthTxs, ctx.kinds, ctx.oneOffIds)
    const priorByMonth = priorMonths.map((m) => ({
      month: m,
      totals: categorySpend(inMonth(ctx.transactions, m), ctx.kinds, ctx.priorOneOffIds)
    }))
    const avgTotalSpend = averageMinor(priorByMonth.map((p) => sumMinor([...p.totals.values()])))
    const candidates: { categoryId: string; curr: number; avg: number; diff: number }[] = []
    for (const [categoryId, curr] of current) {
      if (categoryId === 'housing' || categoryId === 'emi') continue
      const avg = averageMinor(priorByMonth.map((p) => p.totals.get(categoryId) ?? 0))
      const diff = curr - avg
      if (avg > 0 && curr > avg * 1.25 && diff >= avgTotalSpend * 0.03) {
        candidates.push({ categoryId, curr, avg, diff })
      }
    }
    candidates.sort((a, b) => b.diff - a.diff)
    for (const c of candidates.slice(0, 2)) {
      const name = ctx.categoryName(c.categoryId)
      const pct = percentOf(c.diff, c.avg)
      out.push(
        make('category_above_normal', c.categoryId, {
          title: `${name} spending is meaningfully above your normal range`,
          summary: `${fmt(c.curr)} in ${monthName(ctx.month)} vs a ${priorMonths.length}-month average of ${fmt(c.avg)} (+${pct}%).`,
          action: `If this wasn't planned, a monthly cap near ${fmt(c.avg)} would free up about ${fmt(c.diff)} a month.`,
          why: `Compared with your own average for the previous ${priorMonths.length} months, excluding one-off payments.`,
          estimatedImpactMinor: c.diff,
          impactLabel: 'above your average',
          confidence: priorMonths.length >= 3 ? 0.8 : 0.6,
          severity: 'attention',
          isEstimate: false,
          evidence: {
            calculation: [
              ...priorByMonth.map((p) => ({
                label: monthName(p.month),
                amountMinor: p.totals.get(c.categoryId) ?? 0
              })),
              {
                label: `${priorMonths.length}-month average`,
                amountMinor: c.avg,
                op: '=' as const
              },
              { label: monthName(ctx.month), amountMinor: c.curr },
              { label: 'Difference', amountMinor: c.diff, op: '=' as const }
            ],
            transactions: monthTxs
              .filter(
                (t) =>
                  t.categoryId === c.categoryId &&
                  isSpending(t, ctx.kinds) &&
                  !ctx.oneOffIds.has(t.id)
              )
              .sort((a, b) => spendOf(b) - spendOf(a))
              .slice(0, 10)
              .map(toEvidence),
            notes:
              priorMonths.length < 3
                ? ['Only two prior months of data, so confidence is lower.']
                : []
          }
        })
      )
    }
  }

  // 4. Savings goals that need more per month
  for (const g of ctx.goals) {
    if (g.isComplete || g.gapMonthlyMinor <= 0) continue
    const hasContribution = g.monthlyContributionMinor != null
    out.push(
      make('goal_gap', g.goalId, {
        title: hasContribution
          ? `Your ${g.name} goal needs an additional ${fmt(g.gapMonthlyMinor)}/month to stay on track`
          : `Set aside about ${fmt(g.requiredMonthlyMinor)}/month to reach ${g.name} on time`,
        summary: `${fmt(g.remainingMinor)} still to save by ${formatDate(g.targetDate)} (${g.monthsRemaining} month${g.monthsRemaining === 1 ? '' : 's'}).`,
        action: hasContribution
          ? `Increase your monthly set-aside from ${fmt(g.monthlyContributionMinor!)} to ${fmt(g.requiredMonthlyMinor)}, or move the target date.`
          : `Add a monthly contribution of ${fmt(g.requiredMonthlyMinor)} to your plan, or move the target date.`,
        why: 'Remaining amount divided by the whole months left until your target date.',
        estimatedImpactMinor: g.gapMonthlyMinor,
        impactLabel: 'extra per month',
        confidence: null,
        severity: 'attention',
        isEstimate: true,
        evidence: {
          calculation: [
            { label: 'Target', amountMinor: g.targetAmountMinor },
            { label: 'Already saved', amountMinor: g.currentAmountMinor, op: '−' },
            { label: 'Remaining', amountMinor: g.remainingMinor, op: '=' },
            { label: 'Months until target date', text: String(Math.max(1, g.monthsRemaining)) },
            { label: 'Required per month', amountMinor: g.requiredMonthlyMinor, op: '=' },
            ...(hasContribution
              ? [
                  {
                    label: 'Your planned contribution',
                    amountMinor: g.monthlyContributionMinor!,
                    op: '−' as const
                  },
                  { label: 'Additional needed', amountMinor: g.gapMonthlyMinor, op: '=' as const }
                ]
              : [])
          ],
          transactions: [],
          notes: g.assumptions
        }
      })
    )
  }

  // 5. Large one-off payments (explicitly not a trend)
  for (const t of monthTxs.filter((x) => ctx.oneOffIds.has(x.id))) {
    const amount = spendOf(t)
    out.push(
      make('one_off_expense', t.id, {
        title: `You paid a large one-off expense: ${t.merchantNormalised}`,
        summary: `${fmt(amount)} on ${formatDate(t.transactionDate)}. This is treated as a one-off, not as an overspending trend.`,
        action: `If it comes back every year, setting aside ${fmt(Math.ceil(amount / 12))} a month avoids the spike next time.`,
        why: 'It is much larger than your typical transaction this month and this merchant does not appear in recent months.',
        estimatedImpactMinor: Math.ceil(amount / 12),
        impactLabel: 'per month to set aside',
        confidence: 0.7,
        severity: 'info',
        isEstimate: true,
        evidence: {
          calculation: [
            { label: 'Payment', amountMinor: amount },
            { label: 'Spread over 12 months', amountMinor: Math.ceil(amount / 12), op: '=' }
          ],
          transactions: [toEvidence(t)],
          notes: []
        }
      })
    )
  }

  // 6. Fees & charges — avoidable money leaks
  const fees = monthTxs.filter(
    (t) => t.categoryId === 'fees' && isSpending(t, ctx.kinds) && spendOf(t) > 0
  )
  const feeTotal = sumMinor(fees.map(spendOf))
  if (feeTotal > 0) {
    out.push(
      make('fees', 'month', {
        title: `You paid ${fmt(feeTotal)} in fees and charges`,
        summary: `${fees.length} bank or card charge${fees.length === 1 ? '' : 's'} in ${monthName(ctx.month)}.`,
        action:
          'Check whether any can be reversed (late fees, annual fees) or avoided by switching to a fee-free option.',
        why: 'Transactions categorised as Fees & Charges are usually avoidable.',
        estimatedImpactMinor: feeTotal,
        impactLabel: 'this month',
        confidence: 0.9,
        severity: feeTotal > ctx.current.spendingMinor * 0.01 ? 'attention' : 'info',
        isEstimate: false,
        evidence: {
          calculation: [{ label: 'Total fees & charges', amountMinor: feeTotal }],
          transactions: fees.map(toEvidence),
          notes: []
        }
      })
    )
  }

  // 7. Monthly savings target
  const target = ctx.settings.monthlySavingsTargetMinor
  if (target && target > 0 && !ctx.isPartialMonth && ctx.current.incomeMinor > 0) {
    const saved = ctx.current.netCashFlowMinor
    if (saved < target) {
      out.push(
        make('savings_target', 'month', {
          title: `You saved ${fmt(Math.max(0, saved))} against your ${fmt(target)} target`,
          summary: `${fmt(target - saved)} short of your monthly savings target in ${monthName(ctx.month)}.`,
          action: 'Look at the biggest changes above to find where the gap came from.',
          why: 'Surplus (income minus spending) compared with the monthly target in your settings.',
          estimatedImpactMinor: target - saved,
          impactLabel: 'short of target',
          confidence: null,
          severity: 'attention',
          isEstimate: false,
          evidence: {
            calculation: [
              { label: 'Income', amountMinor: ctx.current.incomeMinor },
              { label: 'Spending', amountMinor: ctx.current.spendingMinor, op: '−' },
              { label: 'Surplus', amountMinor: saved, op: '=' },
              { label: 'Target', amountMinor: target },
              { label: 'Gap', amountMinor: target - saved, op: '=' }
            ],
            transactions: [],
            notes: []
          }
        })
      )
    }
  }

  // 8. Data quality
  if (ctx.needsReviewCount > 0) {
    out.push(
      make('needs_review', 'month', {
        title: `Review ${ctx.needsReviewCount} uncategorised transaction${ctx.needsReviewCount === 1 ? '' : 's'}`,
        summary:
          'Some transactions could not be categorised confidently, which makes this report less precise.',
        action:
          'Open Transactions → Needs review and assign categories. Create a rule to remember merchants.',
        why: 'No user rule or known keyword matched these descriptions.',
        estimatedImpactMinor: null,
        impactLabel: null,
        confidence: null,
        severity: 'info',
        isEstimate: false,
        evidence: { calculation: [], transactions: [], notes: [] }
      })
    )
  }

  return rankInsights(out)
}

export function safeToSpendLines(sts: Extract<SafeToSpend, { status: 'ok' }>): CalcLine[] {
  return [
    ...sts.accounts.map((a) => ({
      label: `${a.name} balance`,
      amountMinor: a.balanceMinor,
      op: '+' as const
    })),
    { label: 'Available cash', amountMinor: sts.availableCashMinor, op: '=' },
    { label: 'Commitments before next income', amountMinor: sts.commitmentsMinor, op: '−' },
    { label: 'Emergency buffer', amountMinor: sts.bufferMinor, op: '−' },
    { label: 'Safe to spend (never below zero)', amountMinor: sts.valueMinor, op: '=' }
  ]
}

export function evidenceForIds(txs: readonly AnalysisTx[], ids: readonly string[]): EvidenceTx[] {
  const set = new Set(ids)
  return txs.filter((t) => set.has(t.id)).map(toEvidence)
}
