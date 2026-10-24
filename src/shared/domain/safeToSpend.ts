import { addMonthsClamped, daysBetween, type ISODate } from '../dates'
import { sumMinor } from '../money'
import type { Account, RecurringCommitment, SafeToSpend, UserFinancialSettings } from '../types'
import { occurrencesBetween } from './recurring'

/** Rolls a stored income date forward month by month until it is today or later. */
export function effectiveNextIncomeDate(stored: ISODate | null, today: ISODate): ISODate | null {
  if (!stored) return null
  const day = Number(stored.slice(8, 10))
  let date = stored
  let guard = 0
  while (date < today && guard++ < 600) date = addMonthsClamped(date, 1, day)
  return date
}

export interface SafeToSpendInput {
  accounts: readonly Pick<Account, 'id' | 'name' | 'type' | 'currentBalanceMinor' | 'balanceAsOf'>[]
  commitments: readonly RecurringCommitment[]
  settings: Pick<UserFinancialSettings, 'nextIncomeDate' | 'emergencyBufferMinor'>
  today: ISODate
}

/**
 * safeToSpend = max(0, availableCash - commitmentsBeforeNextIncome - emergencyBuffer)
 *
 * availableCash: user-entered (or statement) balances of bank and cash accounts only.
 * commitments:   non-ignored recurring commitments expected from today until the day before
 *                the next income date.
 * Returns a setup prompt instead of a number when balances or the income date are missing.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpend {
  const cashAccounts = input.accounts.filter(
    (a) => (a.type === 'bank' || a.type === 'cash') && a.currentBalanceMinor != null
  )
  const nextIncomeDate = effectiveNextIncomeDate(input.settings.nextIncomeDate, input.today)

  const missing: ('balance' | 'next_income_date')[] = []
  if (cashAccounts.length === 0) missing.push('balance')
  if (!nextIncomeDate) missing.push('next_income_date')
  if (missing.length > 0 || !nextIncomeDate) return { status: 'needs_setup', missing }

  const availableCashMinor = sumMinor(cashAccounts.map((a) => a.currentBalanceMinor ?? 0))
  const commitments = occurrencesBetween(input.commitments, input.today, nextIncomeDate)
  const commitmentsMinor = sumMinor(commitments.map((c) => c.amountMinor))
  const bufferMinor = Math.max(0, input.settings.emergencyBufferMinor)
  const raw = availableCashMinor - commitmentsMinor - bufferMinor
  const valueMinor = Math.max(0, raw)
  const daysUntilIncome = Math.max(0, daysBetween(input.today, nextIncomeDate))

  return {
    status: 'ok',
    valueMinor,
    shortfallMinor: raw < 0 ? -raw : 0,
    availableCashMinor,
    commitmentsMinor,
    bufferMinor,
    nextIncomeDate,
    daysUntilIncome,
    dailyAllowanceMinor:
      daysUntilIncome > 0 ? Math.floor(valueMinor / daysUntilIncome) : valueMinor,
    accounts: cashAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      balanceMinor: a.currentBalanceMinor ?? 0,
      balanceAsOf: a.balanceAsOf
    })),
    commitments
  }
}

/**
 * Guesses the next income date from imported data when the user hasn't set one: takes the
 * merchant with the largest total income (usually the employer), and projects its latest credit
 * forward month by month. Returns null if there is no income.
 */
export function inferNextIncomeDate(
  txs: readonly {
    transactionDate: ISODate
    amountMinor: number
    direction: string
    merchantNormalised: string
  }[],
  today: ISODate
): ISODate | null {
  const totals = new Map<string, { total: number; last: ISODate }>()
  for (const t of txs) {
    if (t.direction !== 'income' || t.amountMinor <= 0) continue
    const entry = totals.get(t.merchantNormalised) ?? { total: 0, last: t.transactionDate }
    entry.total += t.amountMinor
    if (t.transactionDate > entry.last) entry.last = t.transactionDate
    totals.set(t.merchantNormalised, entry)
  }
  let best: { total: number; last: ISODate } | null = null
  for (const e of totals.values()) if (!best || e.total > best.total) best = e
  if (!best) return null
  const next = addMonthsClamped(best.last, 1)
  return effectiveNextIncomeDate(next, today)
}
