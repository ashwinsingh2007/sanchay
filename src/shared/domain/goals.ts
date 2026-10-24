import { addMonthsClamped, wholeMonthsBetween, type ISODate } from '../dates'
import type { GoalProjection, SavingsGoal } from '../types'

/**
 * Savings-goal projection. All outputs are estimates based on the user's own inputs:
 * no investment returns, inflation or interest are assumed.
 */
export function projectGoal(goal: SavingsGoal, today: ISODate): GoalProjection {
  const remainingMinor = Math.max(0, goal.targetAmountMinor - goal.currentAmountMinor)
  const isComplete = remainingMinor === 0
  const progressPct =
    goal.targetAmountMinor > 0
      ? Math.min(100, Math.round((goal.currentAmountMinor / goal.targetAmountMinor) * 1000) / 10)
      : 0
  const monthsRemaining = Math.max(0, wholeMonthsBetween(today, goal.targetDate))
  // If the target date is under a month away (or passed), the remainder is needed now.
  const requiredMonthlyMinor = isComplete
    ? 0
    : Math.ceil(remainingMinor / Math.max(1, monthsRemaining))

  const contribution =
    goal.monthlyContributionMinor && goal.monthlyContributionMinor > 0
      ? goal.monthlyContributionMinor
      : null
  let projectedCompletionDate: ISODate | null = null
  if (isComplete) projectedCompletionDate = today
  else if (contribution) {
    projectedCompletionDate = addMonthsClamped(today, Math.ceil(remainingMinor / contribution))
  }

  const onTrack = isComplete
    ? true
    : contribution
      ? projectedCompletionDate! <= goal.targetDate
      : null
  const gapMonthlyMinor = isComplete ? 0 : Math.max(0, requiredMonthlyMinor - (contribution ?? 0))

  const assumptions = [
    'Estimate only. Assumes a fixed monthly amount set aside, with no interest, returns or inflation.',
    contribution
      ? 'Uses the monthly contribution you entered.'
      : 'No monthly contribution entered, so no completion date is projected.',
    `Counts ${monthsRemaining} whole month${monthsRemaining === 1 ? '' : 's'} until the target date.`
  ]

  return {
    goalId: goal.id,
    name: goal.name,
    targetAmountMinor: goal.targetAmountMinor,
    currentAmountMinor: goal.currentAmountMinor,
    remainingMinor,
    progressPct,
    targetDate: goal.targetDate,
    monthsRemaining,
    requiredMonthlyMinor,
    monthlyContributionMinor: contribution,
    projectedCompletionDate,
    onTrack,
    gapMonthlyMinor,
    isComplete,
    assumptions
  }
}
