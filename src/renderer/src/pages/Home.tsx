import { BarChart3, ChartArea, ChartLine } from 'lucide-react'
import { InvestmentChart, useChartType, type ChartType } from '../components/homeCharts'
import { Card, Segmented } from '../components/ui'
import { useMoney, useQuery } from '../lib/hooks'
import { api, cn } from '../lib/utils'

export function ChartTypePicker({
  value,
  onChange,
  className
}: {
  value: ChartType
  onChange: (t: ChartType) => void
  className?: string
}): React.JSX.Element {
  return (
    <Segmented
      className={className}
      label="Chart style"
      value={value}
      onChange={onChange}
      options={[
        { value: 'bar', label: <BarChart3 className="size-3.5" aria-label="Bars" /> },
        { value: 'line', label: <ChartLine className="size-3.5" aria-label="Line" /> },
        { value: 'area', label: <ChartArea className="size-3.5" aria-label="Area" /> }
      ]}
    />
  )
}

export function InvestmentsCard({
  month,
  onSelect
}: {
  month: string
  onSelect: (m: string) => void
}): React.JSX.Element | null {
  const money = useMoney()
  const inv = useQuery(() => api.getInvestments(month), [month])
  const [type, setType] = useChartType('investments')
  const r = inv.data
  if (!r) return null
  const stats: [string, string, string?][] = [
    ['This month', money(r.thisMonthMinor)],
    ['Monthly average', money(r.averageMonthlyMinor)],
    ['Expected next month', money(r.expectedMonthlyMinor), 'text-positive'],
    ['Next 12 months', money(r.next12MonthsMinor), 'text-positive']
  ]
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">Investments by month</h3>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {r.totalInvestedMinor > 0
              ? `By type. Recurring ones (${r.recurring.map((x) => x.name).join(', ') || 'none yet'}) are projected ahead.`
              : 'No investments found yet — FDs, SIPs, stocks, NPS and gold show up here.'}
          </p>
          <ChartTypePicker value={type} onChange={setType} className="mt-3" />
        </div>
        <div className="flex gap-6 text-right">
          {stats.map(([label, value, tone]) => (
            <div key={label}>
              <p className="text-[11.5px] text-ink-3">{label}</p>
              <p className={cn('num text-[17px] font-semibold', tone)}>{value}</p>
            </div>
          ))}
        </div>
      </div>
      {r.totalInvestedMinor > 0 && (
        <div className="px-3 pb-4 pt-3">
          <InvestmentChart report={r} selected={month} onSelect={onSelect} type={type} />
        </div>
      )}
    </Card>
  )
}
