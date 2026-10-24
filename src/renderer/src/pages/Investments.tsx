import { useMemo, useState } from 'react'
import { addMonths, formatDate, monthEnd, monthStart } from '@shared/dates'
import { INVESTMENT_TYPES, investmentType } from '@shared/domain/investments'
import type { InvestmentType } from '@shared/types'
import { Amount } from '../components/finance'
import { IndmoneyPanel } from '../components/Indmoney'
import { Card, CardHeader, EmptyState, PageHeader, Segmented, Spinner } from '../components/ui'
import { useMoney, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'
import { InvestmentsCard } from './Home'
import { PiggyBank } from 'lucide-react'

type Source = 'indmoney' | 'statements'

/** Live INDmoney portfolio when connected, plus investments spotted in bank statements. */
export function InvestmentsPage(): React.JSX.Element {
  const status = useQuery(() => api.getIndmoneyStatus())
  const portfolio = useQuery(() => api.listIndmoneySnapshots())
  const [picked, setPicked] = useState<Source | null>(null)
  if (!status.data || !portfolio.data) return <Spinner />
  // Prefer the real portfolio (INDmoney or CAS) whenever there is one.
  const hasPortfolio =
    status.data.connected || portfolio.data.some((r) => r.tool === 'networth_snapshot')
  const source = picked ?? (hasPortfolio ? 'indmoney' : 'statements')
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Investments"
        title="Investments"
        description={
          source === 'indmoney'
            ? 'Everything you hold — from INDmoney, or from your CAS statements.'
            : 'Money you put away — FDs, SIPs, stocks, PF/NPS and gold. Not counted as spending.'
        }
        actions={
          <Segmented
            label="Investment source"
            value={source}
            onChange={setPicked}
            options={[
              { value: 'indmoney', label: 'Portfolio' },
              { value: 'statements', label: 'From statements' }
            ]}
          />
        }
      />
      {source === 'indmoney' ? (
        <IndmoneyPanel status={status.data} onChange={status.reload} />
      ) : (
        <StatementInvestments />
      )}
    </div>
  )
}

/** Money put into FDs, SIPs, stocks, PF/NPS and gold — by type, over the last 12 months. */
function StatementInvestments(): React.JSX.Element {
  const money = useMoney()
  const month = useUi((s) => s.month)
  const setMonth = useUi((s) => s.setMonth)
  const categories = useUi((s) => s.categories)
  const savingIds = useMemo(
    () => new Set(categories.filter((c) => c.kind === 'savings').map((c) => c.id)),
    [categories]
  )
  const txs = useQuery(
    () =>
      month
        ? api.listTransactions({
            from: monthStart(addMonths(month, -11)),
            to: monthEnd(month),
            limit: 20000
          })
        : Promise.resolve([]),
    [month]
  )

  const byType = useMemo(() => {
    const m = new Map<InvestmentType, typeof list>()
    const list = (txs.data ?? []).filter(
      (t) => t.amountMinor < 0 && savingIds.has(t.categoryId ?? '')
    )
    for (const t of list) {
      const k = investmentType(t.descriptionOriginal, t.merchantNormalised)
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return m
  }, [txs.data, savingIds])

  if (!month) return <Spinner />
  return (
    <div className="space-y-5">
      <InvestmentsCard month={month} onSelect={setMonth} />
      {!txs.data ? (
        <Spinner />
      ) : byType.size === 0 ? (
        <Card>
          <EmptyState
            icon={<PiggyBank className="size-5" />}
            title="No investments found in the last 12 months"
            description="FDs, RDs, SIPs, broker payments, NPS, PPF and gold show up here automatically."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {INVESTMENT_TYPES.filter((t) => byType.has(t.id)).map((t) => {
            const list = [...byType.get(t.id)!].sort((a, b) =>
              b.transactionDate.localeCompare(a.transactionDate)
            )
            const total = list.reduce((s, x) => s - x.amountMinor, 0)
            return (
              <Card key={t.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </span>
                  }
                  description={`${list.length} payment${list.length === 1 ? '' : 's'} in 12 months`}
                  action={
                    <span className="num text-[16px] font-semibold text-positive">
                      {money(total)}
                    </span>
                  }
                />
                <ul className="mt-2 divide-y divide-line px-5 pb-3">
                  {list.slice(0, 8).map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                      <span className="num w-[56px] shrink-0 text-ink-3">
                        {formatDate(x.transactionDate, 'short')}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-ink-2"
                        title={x.descriptionOriginal}
                      >
                        {x.merchantNormalised}
                      </span>
                      <Amount
                        minor={-x.amountMinor}
                        colorInflow={false}
                        className="text-[12.5px]"
                      />
                    </li>
                  ))}
                  {list.length > 8 && (
                    <li className="py-2 text-[12px] text-ink-3">+ {list.length - 8} more</li>
                  )}
                </ul>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
