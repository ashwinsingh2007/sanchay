import { addMonths, daysBetween, toMonthKey, type MonthKey } from '../dates'
import { formatMoney, sumMinor } from '../money'
import type {
  AccountType,
  FlowCategory,
  FlowMerchant,
  FlowSubscription,
  FlowTx,
  HiddenCost,
  IncomingGroup,
  MoneyFlow,
  RecurringCommitment,
  Transaction,
  TxSuggestion
} from '../types'
import { isAutoDebit } from './categorise'
import type { KindMap } from './cashflow'
import { merchantKey } from './merchant'
import { CADENCE_MONTHS } from './recurring'
import { payChannel, payTipFor } from './payAdvisor'
import { overlapGroup, suggestionFor } from './suggestions'

/** What the AI suggested for a merchant (cached per merchant key). */
export interface AiSuggestion {
  kind: TxSuggestion['kind']
  title: string
  detail: string
  alternatives: string[]
  /** Share of the monthly spend the alternative typically saves (0–1). */
  savingPct: number
}

export interface MoneyFlowInput {
  transactions: readonly Transaction[]
  commitments: readonly RecurringCommitment[]
  kinds: KindMap
  month: MonthKey
  currency: string
  accountNames: ReadonlyMap<string, string>
  accountTypes?: ReadonlyMap<string, AccountType>
  aiSuggestions?: ReadonlyMap<string, AiSuggestion | null>
}

/** Categories where "spend less" isn't the right advice (saving, debt, money you move). */
const NO_SUGGESTION_CATEGORIES = new Set(['investments', 'emi', 'transfers', 'income'])
/** Categories the AI is asked about when the catalogue has nothing. */
const AI_SKIP_CATEGORIES = new Set([
  ...NO_SUGGESTION_CATEGORIES,
  'fees',
  'cash',
  'housing',
  'insurance',
  'other'
])
/** Recurring payments that are bills/commitments rather than subscriptions. */
const NOT_SUBSCRIPTION = new Set([
  'emi',
  'investments',
  'insurance',
  'housing',
  'utilities',
  'income',
  'transfers',
  'cash',
  'fees'
])
const MIN_AI_MONTHLY_MINOR = 20_000
const SMALL_SUBSCRIPTION_MINOR = 30_000

const keyOf = (t: Transaction): string => merchantKey(t.merchantNormalised) || t.descriptionKey

export function aiSuggestionToTx(
  s: AiSuggestion,
  monthlyMinor: number,
  currency: string
): TxSuggestion | null {
  const pct = Math.min(1, Math.max(0, s.savingPct))
  const saving = Math.round(monthlyMinor * pct)
  if (saving < 5_000) return null
  return {
    kind: s.kind,
    title: s.title,
    detail: s.detail,
    alternatives: s.alternatives.slice(0, 4),
    monthlySavingMinor: saving,
    basis: `AI estimate: about ${Math.round(pct * 100)}% of the ${formatMoney(monthlyMinor, currency)}/month you spend here`,
    source: 'ai'
  }
}

/**
 * Everything that came in and went out in a month, with categories, subscriptions, hidden costs
 * and a per-merchant saving suggestion where one exists. Pure and deterministic.
 */
export function buildMoneyFlow(input: MoneyFlowInput): MoneyFlow {
  const { transactions, commitments, kinds, month, currency, accountNames } = input
  const ai = input.aiSuggestions ?? new Map<string, AiSuggestion | null>()

  const windowMonths = new Set([0, 1, 2].map((n) => addMonths(month, -n)))
  const prevMonths = new Set([1, 2, 3].map((n) => addMonths(month, -n)))
  const monthsWithData = new Set<string>()
  const prevWithData = new Set<string>()
  for (const t of transactions) {
    const m = toMonthKey(t.transactionDate)
    if (windowMonths.has(m)) monthsWithData.add(m)
    if (prevMonths.has(m)) prevWithData.add(m)
  }
  const windowCount = Math.max(1, monthsWithData.size)

  const isMoved = (t: Transaction): boolean =>
    t.isTransfer || kinds.get(t.categoryId ?? '') === 'transfer'
  const flowTx = (t: Transaction): FlowTx => ({
    id: t.id,
    date: t.transactionDate,
    description: t.descriptionOriginal,
    amountMinor: t.amountMinor,
    accountName: accountNames.get(t.accountId) ?? '',
    autoDebit: isAutoDebit(t.descriptionOriginal)
  })

  const inMonth = transactions.filter((t) => toMonthKey(t.transactionDate) === month)
  const inWindow = transactions.filter((t) => windowMonths.has(toMonthKey(t.transactionDate)))
  const commitmentKeys = new Set(
    commitments.filter((c) => c.status !== 'ignored').map((c) => c.merchantKey)
  )

  // Monthly average per merchant+category over the window (outflows), and months seen (inflows).
  const windowOut = new Map<string, number>()
  const monthsSeen = new Map<string, Set<string>>()
  for (const t of inWindow) {
    const k = `${keyOf(t)}|${t.categoryId ?? ''}`
    if (t.amountMinor < 0) windowOut.set(k, (windowOut.get(k) ?? 0) - t.amountMinor)
    const seen = monthsSeen.get(keyOf(t)) ?? new Set<string>()
    seen.add(toMonthKey(t.transactionDate))
    monthsSeen.set(keyOf(t), seen)
  }

  const merchantsOf = (txs: Transaction[], withSuggestions: boolean): FlowMerchant[] => {
    const groups = new Map<string, Transaction[]>()
    for (const t of txs) {
      const k = keyOf(t)
      groups.set(k, [...(groups.get(k) ?? []), t])
    }
    return [...groups.entries()]
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
        const first = sorted[0]!
        const total = Math.abs(sumMinor(list.map((t) => t.amountMinor)))
        const outflow = first.amountMinor < 0
        const monthly = outflow
          ? Math.round((windowOut.get(`${key}|${first.categoryId ?? ''}`) ?? total) / windowCount)
          : total
        let suggestion: TxSuggestion | null = null
        if (withSuggestions && outflow && !NO_SUGGESTION_CATEGORIES.has(first.categoryId ?? '')) {
          suggestion = suggestionFor(
            first.merchantNormalised,
            first.descriptionOriginal,
            first.categoryId,
            monthly,
            currency
          )
          const fromAi = ai.get(key)
          if (!suggestion && fromAi) suggestion = aiSuggestionToTx(fromAi, monthly, currency)
        }
        // Most common way this merchant was paid.
        const channels = new Map<string, number>()
        for (const t of list) {
          const c = payChannel(t.descriptionOriginal, input.accountTypes?.get(t.accountId))
          channels.set(c, (channels.get(c) ?? 0) + 1)
        }
        const channel = ([...channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
          'other') as ReturnType<typeof payChannel>
        const payTip =
          withSuggestions && outflow
            ? payTipFor({
                merchant: first.merchantNormalised,
                description: first.descriptionOriginal,
                categoryId: first.categoryId,
                monthlyMinor: monthly,
                channel
              })
            : null
        return {
          key,
          merchant: first.merchantNormalised,
          payTip,
          categoryId: first.categoryId,
          totalMinor: total,
          monthlyMinor: monthly,
          count: list.length,
          recurring:
            list.some((t) => t.isRecurring) ||
            commitmentKeys.has(key) ||
            (monthsSeen.get(key)?.size ?? 0) >= 2,
          autoDebit: list.some((t) => isAutoDebit(t.descriptionOriginal)),
          suggestion,
          transactions: sorted.map(flowTx)
        }
      })
      .sort((a, b) => b.totalMinor - a.totalMinor)
  }

  // ---------- Outgoing ----------
  const outflows = inMonth.filter((t) => t.amountMinor < 0)
  const moved = outflows.filter(isMoved)
  const out = outflows.filter((t) => !isMoved(t))
  const totalOut = -sumMinor(out.map((t) => t.amountMinor))
  const investingMinor = -sumMinor(
    out.filter((t) => kinds.get(t.categoryId ?? '') === 'savings').map((t) => t.amountMinor)
  )
  const debtMinor = -sumMinor(out.filter((t) => t.categoryId === 'emi').map((t) => t.amountMinor))

  const prevTotals = new Map<string, number>()
  for (const t of transactions) {
    if (t.amountMinor >= 0 || isMoved(t)) continue
    if (!prevMonths.has(toMonthKey(t.transactionDate))) continue
    const c = t.categoryId ?? 'other'
    prevTotals.set(c, (prevTotals.get(c) ?? 0) - t.amountMinor)
  }

  const byCategory = new Map<string, Transaction[]>()
  for (const t of out) {
    const c = t.categoryId ?? 'other'
    byCategory.set(c, [...(byCategory.get(c) ?? []), t])
  }
  const categories: FlowCategory[] = [...byCategory.entries()]
    .map(([categoryId, list]) => {
      const total = -sumMinor(list.map((t) => t.amountMinor))
      return {
        categoryId,
        kind: kinds.get(categoryId) ?? 'expense',
        totalMinor: total,
        sharePct: totalOut > 0 ? Math.round((total / totalOut) * 1000) / 10 : 0,
        usualMinor:
          prevWithData.size > 0
            ? Math.round((prevTotals.get(categoryId) ?? 0) / prevWithData.size)
            : null,
        count: list.length,
        merchants: merchantsOf(list, true)
      }
    })
    .sort((a, b) => b.totalMinor - a.totalMinor)

  // ---------- Subscriptions ----------
  const byId = new Map(transactions.map((t) => [t.id, t]))
  const subscriptions: FlowSubscription[] = commitments
    .filter((c) => c.status !== 'ignored' && !NOT_SUBSCRIPTION.has(c.categoryId ?? ''))
    .filter(
      (c) =>
        c.typicalAmountMinor < 0 ||
        c.linkedTransactionIds.some((id) => (byId.get(id)?.amountMinor ?? 0) < 0)
    )
    .map((c) => {
      const linked = c.linkedTransactionIds
        .map((id) => byId.get(id))
        .filter((t): t is Transaction => !!t && t.amountMinor < 0)
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
      const amount = Math.abs(c.typicalAmountMinor)
      const monthly = Math.round(amount / (c.cadence === 'custom' ? 1 : CADENCE_MONTHS[c.cadence]))
      const latest = linked[0]
      const previous = linked[1]
      const rise =
        latest && previous && -latest.amountMinor > -previous.amountMinor * 1.03
          ? Math.round(((latest.amountMinor - previous.amountMinor) / previous.amountMinor) * 100)
          : null
      return {
        key: c.merchantKey,
        merchant: c.merchantName,
        categoryId: c.categoryId,
        amountMinor: amount,
        cadence: c.cadence,
        monthlyMinor: monthly,
        nextExpectedDate: c.nextExpectedDate,
        lastSeenDate: c.lastSeenDate,
        autoDebit: linked.some((t) => isAutoDebit(t.descriptionOriginal)),
        overlapGroup: overlapGroup(c.merchantName),
        priceRisePct: rise,
        suggestion:
          suggestionFor(
            c.merchantName,
            latest?.descriptionOriginal ?? '',
            c.categoryId,
            monthly,
            currency
          ) ??
          (ai.get(c.merchantKey)
            ? aiSuggestionToTx(ai.get(c.merchantKey)!, monthly, currency)
            : null)
      }
    })
    .sort((a, b) => b.monthlyMinor - a.monthlyMinor)

  // ---------- Hidden costs ----------
  const hidden: HiddenCost[] = []
  const fmt = (m: number): string => formatMoney(m, currency)

  const fees = out.filter((t) => t.categoryId === 'fees')
  if (fees.length > 0) {
    const total = -sumMinor(fees.map((t) => t.amountMinor))
    hidden.push({
      id: 'fees',
      kind: 'fee',
      title: `${fees.length} bank or card charge${fees.length === 1 ? '' : 's'}`,
      detail:
        'Late fees, interest, minimum-balance and forex charges are easy to miss and usually avoidable.',
      amountMinor: total,
      transactions: fees.map(flowTx)
    })
  }

  const overlaps = new Map<string, FlowSubscription[]>()
  for (const s of subscriptions) {
    if (!s.overlapGroup) continue
    overlaps.set(s.overlapGroup, [...(overlaps.get(s.overlapGroup) ?? []), s])
  }
  for (const [group, subs] of overlaps) {
    if (subs.length < 2) continue
    const total = sumMinor(subs.map((s) => s.monthlyMinor))
    const keep = Math.max(...subs.map((s) => s.monthlyMinor))
    hidden.push({
      id: `overlap-${group}`,
      kind: 'overlap',
      title: `Paying for ${subs.length} ${group} services`,
      detail: `${subs.map((s) => s.merchant).join(', ')} — ${fmt(total)}/month together. Keeping just one saves about ${fmt(total - keep)}/month.`,
      amountMinor: total - keep,
      transactions: []
    })
  }

  for (const s of subscriptions) {
    if (s.priceRisePct == null || s.priceRisePct < 3) continue
    hidden.push({
      id: `rise-${s.key}`,
      kind: 'price_rise',
      title: `${s.merchant} went up ${s.priceRisePct}%`,
      detail:
        'Prices on auto-renewing plans often rise quietly. Check whether a cheaper plan fits.',
      amountMinor: Math.round((s.amountMinor * s.priceRisePct) / (100 + s.priceRisePct)),
      transactions: []
    })
  }

  const small = subscriptions.filter(
    (s) => s.monthlyMinor > 0 && s.monthlyMinor < SMALL_SUBSCRIPTION_MINOR
  )
  if (small.length >= 2) {
    const total = sumMinor(small.map((s) => s.monthlyMinor))
    hidden.push({
      id: 'small-recurring',
      kind: 'small_recurring',
      title: `${small.length} small recurring charges add up`,
      detail: `${small.map((s) => s.merchant).join(', ')} — ${fmt(total)}/month, ${fmt(total * 12)}/year. Small auto-renewals are the easiest to forget.`,
      amountMinor: total,
      transactions: []
    })
  }

  // Same merchant, same amount, within a day: possibly charged twice.
  const sortedOut = [...out].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
  const usedDup = new Set<string>()
  for (let i = 0; i < sortedOut.length; i++) {
    const a = sortedOut[i]!
    if (usedDup.has(a.id)) continue
    for (let j = i + 1; j < sortedOut.length; j++) {
      const b = sortedOut[j]!
      if (daysBetween(a.transactionDate, b.transactionDate) > 1) break
      if (usedDup.has(b.id) || b.amountMinor !== a.amountMinor || keyOf(a) !== keyOf(b)) continue
      if (a.categoryId === 'investments' || a.categoryId === 'emi') continue
      usedDup.add(a.id)
      usedDup.add(b.id)
      hidden.push({
        id: `dup-${a.id}`,
        kind: 'duplicate',
        title: `Possible double charge at ${a.merchantNormalised}`,
        detail:
          'Two identical charges within a day. If you only bought once, ask the merchant or bank for a reversal.',
        amountMinor: -a.amountMinor,
        transactions: [flowTx(a), flowTx(b)]
      })
      break
    }
  }
  hidden.sort((a, b) => b.amountMinor - a.amountMinor)

  // ---------- Suggestions (best per merchant) ----------
  const best = new Map<string, MoneyFlow['outgoing']['suggestions'][number]>()
  const consider = (
    key: string,
    merchant: string,
    categoryId: string | null,
    s: TxSuggestion | null
  ): void => {
    if (!s) return
    const prev = best.get(key)
    if (!prev || s.monthlySavingMinor > prev.monthlySavingMinor)
      best.set(key, { ...s, merchant, merchantKey: key, categoryId })
  }
  for (const c of categories)
    for (const m of c.merchants) consider(m.key, m.merchant, m.categoryId, m.suggestion)
  for (const s of subscriptions) consider(s.key, s.merchant, s.categoryId, s.suggestion)
  const suggestions = [...best.values()].sort((a, b) => b.monthlySavingMinor - a.monthlySavingMinor)

  const payTips = categories
    .flatMap((c) =>
      c.merchants
        .filter((m) => m.payTip)
        .map((m) => ({
          ...m.payTip!,
          merchant: m.merchant,
          merchantKey: m.key,
          monthlyMinor: m.monthlyMinor
        }))
    )
    .sort((a, b) => b.monthlyGainMinor - a.monthlyGainMinor)

  // ---------- Incoming ----------
  const inflows = inMonth.filter((t) => t.amountMinor > 0)
  const groupOf = (t: Transaction): IncomingGroup['id'] =>
    isMoved(t) ? 'own_money' : kinds.get(t.categoryId ?? '') === 'income' ? 'income' : 'refunds'
  const meta: Record<IncomingGroup['id'], { label: string; description: string }> = {
    income: {
      label: 'Income',
      description: 'Salary, interest, dividends and other money you earned.'
    },
    refunds: { label: 'Refunds & reversals', description: 'Money returned for things you bought.' },
    own_money: {
      label: 'Your own money moving',
      description: 'Transfers between your accounts, card payments received and FD/fund maturities.'
    }
  }
  const groups: IncomingGroup[] = (['income', 'refunds', 'own_money'] as const)
    .map((id) => {
      const list = inflows.filter((t) => groupOf(t) === id)
      return {
        id,
        ...meta[id],
        totalMinor: sumMinor(list.map((t) => t.amountMinor)),
        merchants: merchantsOf(list, false)
      }
    })
    .filter((g) => g.merchants.length > 0)
  const totalIn = sumMinor(groups.filter((g) => g.id !== 'own_money').map((g) => g.totalMinor))

  // Merchants worth asking the AI about: discretionary, meaningful, nothing in the catalogue.
  let pendingAi = 0
  for (const c of categories) {
    if (AI_SKIP_CATEGORIES.has(c.categoryId) || c.kind !== 'expense') continue
    for (const m of c.merchants)
      if (!m.suggestion && !ai.has(m.key) && m.monthlyMinor >= MIN_AI_MONTHLY_MINOR) pendingAi++
  }

  return {
    month,
    incoming: { totalMinor: totalIn, groups },
    outgoing: {
      totalMinor: totalOut,
      spendingMinor: totalOut - investingMinor,
      investingMinor,
      debtMinor,
      movedMinor: -sumMinor(moved.map((t) => t.amountMinor)),
      categories,
      subscriptions,
      hidden,
      suggestions,
      potentialMonthlyMinor: sumMinor(suggestions.map((s) => s.monthlySavingMinor)),
      payTips,
      rewardsLeftMinor: sumMinor(payTips.map((p) => p.monthlyGainMinor))
    },
    netMinor: totalIn - totalOut,
    pendingAiMerchants: pendingAi
  }
}

/** Merchants to ask the AI for alternatives about (largest monthly spend first). */
export function aiSuggestionCandidates(
  flow: MoneyFlow,
  asked: ReadonlySet<string>,
  limit = 15
): { key: string; merchant: string; categoryId: string; monthlyMinor: number }[] {
  return flow.outgoing.categories
    .filter((c) => !AI_SKIP_CATEGORIES.has(c.categoryId) && c.kind === 'expense')
    .flatMap((c) =>
      c.merchants
        .filter((m) => !m.suggestion && !asked.has(m.key) && m.monthlyMinor >= MIN_AI_MONTHLY_MINOR)
        .map((m) => ({
          key: m.key,
          merchant: m.merchant,
          categoryId: c.categoryId,
          monthlyMinor: m.monthlyMinor
        }))
    )
    .sort((a, b) => b.monthlyMinor - a.monthlyMinor)
    .slice(0, limit)
}
