import { addMonthsClamped, daysBetween, type ISODate } from '../dates'
import { medianMinor } from '../money'
import type { Cadence, CommitmentOccurrence, CommitmentStatus, RecurringCommitment } from '../types'
import { merchantKey } from './merchant'

export interface RecurringInputTx {
  id: string
  date: ISODate
  merchant: string
  amountMinor: number
  categoryId: string | null
  isTransfer: boolean
}

export interface DetectedCommitment {
  merchantKey: string
  merchantName: string
  categoryId: string | null
  typicalAmountMinor: number
  cadence: Exclude<Cadence, 'custom'>
  nextExpectedDate: ISODate
  lastSeenDate: ISODate
  confidence: number
  suggestedStatus: CommitmentStatus
  possiblyEnded: boolean
  transactionIds: string[]
  occurrences: number
}

export interface RecurringOptions {
  /** Relative tolerance for "similar amount", e.g. 0.15 = ±15% of the cluster median. */
  amountTolerance: number
  /** Next expected dates are rolled forward to on/after this date. */
  referenceDate: ISODate
  /** Last date covered by imported data, used to judge if a commitment has stopped. */
  dataEndDate: ISODate
}

const CADENCES: {
  cadence: Exclude<Cadence, 'custom'>
  months: number
  min: number
  max: number
  minCount: number
}[] = [
  { cadence: 'monthly', months: 1, min: 25, max: 36, minCount: 3 },
  { cadence: 'quarterly', months: 3, min: 80, max: 100, minCount: 3 },
  { cadence: 'yearly', months: 12, min: 345, max: 385, minCount: 2 }
]

export const CADENCE_MONTHS: Record<Exclude<Cadence, 'custom'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12
}

function withinTolerance(a: number, b: number, tolerance: number): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(Math.abs(a) - Math.abs(b)) <= base * tolerance
}

/** Largest group of transactions whose amounts are within tolerance of one another. */
function largestAmountCluster(txs: RecurringInputTx[], tolerance: number): RecurringInputTx[] {
  let best: RecurringInputTx[] = []
  for (const anchor of txs) {
    const cluster = txs.filter((t) => withinTolerance(t.amountMinor, anchor.amountMinor, tolerance))
    const bestLast = best[best.length - 1]?.date ?? ''
    const clusterLast = cluster[cluster.length - 1]?.date ?? ''
    if (
      cluster.length > best.length ||
      (cluster.length === best.length && clusterLast > bestLast)
    ) {
      best = cluster
    }
  }
  return best
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>()
  let best: T | null = null
  let bestCount = 0
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1
    counts.set(v, c)
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

/**
 * Deterministic recurring-payment detection.
 *
 * For each merchant: take the largest cluster of similar amounts, measure the gaps between
 * consecutive charges, and accept the cluster if most gaps fall in a monthly, quarterly or yearly
 * window. Confidence grows with the number of occurrences and the regularity of the gaps.
 */
export function detectRecurring(
  transactions: readonly RecurringInputTx[],
  options: RecurringOptions
): DetectedCommitment[] {
  const groups = new Map<string, RecurringInputTx[]>()
  for (const t of transactions) {
    if (t.amountMinor >= 0 || t.isTransfer) continue
    const key = merchantKey(t.merchant)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }

  const results: DetectedCommitment[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    const cluster = largestAmountCluster(list, options.amountTolerance)
    if (cluster.length < 2) continue
    // Frequent, variable spending at one merchant (e.g. food delivery) is not a fixed commitment,
    // even if a few orders happen to have similar amounts a month apart.
    if (list.length - cluster.length > cluster.length * 1.5) continue

    const gaps: number[] = []
    for (let i = 1; i < cluster.length; i++)
      gaps.push(daysBetween(cluster[i - 1]!.date, cluster[i]!.date))
    const sortedGaps = [...gaps].sort((a, b) => a - b)
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)]!

    const spec = CADENCES.find((c) => medianGap >= c.min && medianGap <= c.max)
    if (!spec || cluster.length < spec.minCount) continue
    const regularity = gaps.filter((g) => g >= spec.min && g <= spec.max).length / gaps.length
    if (regularity < 0.6) continue

    const occurrenceScore = Math.min(1, (cluster.length - 1) / 5)
    let confidence = 0.4 + 0.35 * occurrenceScore + 0.25 * regularity
    if (spec.cadence === 'yearly' && cluster.length < 3) confidence = Math.min(confidence, 0.6)

    const last = cluster[cluster.length - 1]!
    const dayOfMonth = Number(last.date.slice(8, 10))
    let next = addMonthsClamped(last.date, spec.months, dayOfMonth)
    // If the merchant stopped appearing while newer data exists, the commitment may have ended.
    const overdueDays = daysBetween(next, options.dataEndDate)
    const graceDays = spec.cadence === 'monthly' ? 10 : 20
    const possiblyEnded = overdueDays > graceDays
    if (possiblyEnded) confidence *= 0.6
    let guard = 0
    while (next < options.referenceDate && guard++ < 240) {
      next = addMonthsClamped(next, spec.months, dayOfMonth)
    }

    confidence = Math.round(Math.min(0.95, confidence) * 100) / 100
    results.push({
      merchantKey: key,
      merchantName: last.merchant,
      categoryId: mostCommon(cluster.map((t) => t.categoryId)),
      typicalAmountMinor: Math.abs(medianMinor(cluster.map((t) => t.amountMinor))),
      cadence: spec.cadence,
      nextExpectedDate: next,
      lastSeenDate: last.date,
      confidence,
      suggestedStatus: !possiblyEnded && confidence >= 0.75 ? 'active' : 'review',
      possiblyEnded,
      transactionIds: cluster.map((t) => t.id),
      occurrences: cluster.length
    })
  }
  return results.sort((a, b) => b.typicalAmountMinor - a.typicalAmountMinor)
}

/** Converts a commitment amount into its average monthly cost. */
export function monthlyEquivalentMinor(amountMinor: number, cadence: Cadence): number {
  if (cadence === 'quarterly') return Math.round(amountMinor / 3)
  if (cadence === 'yearly') return Math.round(amountMinor / 12)
  return amountMinor
}

/**
 * Expected charges in [from, untilExclusive). Monthly commitments can occur more than once in a
 * long window. Ignored commitments are excluded.
 */
export function occurrencesBetween(
  commitments: readonly RecurringCommitment[],
  from: ISODate,
  untilExclusive: ISODate
): CommitmentOccurrence[] {
  const out: CommitmentOccurrence[] = []
  for (const c of commitments) {
    if (c.status === 'ignored' || !c.nextExpectedDate) continue
    const months = c.cadence === 'custom' ? 1 : CADENCE_MONTHS[c.cadence]
    const day = Number(c.nextExpectedDate.slice(8, 10))
    let date = c.nextExpectedDate
    let guard = 0
    while (date < untilExclusive && guard++ < 60) {
      if (date >= from) {
        out.push({
          commitmentId: c.id,
          merchantName: c.merchantName,
          date,
          amountMinor: c.typicalAmountMinor,
          status: c.status
        })
      }
      date = addMonthsClamped(date, months, day)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amountMinor - a.amountMinor)
}
