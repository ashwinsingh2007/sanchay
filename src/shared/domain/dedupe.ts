import { daysBetween } from '../dates'
import { cleanMerchantName, descriptionKey, merchantKey, normaliseForMatch } from './merchant'

export interface DedupeCandidate {
  accountId: string
  date: string
  description: string
  amountMinor: number
}

export function dedupeKey(t: DedupeCandidate): string {
  return `${t.accountId}|${t.date}|${descriptionKey(t.description)}|${t.amountMinor}`
}

/** Words that identify a merchant; drops reference numbers that differ between exports. */
function tokens(description: string): Set<string> {
  return new Set(
    normaliseForMatch(description)
      .split(' ')
      .filter((t) => t.length > 1 && !/\d{3,}/.test(t))
  )
}

/**
 * How likely two descriptions describe the same transaction (0–1). Bank exports of the same
 * statement often differ in reference numbers, spacing or truncation, so exact text is too strict.
 */
export function descriptionSimilarity(a: string, b: string): number {
  if (descriptionKey(a) === descriptionKey(b)) return 1
  const ma = merchantKey(cleanMerchantName(a))
  const mb = merchantKey(cleanMerchantName(b))
  if (ma && ma === mb) return 0.9
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / (ta.size + tb.size - shared)
}

export interface MatchOptions {
  /** Allowed difference between booking and value dates across exports. */
  dateToleranceDays?: number
  minSimilarity?: number
}

export interface MatchResult<T, E> {
  fresh: T[]
  duplicates: { incoming: T; existing: E }[]
}

/**
 * Pairs each incoming transaction with at most one existing transaction that is the same money
 * movement: identical signed amount, same or adjacent date, and a similar description.
 *
 * Matching is one-to-one, so two genuine identical coffees are only both treated as duplicates if
 * two matching coffees already exist. Exact-date matches are taken before ±1-day matches.
 */
export function matchDuplicates<
  T extends Omit<DedupeCandidate, 'accountId'>,
  E extends Omit<DedupeCandidate, 'accountId'>
>(incoming: readonly T[], existing: readonly E[], options: MatchOptions = {}): MatchResult<T, E> {
  const tolerance = options.dateToleranceDays ?? 1
  const minSimilarity = options.minSimilarity ?? 0.5

  const byAmount = new Map<number, { row: E; used: boolean }[]>()
  for (const row of existing) {
    const list = byAmount.get(row.amountMinor) ?? []
    list.push({ row, used: false })
    byAmount.set(row.amountMinor, list)
  }

  const matched = new Map<number, E>()
  for (const pass of [0, tolerance]) {
    incoming.forEach((t, i) => {
      if (matched.has(i)) return
      const pool = byAmount.get(t.amountMinor)
      if (!pool) return
      let best: { row: E; used: boolean } | null = null
      let bestScore = -1
      for (const cand of pool) {
        if (cand.used) continue
        const gap = Math.abs(daysBetween(t.date, cand.row.date))
        if (gap > pass) continue
        const sim = descriptionSimilarity(t.description, cand.row.description)
        if (sim < minSimilarity) continue
        const score = sim - gap * 0.05
        if (score > bestScore) {
          best = cand
          bestScore = score
        }
      }
      if (best) {
        best.used = true
        matched.set(i, best.row)
      }
    })
  }

  const fresh: T[] = []
  const duplicates: { incoming: T; existing: E }[] = []
  incoming.forEach((t, i) => {
    const e = matched.get(i)
    if (e) duplicates.push({ incoming: t, existing: e })
    else fresh.push(t)
  })
  return { fresh, duplicates }
}

/** Convenience wrapper used by the importer: split rows into new and already-present. */
export function partitionDuplicates<
  T extends DedupeCandidate,
  E extends Omit<DedupeCandidate, 'accountId'>
>(
  incoming: readonly T[],
  existing: readonly E[],
  options?: MatchOptions
): { fresh: T[]; duplicates: T[] } {
  const r = matchDuplicates(incoming, existing, options)
  return { fresh: r.fresh, duplicates: r.duplicates.map((d) => d.incoming) }
}
