import { useState } from 'react'
import { monthlyEquivalentMinor } from '@shared/domain/recurring'
import type { RecurringCommitment } from '@shared/types'
import { Card, ErrorState, PageHeader, Segmented, Spinner } from '../components/ui'
import { useMoney, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'
import { CommitmentsPage } from './Commitments'
import { SubscriptionsTab } from './Flow'

const KINDS: { id: string; label: string; match: (c: RecurringCommitment) => boolean }[] = [
  {
    id: 'subs',
    label: 'Subscriptions',
    match: (c) => ['subscriptions', 'software', 'entertainment'].includes(c.categoryId ?? '')
  },
  {
    id: 'bills',
    label: 'Bills & utilities',
    match: (c) =>
      ['utilities', 'housing', 'insurance', 'education', 'health'].includes(c.categoryId ?? '')
  },
  { id: 'emi', label: 'EMIs & loans', match: (c) => c.categoryId === 'emi' },
  { id: 'invest', label: 'SIPs & investments', match: (c) => c.categoryId === 'investments' }
]

/** Everything that repeats: subscriptions, bills, EMIs and SIPs. */
export function RecurringPage(): React.JSX.Element {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recurring"
        title="Recurring"
        description="Subscriptions, bills, EMIs and SIPs that repeat — with what each costs you a month."
      />
      <RecurringView />
    </div>
  )
}

/** The recurring breakdown, also shown as a tab under Transactions → Expenses. */
export function RecurringView(): React.JSX.Element {
  const money = useMoney()
  const month = useUi((s) => s.month)
  const flow = useQuery(() => api.getMoneyFlow(month), [month])
  const commitments = useQuery(() => api.listCommitments())
  const [view, setView] = useState<'subscriptions' | 'all'>('subscriptions')

  if (flow.error) return <ErrorState message={flow.error} onRetry={flow.reload} />
  if (!flow.data || !commitments.data) return <Spinner />
  const live = commitments.data.filter((c) => c.status !== 'ignored')
  const total = (list: RecurringCommitment[]): number =>
    list.reduce((s, c) => s + monthlyEquivalentMinor(c.typicalAmountMinor, c.cadence), 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-[12px] text-ink-3">Subscriptions</p>
          <p className="num mt-1 text-[20px] font-semibold">
            {money(flow.data.outgoing.subscriptions.reduce((n, x) => n + x.monthlyMinor, 0))}
            <span className="text-[12px] font-normal text-ink-3">/mo</span>
          </p>
          <p className="text-[11.5px] text-ink-3">
            {flow.data.outgoing.subscriptions.length} item
            {flow.data.outgoing.subscriptions.length === 1 ? '' : 's'}
          </p>
        </Card>
        {KINDS.map((k) => {
          const items = live.filter(k.match)
          return (
            <Card key={k.id} className="p-4">
              <p className="text-[12px] text-ink-3">{k.label}</p>
              <p
                className={`num mt-1 text-[20px] font-semibold ${k.id === 'invest' ? 'text-positive' : ''}`}
              >
                {money(total(items))}
                <span className="text-[12px] font-normal text-ink-3">/mo</span>
              </p>
              <p className="text-[11.5px] text-ink-3">
                {items.length} item{items.length === 1 ? '' : 's'}
              </p>
            </Card>
          )
        })}
      </div>
      <Segmented
        label="Recurring view"
        value={view}
        onChange={setView}
        options={[
          { value: 'subscriptions', label: 'Subscriptions' },
          { value: 'all', label: 'All recurring' }
        ]}
      />
      {view === 'subscriptions' ? (
        <SubscriptionsTab flow={flow.data} />
      ) : (
        <CommitmentsPage embedded />
      )}
    </div>
  )
}
