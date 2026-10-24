import { CATALOGUE_AS_OF } from '../cards'
import { toMonthKey, type MonthKey } from '../dates'
import { formatMoney, sumMinor } from '../money'
import type {
  CardEstimate,
  MonthlyCloseReport,
  RecurringCommitment,
  SavingsOpportunity,
  SavingsReport,
  Transaction
} from '../types'
import { isSpending, spendOf, toEvidence, type KindMap } from './cashflow'
import { merchantKey } from './merchant'
import { monthlyEquivalentMinor } from './recurring'
import { findAlternatives } from './alternatives'
import { adviseCards } from './payAdvisor'

export interface SavingsInput {
  report: MonthlyCloseReport
  transactions: readonly Transaction[]
  commitments: readonly RecurringCommitment[]
  kinds: KindMap
  categoryName: (id: string) => string
}

/**
 * Card-reward estimates on the user's own spending, from the payment advisor (12-month window,
 * UPI-aware, caps and fee waivers applied). Monthly figures for the savings report.
 */
export function estimateCards(
  transactions: readonly Transaction[],
  month: MonthKey,
  kinds: KindMap
): {
  cards: CardEstimate[]
  months: number
  eligibleMonthlyMinor: number
  todayMonthlyMinor: number
} {
  const advice = adviseCards({
    transactions,
    kinds,
    month,
    accountTypes: new Map(),
    currency: 'INR'
  })
  const cards = advice.cards.map((c) => ({
    cardId: c.cardId,
    name: c.name,
    issuer: c.issuer,
    annualFeeMinor: c.effectiveFeeMinor,
    monthlyRewardMinor: Math.round(c.annualRewardMinor / 12),
    netMonthlyGainMinor: Math.round(c.netAnnualGainMinor / 12),
    bestFor: c.bestFor
  }))
  return {
    cards,
    months: advice.months,
    eligibleMonthlyMinor: Math.round(advice.annualSpendMinor / 12),
    todayMonthlyMinor: Math.round(advice.todayAnnualRewardMinor / 12)
  }
}

/** Same merchant, same amount, within two days — possibly charged twice. */
function findDuplicates(monthTxs: readonly Transaction[], kinds: KindMap): Transaction[][] {
  const spend = monthTxs
    .filter((t) => isSpending(t, kinds) && spendOf(t) > 0 && !t.isRecurring)
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
  const groups: Transaction[][] = []
  const used = new Set<string>()
  for (let i = 0; i < spend.length; i++) {
    const a = spend[i]!
    if (used.has(a.id)) continue
    const group = [a]
    for (let j = i + 1; j < spend.length; j++) {
      const b = spend[j]!
      const days = (Date.parse(b.transactionDate) - Date.parse(a.transactionDate)) / 86_400_000
      if (days > 2) break
      if (
        !used.has(b.id) &&
        b.amountMinor === a.amountMinor &&
        merchantKey(b.merchantNormalised) === merchantKey(a.merchantNormalised) &&
        b.accountId === a.accountId
      ) {
        group.push(b)
      }
    }
    // Small repeated amounts (two coffees) are normal; flag only meaningful amounts.
    if (group.length > 1 && spendOf(a) >= 50_000) {
      group.forEach((t) => used.add(t.id))
      groups.push(group)
    }
  }
  return groups
}

/**
 * Potential savings for a month, built only from evidence in the user's data. Every opportunity
 * carries its calculation and linked transactions; amounts are estimates of what *could* be saved.
 */
export function computePotentialSavings(input: SavingsInput): SavingsReport {
  const { report, transactions, commitments, kinds } = input
  const currency = report.currency
  const fmt = (m: number): string => formatMoney(m, currency)
  const month = report.month
  const monthTxs = transactions.filter((t) => toMonthKey(t.transactionDate) === month)
  const opportunities: SavingsOpportunity[] = []

  // Subscriptions: each one is a cancel-or-downgrade candidate.
  for (const c of commitments) {
    if (c.status === 'ignored') continue
    if (c.categoryId !== 'subscriptions' && c.categoryId !== 'entertainment') continue
    const monthly = monthlyEquivalentMinor(c.typicalAmountMinor, c.cadence)
    const linked = new Set(c.linkedTransactionIds)
    opportunities.push({
      id: `sub:${c.merchantKey}`,
      kind: 'subscription',
      title: `Review ${c.merchantName}`,
      detail: `${fmt(c.typicalAmountMinor)} ${c.cadence}. Cancel it, pause it, or switch to a cheaper plan if you rarely use it.`,
      monthlyMinor: monthly,
      effort: 'easy',
      confidence: c.confidence,
      evidence: {
        calculation: [
          { label: `${c.merchantName} (${c.cadence})`, amountMinor: c.typicalAmountMinor },
          { label: 'Monthly equivalent', amountMinor: monthly, op: '=' }
        ],
        transactions: transactions
          .filter((t) => linked.has(t.id))
          .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
          .slice(0, 6)
          .map(toEvidence),
        notes: ['Saving assumes you cancel it entirely.']
      }
    })
  }

  // Categories running above the user's own normal range (reuses the insight evidence).
  for (const insight of report.insights) {
    if (insight.type === 'category_above_normal' && insight.estimatedImpactMinor) {
      opportunities.push({
        id: `cat:${insight.id}`,
        kind: 'category',
        categoryId: insight.id.split(':').pop() ?? null,
        title: insight.title.replace(
          ' spending is meaningfully above your normal range',
          ': back to your normal'
        ),
        detail: insight.summary,
        monthlyMinor: insight.estimatedImpactMinor,
        effort: 'medium',
        confidence: insight.confidence ?? 0.6,
        evidence: insight.evidence
      })
    }
    if (insight.type === 'fees' && insight.estimatedImpactMinor) {
      opportunities.push({
        id: `fees:${insight.id}`,
        kind: 'fees',
        title: 'Avoid bank and card charges',
        detail: insight.summary,
        monthlyMinor: insight.estimatedImpactMinor,
        effort: 'easy',
        confidence: 0.8,
        evidence: insight.evidence
      })
    }
  }

  // Possible double charges (one-time recovery, not counted in the monthly total).
  for (const group of findDuplicates(monthTxs, kinds)) {
    const extra = spendOf(group[0]!) * (group.length - 1)
    opportunities.push({
      id: `dup:${group[0]!.id}`,
      kind: 'duplicate',
      title: `Possible duplicate charge at ${group[0]!.merchantNormalised}`,
      detail: `${group.length} identical charges of ${fmt(spendOf(group[0]!))} within two days. If one was a mistake, ask for a refund.`,
      monthlyMinor: extra,
      effort: 'easy',
      confidence: 0.5,
      evidence: {
        calculation: [{ label: 'Possible extra charge', amountMinor: extra }],
        transactions: group.map(toEvidence),
        notes: ['One-time amount; not included in the monthly total.']
      }
    })
  }

  // Card rewards on the user's own spending mix (INR catalogue only).
  let cards: CardEstimate[] = []
  let cardsNote: string | null
  if (currency === 'INR') {
    const est = estimateCards(transactions, month, kinds)
    cards = est.cards
    const best = est.cards[0]
    if (best && best.netMonthlyGainMinor > 0 && est.eligibleMonthlyMinor > 0) {
      opportunities.push({
        id: `card:${best.cardId}`,
        kind: 'card_rewards',
        title: `Earn more rewards on what you already spend`,
        detail: `On your spending mix, a card like ${best.issuer} ${best.name} could earn about ${fmt(best.monthlyRewardMinor)}/month in rewards — roughly ${fmt(best.netMonthlyGainMinor)} more than a typical 1% card after its annual fee.`,
        monthlyMinor: best.netMonthlyGainMinor,
        effort: 'medium',
        confidence: 0.5,
        evidence: {
          calculation: [
            {
              label: `Reward-eligible spend per month (last ${est.months} month${est.months === 1 ? '' : 's'})`,
              amountMinor: est.eligibleMonthlyMinor
            },
            { label: `Estimated ${best.name} rewards`, amountMinor: best.monthlyRewardMinor },
            {
              label: 'What you likely earn today',
              amountMinor: est.todayMonthlyMinor,
              op: '−'
            },
            {
              label: 'Annual fee ÷ 12',
              amountMinor: Math.round(best.annualFeeMinor / 12),
              op: '−'
            },
            { label: 'Estimated extra per month', amountMinor: best.netMonthlyGainMinor, op: '=' }
          ],
          transactions: [],
          notes: [
            `Indicative reward rates as of ${CATALOGUE_AS_OF}; caps, exclusions and milestones are simplified. Verify with the issuer.`,
            'Rent, EMIs, insurance, investments, fees and cash are excluded as they rarely earn rewards.',
            'Informational only — not a recommendation to apply for credit.'
          ]
        }
      })
    }
    cardsNote = `Indicative rates as of ${CATALOGUE_AS_OF}. Caps and exclusions simplified; verify with the issuer.`
  } else {
    cardsNote = 'Card reward estimates are available for INR accounts only in this version.'
  }

  opportunities.push(...findAlternatives(transactions, month, kinds, currency))

  opportunities.sort(
    (a, b) =>
      (a.kind === 'duplicate' ? 1 : 0) - (b.kind === 'duplicate' ? 1 : 0) ||
      b.monthlyMinor - a.monthlyMinor
  )
  const totalMonthlyMinor = monthlyTotal(opportunities)

  return {
    month,
    currency,
    totalMonthlyMinor,
    opportunities,
    cards,
    cardsNote,
    assumptions: [
      'Estimates based only on your imported transactions.',
      'Subscription savings assume full cancellation; category savings assume returning to your own recent average.',
      'Possible duplicate charges are one-time and excluded from the monthly total.'
    ]
  }
}

/**
 * Monthly total without double counting: an "above your normal" saving and the cheaper
 * alternatives in the same category address the same money, so only the larger of the two counts.
 * One-time items (possible duplicate charges) are excluded.
 */
export function monthlyTotal(opportunities: readonly SavingsOpportunity[]): number {
  const byCategory = new Map<string, { habit: number; alternatives: number }>()
  let other = 0
  for (const o of opportunities) {
    if (o.kind === 'duplicate') continue
    if ((o.kind === 'category' || o.kind === 'alternative') && o.categoryId) {
      const e = byCategory.get(o.categoryId) ?? { habit: 0, alternatives: 0 }
      if (o.kind === 'category') e.habit += o.monthlyMinor
      else e.alternatives += o.monthlyMinor
      byCategory.set(o.categoryId, e)
    } else other += o.monthlyMinor
  }
  return other + sumMinor([...byCategory.values()].map((e) => Math.max(e.habit, e.alternatives)))
}
