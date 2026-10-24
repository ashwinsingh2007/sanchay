import { toMonthKey, type MonthKey } from '../dates'
import { medianMinor, savingRate, sumMinor } from '../money'
import type {
  Category,
  CategoryKind,
  CategoryTotal,
  ChangeDriver,
  Direction,
  EvidenceTx,
  MonthSummary,
  Transaction
} from '../types'
import { merchantKey } from './merchant'

export type AnalysisTx = Pick<
  Transaction,
  | 'id'
  | 'transactionDate'
  | 'merchantNormalised'
  | 'descriptionOriginal'
  | 'amountMinor'
  | 'direction'
  | 'categoryId'
  | 'isTransfer'
>

export type KindMap = ReadonlyMap<string, CategoryKind>

export function kindMap(categories: readonly Category[]): KindMap {
  return new Map(categories.map((c) => [c.id, c.kind]))
}

/** Direction is derived from the category kind; transfers never count as income or spending. */
export function directionFor(
  kind: CategoryKind | null | undefined,
  isTransfer: boolean,
  amountMinor: number
): Direction {
  if (isTransfer || kind === 'transfer') return 'transfer'
  if (kind === 'income') return 'income'
  if (kind === 'expense' || kind === 'savings') return 'expense'
  return amountMinor > 0 ? 'income' : amountMinor < 0 ? 'expense' : 'unknown'
}

/** Spending = expense-direction transactions outside the Investments & Savings category. */
export function isSpending(t: AnalysisTx, kinds: KindMap): boolean {
  return t.direction === 'expense' && kinds.get(t.categoryId ?? '') !== 'savings'
}

export function isInvesting(t: AnalysisTx, kinds: KindMap): boolean {
  return t.direction === 'expense' && kinds.get(t.categoryId ?? '') === 'savings'
}

/** Positive spend amount for a transaction (refunds are negative spend). */
export function spendOf(t: AnalysisTx): number {
  return -t.amountMinor
}

export function inMonth<T extends Pick<Transaction, 'transactionDate'>>(
  txs: readonly T[],
  month: MonthKey
): T[] {
  return txs.filter((t) => toMonthKey(t.transactionDate) === month)
}

export function toEvidence(t: AnalysisTx): EvidenceTx {
  return {
    id: t.id,
    date: t.transactionDate,
    merchant: t.merchantNormalised,
    description: t.descriptionOriginal,
    amountMinor: t.amountMinor,
    categoryId: t.categoryId
  }
}

export function categorySpend(
  txs: readonly AnalysisTx[],
  kinds: KindMap,
  excludeIds: ReadonlySet<string> = new Set()
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (!isSpending(t, kinds) || excludeIds.has(t.id)) continue
    const key = t.categoryId ?? 'other'
    totals.set(key, (totals.get(key) ?? 0) + spendOf(t))
  }
  return totals
}

/**
 * Monthly cash flow.
 *   income      = income-direction transactions (transfers excluded)
 *   spending    = expense-direction transactions, excluding Investments & Savings
 *   invested    = outflows categorised as Investments & Savings (shown separately)
 *   netCashFlow = income - spending   (your surplus, part of which you may have invested)
 */
export function summariseMonth(
  allTxs: readonly AnalysisTx[],
  month: MonthKey,
  kinds: KindMap
): MonthSummary {
  const txs = inMonth(allTxs, month)
  const incomeMinor = sumMinor(
    txs.filter((t) => t.direction === 'income').map((t) => t.amountMinor)
  )
  const spendingMinor = sumMinor(txs.filter((t) => isSpending(t, kinds)).map(spendOf))
  const investedMinor = sumMinor(txs.filter((t) => isInvesting(t, kinds)).map(spendOf))

  const byCategoryMap = new Map<string, CategoryTotal>()
  for (const t of txs) {
    if (!isSpending(t, kinds)) continue
    const key = t.categoryId ?? 'other'
    const entry = byCategoryMap.get(key) ?? { categoryId: key, spendMinor: 0, count: 0 }
    entry.spendMinor += spendOf(t)
    entry.count++
    byCategoryMap.set(key, entry)
  }
  const dates = txs.map((t) => t.transactionDate).sort()

  return {
    month,
    incomeMinor,
    spendingMinor,
    investedMinor,
    netCashFlowMinor: incomeMinor - spendingMinor,
    savingRate: savingRate(incomeMinor, spendingMinor),
    transactionCount: txs.length,
    transferCount: txs.filter((t) => t.direction === 'transfer').length,
    byCategory: [...byCategoryMap.values()]
      .filter((c) => c.spendMinor !== 0)
      .sort((a, b) => b.spendMinor - a.spendMinor),
    coverageStart: dates[0] ?? null,
    coverageEnd: dates[dates.length - 1] ?? null
  }
}

export interface OneOffOptions {
  /** Merchant keys of monthly commitments: never one-offs. */
  monthlyRecurringKeys: ReadonlySet<string>
  /** Merchant keys of quarterly/yearly commitments: large periodic payments count as one-offs. */
  periodicKeys: ReadonlySet<string>
}

const NEVER_ONE_OFF = new Set(['housing', 'emi', 'groceries', 'dining', 'transport'])

/**
 * Flags large, unusual expenses so they are reported separately instead of looking like an
 * overspending trend. A transaction is a one-off when it is large relative to the month AND the
 * merchant was not seen in the prior months (or is a known quarterly/yearly payment).
 */
export function detectOneOffs(
  monthTxs: readonly AnalysisTx[],
  priorTxs: readonly AnalysisTx[],
  kinds: KindMap,
  options: OneOffOptions
): Set<string> {
  const spending = monthTxs.filter((t) => isSpending(t, kinds) && spendOf(t) > 0)
  const total = sumMinor(spending.map(spendOf))
  if (total <= 0 || spending.length < 3) return new Set()
  const median = medianMinor(spending.map(spendOf))
  const priorMerchants = new Set(priorTxs.map((t) => merchantKey(t.merchantNormalised)))

  const result = new Set<string>()
  for (const t of spending) {
    const amount = spendOf(t)
    if (NEVER_ONE_OFF.has(t.categoryId ?? '')) continue
    if (amount < total * 0.1 || amount < median * 3) continue
    const key = merchantKey(t.merchantNormalised)
    if (options.monthlyRecurringKeys.has(key)) continue
    if (priorMerchants.has(key) && !options.periodicKeys.has(key)) continue
    result.add(t.id)
  }
  return result
}

export interface CompareInput {
  currentTxs: readonly AnalysisTx[]
  previousTxs: readonly AnalysisTx[]
  currentOneOffs: ReadonlySet<string>
  previousOneOffs: ReadonlySet<string>
  kinds: KindMap
  categoryName: (id: string) => string
  maxDrivers?: number
}

/**
 * Month-over-month change by category: difference = current - previous category spend.
 * One-off expenses are carved out into their own drivers so they don't masquerade as trends.
 */
export function compareMonths(input: CompareInput): {
  spendingDiffMinor: number
  drivers: ChangeDriver[]
} {
  const { currentTxs, previousTxs, currentOneOffs, previousOneOffs, kinds } = input
  const currTotal = sumMinor(currentTxs.filter((t) => isSpending(t, kinds)).map(spendOf))
  const prevTotal = sumMinor(previousTxs.filter((t) => isSpending(t, kinds)).map(spendOf))
  const drivers: ChangeDriver[] = []

  for (const t of currentTxs) {
    if (!currentOneOffs.has(t.id)) continue
    drivers.push({
      kind: 'one_off',
      label: `One-off: ${t.merchantNormalised}`,
      categoryId: t.categoryId,
      diffMinor: spendOf(t),
      currentMinor: spendOf(t),
      previousMinor: 0,
      note: 'Large one-off payment — reported separately, not treated as a spending trend.',
      transactions: [toEvidence(t)]
    })
  }
  for (const t of previousTxs) {
    if (!previousOneOffs.has(t.id)) continue
    drivers.push({
      kind: 'previous_one_off',
      label: `Last month's one-off: ${t.merchantNormalised}`,
      categoryId: t.categoryId,
      diffMinor: -spendOf(t),
      currentMinor: 0,
      previousMinor: spendOf(t),
      note: 'A one-off payment last month that did not repeat.',
      transactions: [toEvidence(t)]
    })
  }

  const curr = categorySpend(currentTxs, kinds, currentOneOffs)
  const prev = categorySpend(previousTxs, kinds, previousOneOffs)
  for (const categoryId of new Set([...curr.keys(), ...prev.keys()])) {
    const c = curr.get(categoryId) ?? 0
    const p = prev.get(categoryId) ?? 0
    if (c === p) continue
    const txs = currentTxs
      .filter(
        (t) =>
          (t.categoryId ?? 'other') === categoryId &&
          isSpending(t, kinds) &&
          !currentOneOffs.has(t.id)
      )
      .sort((a, b) => spendOf(b) - spendOf(a))
      .slice(0, 8)
      .map(toEvidence)
    drivers.push({
      kind: 'category',
      label: input.categoryName(categoryId),
      categoryId,
      diffMinor: c - p,
      currentMinor: c,
      previousMinor: p,
      note: p === 0 ? 'No spending in this category last month.' : '',
      transactions: txs
    })
  }

  const threshold = Math.max(1, Math.round(Math.max(currTotal, prevTotal) * 0.02))
  const meaningful = drivers
    .filter((d) => d.kind !== 'category' || Math.abs(d.diffMinor) >= threshold)
    .sort((a, b) => Math.abs(b.diffMinor) - Math.abs(a.diffMinor))
    .slice(0, input.maxDrivers ?? 6)

  return { spendingDiffMinor: currTotal - prevTotal, drivers: meaningful }
}
