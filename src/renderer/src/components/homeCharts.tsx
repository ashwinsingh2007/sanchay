import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { formatDate, monthLabel } from '@shared/dates'
import { formatPercent, percentOf } from '@shared/money'
import type { CategoryTotal, DayPoint, InvestmentReport, TrendPoint } from '@shared/types'
import { useMoney } from '../lib/hooks'
import { useUi } from '../lib/store'
import { PAL } from '../lib/theme'
import { cn } from '../lib/utils'

function Tip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="material px-3 py-2 text-xs shadow-[3px_3px_0_0_var(--color-line-strong)]">
      {children}
    </div>
  )
}

/** Cumulative spend this month vs the same day last month. */
export function SpendPaceChart({
  data,
  mode
}: {
  data: DayPoint[]
  mode: 'cumulative' | 'daily'
}): React.JSX.Element {
  const money = useMoney()
  const hasPrev = data.some((d) => d.prevCumulativeMinor != null)
  return (
    <div
      className="h-[240px]"
      role="img"
      aria-label={
        mode === 'cumulative' ? 'Cumulative spending this month vs last month' : 'Daily spending'
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PAL.accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={PAL.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={PAL.grid} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            interval={4}
            tick={{ fontSize: 11.5, fill: PAL.tick }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={60}
            tick={{ fontSize: 11.5, fill: PAL.tick }}
            tickFormatter={(v: number) => money(v, { compact: true })}
          />
          <Tooltip
            cursor={{ stroke: PAL.accent, strokeOpacity: 0.25, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as DayPoint | undefined
              if (!active || !p) return null
              return (
                <Tip>
                  <p className="mb-1 font-medium text-ink">{formatDate(p.date)}</p>
                  {mode === 'cumulative' ? (
                    <>
                      <p className="num flex items-center gap-1.5 text-ink-2">
                        <span className="h-0.5 w-3 rounded" style={{ background: PAL.accent }} />
                        This month {money(p.cumulativeMinor)}
                      </p>
                      {p.prevCumulativeMinor != null && (
                        <p className="num flex items-center gap-1.5 text-ink-2">
                          <span className="h-0.5 w-3 rounded" style={{ background: PAL.prev }} />
                          Last month {money(p.prevCumulativeMinor)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="num text-ink-2">
                      Spent {money(p.spendMinor)} · {p.count} transaction{p.count === 1 ? '' : 's'}
                    </p>
                  )}
                </Tip>
              )
            }}
          />
          {mode === 'cumulative' ? (
            <>
              {hasPrev && (
                <Line
                  type="monotone"
                  dataKey="prevCumulativeMinor"
                  stroke={PAL.prev}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Area
                type="monotone"
                dataKey="cumulativeMinor"
                stroke={PAL.accent}
                strokeWidth={2.25}
                fill="url(#paceFill)"
                activeDot={{ r: 4.5, stroke: PAL.dotStroke, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </>
          ) : (
            <Area
              type="step"
              dataKey="spendMinor"
              stroke={PAL.accent}
              strokeWidth={2}
              fill="url(#paceFill)"
              activeDot={{ r: 4.5, stroke: PAL.dotStroke, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Category donut with an interactive legend. Clicking a category opens its transactions. */
export function CategoryDonut({
  data,
  totalMinor,
  onSelect
}: {
  data: CategoryTotal[]
  totalMinor: number
  onSelect: (categoryId: string) => void
}): React.JSX.Element {
  const money = useMoney()
  const categories = useUi((s) => s.categories)
  const [hover, setHover] = useState<string | null>(null)
  const positive = data.filter((d) => d.spendMinor > 0)
  const top = positive.slice(0, 6)
  const restTotal = positive.slice(6).reduce((s, d) => s + d.spendMinor, 0)
  const rows = [
    ...top.map((d) => {
      const c = categories.find((x) => x.id === d.categoryId)
      return {
        id: d.categoryId,
        name: c?.name ?? 'Other',
        color: c?.color ?? '#94a3b8',
        value: d.spendMinor
      }
    }),
    ...(restTotal > 0
      ? [{ id: '__rest', name: 'Everything else', color: '#404040', value: restTotal }]
      : [])
  ]
  const active = rows.find((r) => r.id === hover)

  return (
    <div className="flex items-center gap-5">
      <div className="relative size-[176px] shrink-0" role="img" aria-label="Spending by category">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              innerRadius={60}
              outerRadius={86}
              paddingAngle={1.5}
              cornerRadius={4}
              stroke={PAL.dotStroke}
              strokeWidth={2}
              isAnimationActive={false}
              onMouseEnter={(_, i) => setHover(rows[i]?.id ?? null)}
              onMouseLeave={() => setHover(null)}
              onClick={(_, i) => {
                const id = rows[i]?.id
                if (id && id !== '__rest') onSelect(id)
              }}
            >
              {rows.map((r) => (
                <Cell
                  key={r.id}
                  fill={r.color}
                  opacity={hover && hover !== r.id ? 0.35 : 1}
                  style={{
                    cursor: r.id === '__rest' ? 'default' : 'pointer',
                    transition: 'opacity .15s'
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-ink-3">{active ? active.name : 'Total spent'}</span>
          <span className="num text-[17px] font-semibold tracking-tight">
            {money(active ? active.value : totalMinor)}
          </span>
          {active && (
            <span className="text-[11px] text-ink-3">
              {formatPercent(percentOf(active.value, totalMinor))}
            </span>
          )}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              disabled={r.id === '__rest'}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.id)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect(r.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors',
                r.id !== '__rest' && 'hover:bg-ink/[0.04]',
                hover === r.id && 'bg-ink/[0.04]'
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: r.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-ink-2">{r.name}</span>
              <span className="num font-medium">{money(r.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Tiny trend line for KPI tiles. */
export function Sparkline({
  values,
  color = PAL.accent,
  dotColor
}: {
  values: number[]
  color?: string
  /** The current point; defaults to the line colour. */
  dotColor?: string
}): React.JSX.Element | null {
  if (values.length < 2) return null
  const w = 96
  const h = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map(
    (v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const
  )
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]!
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={2.75}
        fill={dotColor ?? color}
        stroke={PAL.dotStroke}
        strokeWidth={1.5}
      />
    </svg>
  )
}

export type ChartType = 'bar' | 'line' | 'area'

/** Remembers the chart style per chart on this Mac (a viewer convenience only). */
export function useChartType(key: string): [ChartType, (t: ChartType) => void] {
  const storageKey = `chart-type:${key}`
  const [type, setType] = useState<ChartType>(() => {
    try {
      const v = localStorage.getItem(storageKey)
      return v === 'line' || v === 'area' || v === 'bar' ? v : 'bar'
    } catch {
      return 'bar'
    }
  })
  return [
    type,
    (t) => {
      setType(t)
      try {
        localStorage.setItem(storageKey, t)
      } catch {
        // storage unavailable — keep the in-memory choice
      }
    }
  ]
}

function axes(money: (m: number, o?: { compact?: boolean }) => string): React.JSX.Element[] {
  return [
    <CartesianGrid key="g" vertical={false} stroke={PAL.grid} />,
    <XAxis
      key="x"
      dataKey="label"
      tickLine={false}
      axisLine={false}
      tick={{ fill: PAL.tick, fontSize: 11 }}
      padding={{ left: 12, right: 12 }}
    />,
    <YAxis
      key="y"
      tickLine={false}
      axisLine={false}
      width={56}
      tick={{ fill: PAL.tick, fontSize: 11 }}
      tickFormatter={(v: number) => money(v, { compact: true })}
    />
  ]
}

/** Month-by-month income vs expenses as bars, lines or areas. Click a month to select it. */
export function IncomeExpenseBars({
  data,
  selected,
  onSelect,
  type = 'bar'
}: {
  data: TrendPoint[]
  selected: string
  onSelect: (month: string) => void
  type?: ChartType
}): React.JSX.Element {
  const money = useMoney()
  const rows = data.map((d) => ({
    month: d.month,
    label: monthLabel(d.month, 'short'),
    income: d.incomeMinor,
    expense: d.spendingMinor
  }))
  const selLabel = rows.find((r) => r.month === selected)?.label
  const series = [
    { key: 'income', name: 'Income', color: PAL.cool },
    { key: 'expense', name: 'Expenses', color: PAL.warm }
  ] as const
  return (
    <div className="h-[260px]" role="img" aria-label="Income and expenses by month">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          barGap={3}
          barCategoryGap="28%"
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          onClick={(e) => {
            const m = rows[Number(e?.activeTooltipIndex ?? -1)]?.month
            if (m) onSelect(m)
          }}
          style={{ cursor: 'pointer' }}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`ie-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {axes(money)}
          {type !== 'bar' && selLabel && <ReferenceLine x={selLabel} stroke={PAL.refLine} />}
          <Tooltip
            cursor={
              type === 'bar' ? { fill: PAL.hoverFill } : { stroke: PAL.refLine, strokeWidth: 1 }
            }
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !r) return null
              const net = r.income - r.expense
              return (
                <Tip>
                  <p className="mb-1 font-medium">{monthLabel(r.month)}</p>
                  <p className="num text-positive">In {money(r.income)}</p>
                  <p className="num">Out {money(r.expense)}</p>
                  <p className={cn('num mt-1', net >= 0 ? 'text-positive' : 'text-negative')}>
                    {net >= 0 ? 'Saved' : 'Overspent'} {money(Math.abs(net))}
                  </p>
                </Tip>
              )
            }}
          />
          {series.map((s) =>
            type === 'bar' ? (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              >
                {rows.map((r) => (
                  <Cell
                    key={r.month}
                    fill={s.color}
                    opacity={r.month === selected ? 1 : s.key === 'income' ? 0.45 : 0.4}
                  />
                ))}
              </Bar>
            ) : type === 'area' ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#ie-${s.key})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: PAL.dotStroke }}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: s.color }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: PAL.dotStroke }}
                isAnimationActive={false}
              />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Total expenses per month, as bars, a line or an area. Click a month to select it. */
export function ExpenseMonthChart({
  data,
  selected,
  onSelect,
  type = 'bar'
}: {
  data: TrendPoint[]
  selected: string
  onSelect: (month: string) => void
  type?: ChartType
}): React.JSX.Element {
  const money = useMoney()
  const rows = data.map((d) => ({
    month: d.month,
    label: monthLabel(d.month, 'short'),
    expense: d.spendingMinor
  }))
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.expense, 0) / rows.length) : 0
  const selLabel = rows.find((r) => r.month === selected)?.label
  return (
    <div className="h-[240px]" role="img" aria-label="Total expenses by month">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          barCategoryGap="30%"
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          onClick={(e) => {
            const m = rows[Number(e?.activeTooltipIndex ?? -1)]?.month
            if (m) onSelect(m)
          }}
          style={{ cursor: 'pointer' }}
        >
          <defs>
            <linearGradient id="exp-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PAL.warm} stopOpacity={0.3} />
              <stop offset="100%" stopColor={PAL.warm} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {axes(money)}
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke={PAL.refLine}
              strokeDasharray="4 4"
              label={{
                value: `avg ${money(avg, { compact: true })}`,
                fill: PAL.tick,
                fontSize: 10,
                position: 'insideTopRight'
              }}
            />
          )}
          {type !== 'bar' && selLabel && <ReferenceLine x={selLabel} stroke={PAL.refLine} />}
          <Tooltip
            cursor={
              type === 'bar' ? { fill: PAL.hoverFill } : { stroke: PAL.refLine, strokeWidth: 1 }
            }
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !r) return null
              const diff = r.expense - avg
              return (
                <Tip>
                  <p className="mb-1 font-medium">{monthLabel(r.month)}</p>
                  <p className="num">Spent {money(r.expense)}</p>
                  {avg > 0 && (
                    <p className={cn('num', diff > 0 ? 'text-negative' : 'text-positive')}>
                      {money(Math.abs(diff))} {diff > 0 ? 'above' : 'below'} average
                    </p>
                  )}
                </Tip>
              )
            }}
          />
          {type === 'bar' ? (
            <Bar
              dataKey="expense"
              name="Expenses"
              radius={[4, 4, 0, 0]}
              maxBarSize={34}
              isAnimationActive={false}
            >
              {rows.map((r) => (
                <Cell key={r.month} fill={PAL.warm} opacity={r.month === selected ? 1 : 0.4} />
              ))}
            </Bar>
          ) : type === 'area' ? (
            <Area
              type="monotone"
              dataKey="expense"
              name="Expenses"
              stroke={PAL.warm}
              strokeWidth={2}
              fill="url(#exp-fill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: PAL.dotStroke }}
              isAnimationActive={false}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="expense"
              name="Expenses"
              stroke={PAL.warm}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: PAL.warm }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: PAL.dotStroke }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Money put into investments each month, stacked by type, followed by projected months (faded)
 * based on recurring SIPs/RDs/NPS.
 */
export function InvestmentChart({
  report,
  selected,
  onSelect,
  type = 'bar'
}: {
  report: InvestmentReport
  selected: string
  onSelect: (month: string) => void
  type?: ChartType
}): React.JSX.Element {
  const money = useMoney()
  const [hover, setHover] = useState<string | null>(null)
  const rows = report.series.map((s) => ({
    month: s.month,
    label: monthLabel(s.month, 'short'),
    projected: s.projected,
    total: s.totalMinor,
    ...s.byType
  }))
  const firstProjected = rows.find((r) => r.projected)?.label
  const dim = (id: string): number => (hover && hover !== id ? 0.2 : 1)
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2">
        {report.types.map((t) => (
          <button
            key={t.id}
            onMouseEnter={() => setHover(t.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(t.id)}
            onBlur={() => setHover(null)}
            className="flex items-center gap-1.5 text-[12px] text-ink-2 hover:text-ink"
          >
            <span className="size-2 rounded-full" style={{ background: t.color }} />
            {t.name}
          </button>
        ))}
        {firstProjected && (
          <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <span className="size-2 rounded-full border border-dashed border-ink-3" /> Projected
          </span>
        )}
      </div>
      <div className="h-[260px]" role="img" aria-label="Investments by month and type">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            barCategoryGap="30%"
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            onClick={(e) => {
              const r = rows[Number(e?.activeTooltipIndex ?? -1)]
              if (r && !r.projected) onSelect(r.month)
            }}
            style={{ cursor: 'pointer' }}
          >
            {axes(money)}
            {firstProjected && (
              <ReferenceLine
                x={firstProjected}
                stroke={PAL.refLine}
                strokeDasharray="4 4"
                label={{
                  value: 'projected →',
                  fill: PAL.tick,
                  fontSize: 10,
                  position: 'insideTopLeft'
                }}
              />
            )}
            <Tooltip
              cursor={
                type === 'bar' ? { fill: PAL.hoverFill } : { stroke: PAL.refLine, strokeWidth: 1 }
              }
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
                if (!active || !r) return null
                return (
                  <Tip>
                    <p className="mb-1 font-medium">
                      {monthLabel(r.month)}
                      {r.projected ? ' (projected)' : ''} ·{' '}
                      <span className="num">{money(r.total)}</span>
                    </p>
                    {report.types.map((t) =>
                      (r[t.id] as number) > 0 ? (
                        <p key={t.id} className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: t.color }} />
                          <span className="flex-1 text-ink-2">{t.name}</span>
                          <span className="num">{money(r[t.id] as number)}</span>
                        </p>
                      ) : null
                    )}
                    {r.total === 0 && <p className="text-ink-3">Nothing invested</p>}
                  </Tip>
                )
              }}
            />
            {report.types.map((t, i) =>
              type === 'bar' ? (
                <Bar
                  key={t.id}
                  dataKey={t.id}
                  name={t.name}
                  stackId="inv"
                  fill={t.color}
                  stroke={PAL.dotStroke}
                  strokeWidth={1}
                  maxBarSize={34}
                  radius={i === report.types.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                >
                  {rows.map((r) => (
                    <Cell
                      key={r.month}
                      opacity={dim(t.id) * (r.projected ? 0.3 : r.month === selected ? 1 : 0.7)}
                      strokeDasharray={r.projected ? '3 2' : undefined}
                    />
                  ))}
                </Bar>
              ) : type === 'area' ? (
                <Area
                  key={t.id}
                  type="monotone"
                  dataKey={t.id}
                  name={t.name}
                  stackId="inv"
                  stroke={t.color}
                  strokeWidth={1.5}
                  strokeOpacity={dim(t.id)}
                  fill={t.color}
                  fillOpacity={0.35 * dim(t.id)}
                  dot={false}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={t.id}
                  type="monotone"
                  dataKey={t.id}
                  name={t.name}
                  stroke={t.color}
                  strokeWidth={2}
                  strokeOpacity={dim(t.id)}
                  dot={{ r: 2.5, strokeWidth: 0, fill: t.color }}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: PAL.dotStroke }}
                  isAnimationActive={false}
                />
              )
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
