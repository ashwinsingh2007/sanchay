import { CheckCircle2, ChevronDown, Circle, ListChecks, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { monthLabel } from '@shared/dates'
import type { Insight } from '@shared/types'
import { ConfidenceBadge, EvidencePanel, SeverityBadge } from '../components/finance'
import { Badge, Button, Card, Disclaimer, EmptyState, ErrorState, Spinner } from '../components/ui'
import { useMoney, useMutation } from '../lib/hooks'
import { NoDataState, useMonthlyReport } from '../lib/report'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'
import { PAL } from '../lib/theme'

function ProgressRing({ done, total }: { done: number; total: number }): React.JSX.Element {
  const pct = total ? done / total : 0
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-[76px]" role="img" aria-label={`${done} of ${total} steps done`}>
      <svg viewBox="0 0 76 76" className="size-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke={PAL.refLine} strokeWidth="7" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-[17px] font-semibold">
        {done}/{total}
      </span>
    </div>
  )
}

function StepRow({ step, index }: { step: Insight; index: number }): React.JSX.Element {
  const money = useMoney()
  const mutate = useMutation()
  const askAi = useUi((s) => s.askAi)
  const [open, setOpen] = useState(false)
  return (
    <Card className={cn('transition-opacity', step.completed && 'opacity-70')}>
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={() =>
            void mutate(
              () => api.setInsightDone({ id: step.id, done: !step.completed }),
              step.completed ? undefined : 'Nice — step done'
            )
          }
          className="mt-0.5 rounded-full text-ink-3 hover:text-positive"
          aria-label={
            step.completed ? `Mark "${step.title}" as not done` : `Mark "${step.title}" as done`
          }
          aria-pressed={!!step.completed}
        >
          {step.completed ? (
            <CheckCircle2 className="size-6 text-positive" />
          ) : (
            <Circle className="size-6" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="num text-xs font-semibold text-ink-3">Step {index}</span>
            {!step.completed && <SeverityBadge severity={step.severity} />}
            {step.isEstimate && <Badge tone="outline">Estimate</Badge>}
          </div>
          <h3
            className={cn(
              'mt-1 text-[15px] font-semibold tracking-tight',
              step.completed && 'line-through decoration-ink-3/60'
            )}
          >
            {step.title}
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-2">{step.action}</p>
          {open && (
            <div className="animate-fade-up mt-3 space-y-2">
              <p className="text-[13px] text-ink-2">{step.summary}</p>
              <p className="text-xs text-ink-3">
                <span className="font-medium text-ink-2">Why: </span>
                {step.why}
              </p>
              <div className="flex items-center gap-2">
                <ConfidenceBadge confidence={step.confidence} />
              </div>
              <EvidencePanel evidence={step.evidence} />
            </div>
          )}
          <div className="mt-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => setOpen((o) => !o)}
              icon={
                <ChevronDown
                  className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                />
              }
            >
              {open ? 'Hide details' : 'Details & evidence'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Sparkles className="size-3.5" />}
              onClick={() => askAi(`Walk me through this step: "${step.title}". ${step.action}`)}
            >
              Ask AI CFO
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="size-3.5" />}
              onClick={() =>
                void mutate(() => api.dismissInsight(step.id), 'Step dismissed for this month')
              }
            >
              Not relevant
            </Button>
          </div>
        </div>
        {step.estimatedImpactMinor != null && (
          <div className="shrink-0 text-right">
            <p className="num text-[17px] font-semibold">{money(step.estimatedImpactMinor)}</p>
            {step.impactLabel && (
              <p className="max-w-[120px] text-[11px] text-ink-3">{step.impactLabel}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export function StepsPage(): React.JSX.Element {
  const { data: report, error, loading, reload, month } = useMonthlyReport()
  if (!month) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!report) return <Spinner label={loading ? 'Building your plan' : 'Loading'} />
  if (!report.hasData) {
    return (
      <>
        <h1 className="mb-5 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
          Recommended steps
        </h1>
        <NoDataState month={report.month} />
      </>
    )
  }

  const todo = report.insights.filter((i) => !i.completed)
  const done = report.insights.filter((i) => i.completed)

  return (
    <div className="space-y-5">
      <div className="gloss flex items-center gap-6 rounded-2xl p-6 text-white">
        <ProgressRing done={done.length} total={report.insights.length} />
        <div>
          <p className="text-[12px] font-semibold eyebrow text-white/75">
            Recommended steps · {monthLabel(report.month)}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-[26px] font-semibold tracking-tight">
            {todo.length === 0
              ? 'All done for this month 🎉'
              : `${todo.length} step${todo.length === 1 ? '' : 's'} to a stronger month`}
          </h1>
          <p className="mt-1 text-[13.5px] text-white/85">
            Ordered by urgency and impact. Tick them off as you go — progress is saved on this Mac.
          </p>
        </div>
      </div>

      {report.insights.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks className="size-5" />}
            title="Nothing to do"
            description="No rules fired for this month."
          />
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {todo.map((s) => (
              <StepRow key={s.id} step={s} index={report.insights.indexOf(s) + 1} />
            ))}
          </div>
          {done.length > 0 && (
            <>
              <h2 className="pt-2 text-[13px] eyebrow text-ink-3">Done</h2>
              <div className="space-y-3">
                {done.map((s) => (
                  <StepRow key={s.id} step={s} index={report.insights.indexOf(s) + 1} />
                ))}
              </div>
            </>
          )}
        </>
      )}
      <Disclaimer />
    </div>
  )
}
