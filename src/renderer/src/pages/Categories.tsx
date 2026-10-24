import { monthLabel } from '@shared/dates'
import { CategoryDonut, ExpenseMonthChart, useChartType } from '../components/homeCharts'
import { ChartTypePicker } from './Home'
import { Card, CardHeader, ErrorState, PageHeader, Spinner } from '../components/ui'
import { useMoney, useQuery } from '../lib/hooks'
import { NoDataState, useMonthlyReport } from '../lib/report'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'
import { CategoriesTab } from './Flow'

/** Where the money went this month, category by category, with merchants and saving tips. */
export function CategoriesPage(): React.JSX.Element {
  const money = useMoney()
  const month = useUi((s) => s.month)
  const report = useMonthlyReport()
  const flow = useQuery(() => api.getMoneyFlow(month), [month])
  const setMonth = useUi((s) => s.setMonth)
  const [chartType, setChartType] = useChartType('expenses-by-month')

  if (!month) return <Spinner />
  if (flow.error) return <ErrorState message={flow.error} onRetry={flow.reload} />
  if (!flow.data || !report.data) return <Spinner />
  if (!report.data.hasData) return <NoDataState month={month} />
  const c = report.data.current

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={monthLabel(month)}
        title="Categories"
        description="Tap a category to see its merchants, how it compares to usual, and ways to pay less."
      />
      <div className="grid grid-cols-5 gap-4">
        <Card className="col-span-2">
          <CardHeader title="Spending mix" description={`${money(c.spendingMinor)} spent`} />
          <div className="px-5 pb-5 pt-4">
            <CategoryDonut
              data={c.byCategory}
              totalMinor={c.spendingMinor}
              onSelect={() => undefined}
            />
          </div>
        </Card>
        <Card className="col-span-3">
          <CardHeader title="Biggest changes vs last month" />
          <ul className="space-y-2 px-5 pb-5 pt-4 text-[13px]">
            {report.data.comparison.drivers.slice(0, 6).map((d) => (
              <li key={d.label} className="flex items-center justify-between gap-3">
                <span className="truncate text-ink-2">{d.label}</span>
                <span
                  className={`num font-medium ${d.diffMinor > 0 ? 'text-expense' : 'text-positive'}`}
                >
                  {d.diffMinor > 0 ? '+' : '−'}
                  {money(Math.abs(d.diffMinor))}
                </span>
              </li>
            ))}
            {report.data.comparison.drivers.length === 0 && (
              <li className="text-ink-3">No previous month to compare yet.</li>
            )}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Spending by month"
          description="Last 12 months. Tap a month to open it."
          action={<ChartTypePicker value={chartType} onChange={setChartType} />}
        />
        <div className="px-3 pb-4 pt-3">
          <ExpenseMonthChart
            data={report.data.trend}
            selected={report.data.month}
            onSelect={setMonth}
            type={chartType}
          />
        </div>
      </Card>
      <CategoriesTab flow={flow.data} />
    </div>
  )
}
