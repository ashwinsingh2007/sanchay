import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Target,
  Wallet
} from 'lucide-react'
import { formatDate, monthName } from '@shared/dates'
import { safeToSpendLines } from '@shared/domain/insights'
import type { ChangeDriver, MonthlyCloseReport } from '@shared/types'
import { useMoney } from '../lib/hooks'
import { useUi } from '../lib/store'
import { cn } from '../lib/utils'
import { CategoryDot, EvidencePanel, EvidenceTransactions } from './finance'
import { Badge, Button, Card, CardHeader, Progress } from './ui'

export function SafeToSpendCard({
  report,
  className
}: {
  report: MonthlyCloseReport
  className?: string
}): React.JSX.Element {
  const money = useMoney()
  const go = useUi((s) => s.go)
  const sts = report.safeToSpend

  if (sts.status === 'needs_setup') {
    const needsBalance = sts.missing.includes('balance')
    return (
      <Card className={cn('flex flex-col p-5', className)}>
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
          <Wallet className="size-3.5" aria-hidden /> Safe to spend
        </p>
        <p className="mt-2 text-sm font-medium">
          {needsBalance ? 'Add your current balance' : 'Set your next income date'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          {needsBalance
            ? 'We calculate this from your real bank balance — we won’t guess.'
            : 'We need to know when money next comes in.'}
        </p>
        <Button
          size="sm"
          className="mt-auto self-start"
          onClick={() => go(needsBalance ? 'accounts' : 'settings')}
        >
          {needsBalance ? 'Add balance' : 'Open settings'}
        </Button>
      </Card>
    )
  }

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
          <Wallet className="size-3.5" aria-hidden /> Safe to spend
        </p>
        <Badge tone="outline">Estimate</Badge>
      </div>
      <p
        className={cn(
          'num mt-1.5 font-[family-name:var(--font-display)] text-[26px] font-semibold tracking-tight',
          sts.valueMinor === 0 ? 'text-negative' : 'text-positive'
        )}
      >
        {money(sts.valueMinor)}
      </p>
      <p className="mt-1 text-xs text-ink-3">
        until {formatDate(sts.nextIncomeDate, 'short')} · about {money(sts.dailyAllowanceMinor)}/day
        for {sts.daysUntilIncome} days
      </p>
      {sts.shortfallMinor > 0 && (
        <p className="mt-1 text-xs font-medium text-negative">
          {money(sts.shortfallMinor)} short of your buffer
        </p>
      )}
      <EvidencePanel
        label="How this is calculated"
        evidence={{
          calculation: safeToSpendLines(sts),
          transactions: [],
          notes: [
            ...sts.accounts.map(
              (a) =>
                `${a.name}: balance as of ${a.balanceAsOf ? formatDate(a.balanceAsOf) : 'unknown'}`
            ),
            'Credit-card balances are not counted as available cash.',
            'Commitments are recurring payments expected before your next income (ignored ones excluded).'
          ]
        }}
      />
    </Card>
  )
}

function DriverRow({ driver }: { driver: ChangeDriver }): React.JSX.Element {
  const money = useMoney()
  const up = driver.diffMinor > 0
  return (
    <li>
      <details className="group">
        <summary className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-sunken/70">
          <ChevronRight
            className="chevron size-3.5 shrink-0 text-ink-3 transition-transform"
            aria-hidden
          />
          <CategoryDot categoryId={driver.categoryId} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{driver.label}</span>
              {driver.kind !== 'category' && <Badge tone="neutral">One-off</Badge>}
            </span>
            <span className="num block text-xs text-ink-3">
              {money(driver.previousMinor)} → {money(driver.currentMinor)}
              {driver.note && ` · ${driver.note}`}
            </span>
          </span>
          <span
            className={cn(
              'num flex items-center gap-0.5 text-sm font-semibold',
              up ? 'text-ink' : 'text-positive'
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden />
            )}
            {money(driver.diffMinor, { signed: true })}
          </span>
        </summary>
        {driver.transactions.length > 0 && (
          <div className="ml-9 mr-2 pb-2">
            <EvidenceTransactions transactions={driver.transactions} limit={8} />
          </div>
        )}
      </details>
    </li>
  )
}

export function WhatChangedCard({
  report,
  maxDrivers = 6,
  className
}: {
  report: MonthlyCloseReport
  maxDrivers?: number
  className?: string
}): React.JSX.Element {
  const cmp = report.comparison
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="What changed and why"
        description={`${monthName(report.month)} compared with ${monthName(cmp.previousMonth)}`}
      />
      <div className="px-5 pb-4 pt-3">
        <p className="text-[17px] font-semibold tracking-tight">{cmp.headline}</p>
        {cmp.drivers.length > 0 ? (
          <ul className="-mx-2 mt-2">
            {cmp.drivers.slice(0, maxDrivers).map((d, i) => (
              <DriverRow key={`${d.kind}-${d.label}-${i}`} driver={d} />
            ))}
          </ul>
        ) : (
          cmp.hasPrevious && (
            <p className="mt-2 text-[13px] text-ink-2">No category changed meaningfully.</p>
          )
        )}
        {cmp.hasPrevious && (
          <p className="mt-2 text-[11.5px] text-ink-3">
            Showing changes larger than 2% of monthly spending. One-off payments are separated so
            they don’t look like a trend.
          </p>
        )}
      </div>
    </Card>
  )
}

export function UpcomingCard({
  report,
  className
}: {
  report: MonthlyCloseReport
  className?: string
}): React.JSX.Element {
  const money = useMoney()
  const go = useUi((s) => s.go)
  const items = report.upcoming.items
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Upcoming commitments"
        description={`Until ${formatDate(report.upcoming.untilDate)}`}
        action={
          <span className="num text-[15px] font-semibold">{money(report.upcoming.totalMinor)}</span>
        }
      />
      <div className="px-5 pb-4 pt-2">
        {items.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-3">
            No recurring payments expected in this window.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.slice(0, 6).map((c) => (
              <li
                key={`${c.commitmentId}-${c.date}`}
                className="flex items-center gap-3 py-2 text-[13px]"
              >
                <CalendarClock className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                <span className="num w-14 shrink-0 text-ink-3">{formatDate(c.date, 'short')}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.merchantName}</span>
                {c.status === 'review' && <Badge tone="outline">Unconfirmed</Badge>}
                <span className="num">{money(c.amountMinor)}</span>
              </li>
            ))}
            {items.length > 6 && (
              <li className="py-2 text-xs text-ink-3">+ {items.length - 6} more</li>
            )}
          </ul>
        )}
        <Button variant="link" size="sm" className="mt-2 text-xs" onClick={() => go('flow')}>
          See all transactions
        </Button>
      </div>
    </Card>
  )
}

export function GoalProgressCard({
  report,
  className
}: {
  report: MonthlyCloseReport
  className?: string
}): React.JSX.Element {
  const money = useMoney()
  const go = useUi((s) => s.go)
  const goal = report.goals[0]
  return (
    <Card className={cn('flex flex-col p-5', className)}>
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
        <Target className="size-3.5" aria-hidden /> Savings goal
      </p>
      {goal ? (
        <>
          <p className="mt-1.5 truncate text-sm font-semibold">{goal.name}</p>
          <p className="num mt-0.5 text-xs text-ink-3">
            {money(goal.currentAmountMinor)} of {money(goal.targetAmountMinor)}
          </p>
          <div className="mt-3">
            <Progress
              value={goal.progressPct}
              tone={goal.onTrack === false ? 'attention' : 'positive'}
              label={`${goal.name} progress`}
            />
          </div>
          <p className="mt-2 text-xs text-ink-2">
            {goal.isComplete
              ? 'Goal reached.'
              : goal.onTrack === false
                ? `Needs ${money(goal.gapMonthlyMinor)}/month more (estimate)`
                : goal.onTrack
                  ? `On track for ${formatDate(goal.projectedCompletionDate!)} (estimate)`
                  : `Save ${money(goal.requiredMonthlyMinor)}/month to finish on time (estimate)`}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            Set a goal to see how much to put aside each month.
          </p>
          <Button size="sm" className="mt-3 self-start" onClick={() => go('home')}>
            Create a goal
          </Button>
        </>
      )}
    </Card>
  )
}
