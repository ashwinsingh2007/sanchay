import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { addMonthsClamped, formatDate, todayISO } from '@shared/dates'
import { projectGoal } from '@shared/domain/goals'
import { minorToInputValue, parseMoneyInput } from '@shared/money'
import type { SavingsGoal } from '@shared/types'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Disclaimer,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Progress,
  Spinner
} from '../components/ui'
import { useCurrency, useMoney, useMutation, useQuery } from '../lib/hooks'
import { api } from '../lib/utils'

function GoalDialog({
  goal,
  onClose
}: {
  goal: SavingsGoal | null
  onClose: () => void
}): React.JSX.Element {
  const currency = useCurrency()
  const mutate = useMutation()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(minorToInputValue(goal?.targetAmountMinor, currency))
  const [current, setCurrent] = useState(minorToInputValue(goal?.currentAmountMinor ?? 0, currency))
  const [date, setDate] = useState(goal?.targetDate ?? addMonthsClamped(todayISO(), 12))
  const [contribution, setContribution] = useState(
    minorToInputValue(goal?.monthlyContributionMinor, currency)
  )
  const [err, setErr] = useState<string | null>(null)

  async function save(): Promise<void> {
    const targetMinor = parseMoneyInput(target, currency)
    if (!name.trim()) return setErr('Give your goal a name.')
    if (!targetMinor) return setErr('Enter a target amount above zero.')
    if (!date) return setErr('Choose a target date.')
    const input = {
      name: name.trim(),
      targetAmountMinor: targetMinor,
      currentAmountMinor: parseMoneyInput(current, currency) ?? 0,
      targetDate: date,
      monthlyContributionMinor: parseMoneyInput(contribution, currency)
    }
    const ok = await mutate(
      () => (goal ? api.updateGoal({ id: goal.id, ...input }) : api.createGoal(input)),
      goal ? 'Goal updated' : 'Goal created'
    )
    if (ok) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={goal ? 'Edit goal' : 'New savings goal'}
      description="Projections are estimates based only on the numbers you enter."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {goal ? 'Save' : 'Create goal'}
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Goal name" htmlFor="g-n" className="col-span-2">
          <Input
            id="g-n"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency fund, Japan trip"
            autoFocus
          />
        </Field>
        <Field label="Target amount" htmlFor="g-t">
          <Input
            id="g-t"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field label="Already saved" htmlFor="g-c">
          <Input
            id="g-c"
            inputMode="decimal"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Target date" htmlFor="g-d">
          <Input id="g-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field
          label="Monthly contribution"
          hint="Optional — used to project a completion date."
          htmlFor="g-m"
        >
          <Input
            id="g-m"
            inputMode="decimal"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
          />
        </Field>
        {err && <p className="col-span-2 text-[13px] text-negative">{err}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}

export function GoalsPage(): React.JSX.Element {
  const money = useMoney()
  const mutate = useMutation()
  const { data, error, loading, reload } = useQuery(() => api.listGoals())
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null)
  const today = todayISO()

  return (
    <div>
      <PageHeader
        eyebrow="Goals"
        title="Savings goals"
        description="Track progress and see what it takes to finish on time."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setEditing('new')}
          >
            New goal
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="size-5" />}
            title="No goals yet"
            description="An emergency fund, a trip, a down payment — set a target and Sanchay will show the monthly amount needed to get there."
            action={
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                onClick={() => setEditing('new')}
              >
                Create your first goal
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {data.map((g) => {
            const p = projectGoal(g, today)
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold tracking-tight">{g.name}</h3>
                    <p className="text-xs text-ink-3">Target date {formatDate(g.targetDate)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.isComplete ? (
                      <Badge tone="positive">Reached</Badge>
                    ) : p.onTrack === true ? (
                      <Badge tone="positive">On track</Badge>
                    ) : p.onTrack === false ? (
                      <Badge tone="attention">Behind</Badge>
                    ) : (
                      <Badge tone="outline">No plan yet</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${g.name}`}
                      icon={<Pencil className="size-3.5" />}
                      onClick={() => setEditing(g)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${g.name}`}
                      icon={<Trash2 className="size-3.5" />}
                      onClick={() => {
                        if (window.confirm(`Delete the goal “${g.name}”?`))
                          void mutate(() => api.deleteGoal(g.id), 'Goal deleted')
                      }}
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <p className="num text-[22px] font-semibold tracking-tight">
                    {money(g.currentAmountMinor)}
                  </p>
                  <p className="num text-[13px] text-ink-2">of {money(g.targetAmountMinor)}</p>
                </div>
                <div className="mt-2">
                  <Progress
                    value={p.progressPct}
                    tone={p.onTrack === false ? 'attention' : 'positive'}
                    label={`${g.name} progress`}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-ink-3">{p.progressPct}%</p>

                <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-sunken/70 p-3 text-xs">
                  <div>
                    <dt className="text-ink-3">Required / month</dt>
                    <dd className="num mt-0.5 text-sm font-semibold">
                      {money(p.requiredMonthlyMinor)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Your plan / month</dt>
                    <dd className="num mt-0.5 text-sm font-semibold">
                      {p.monthlyContributionMinor ? money(p.monthlyContributionMinor) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Projected finish</dt>
                    <dd className="num mt-0.5 text-sm font-semibold">
                      {p.projectedCompletionDate ? formatDate(p.projectedCompletionDate) : '—'}
                    </dd>
                  </div>
                </dl>
                {p.gapMonthlyMinor > 0 && p.monthlyContributionMinor && (
                  <p className="mt-3 text-[13px] text-attention">
                    Add about {money(p.gapMonthlyMinor)}/month to finish by the target date
                    (estimate).
                  </p>
                )}
                <details className="mt-3 text-xs text-ink-3">
                  <summary className="cursor-pointer hover:text-ink-2">Assumptions</summary>
                  <ul className="mt-1.5 space-y-1">
                    {p.assumptions.map((a) => (
                      <li key={a}>• {a}</li>
                    ))}
                    <li>
                      • Remaining {money(p.remainingMinor)} ÷ {Math.max(1, p.monthsRemaining)}{' '}
                      months = {money(p.requiredMonthlyMinor)}/month
                    </li>
                  </ul>
                </details>
              </Card>
            )
          })}
        </div>
      )}
      <Disclaimer className="mt-8 border-t border-line pt-4" />
      {editing && (
        <GoalDialog goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
