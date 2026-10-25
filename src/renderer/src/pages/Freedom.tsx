import { ArrowRight, Flag, Info, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { addMonthsClamped, formatDate, todayISO } from '@shared/dates'
import { monthsToTarget } from '@shared/domain/fi'
import { formatPercent, minorToInputValue, parseMoneyInput } from '@shared/money'
import type { FiProjection } from '@shared/types'
import {
  Button,
  Card,
  CardHeader,
  Disclaimer,
  ErrorState,
  Field,
  Input,
  Progress,
  Spinner
} from '../components/ui'
import { countryFor, isIndia } from '@shared/region'
import { useCurrency, useMoney, useMutation, useQuery } from '../lib/hooks'
import { NoDataState } from '../lib/report'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'
import { PAL } from '../lib/theme'

export function duration(months: number | null): string {
  if (months == null) return 'Not yet in sight'
  if (months === 0) return 'You’re there'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} month${m === 1 ? '' : 's'}`
  return m ? `${y} ${y === 1 ? 'yr' : 'yrs'} ${m} mo` : `${y} year${y === 1 ? '' : 's'}`
}

function Assumptions({ fi }: { fi: FiProjection }): React.JSX.Element {
  const currency = useCurrency()
  const settings = useUi((s) => s.settings)!
  const mutate = useMutation()
  const [corpus, setCorpus] = useState(minorToInputValue(settings.fiCorpusMinor, currency))
  const [spend, setSpend] = useState(minorToInputValue(settings.fiTargetSpendMinor, currency))
  const [ret, setRet] = useState(String(settings.fiReturnPct))
  const [wr, setWr] = useState(String(settings.fiWithdrawalPct))
  const money = useMoney()
  return (
    <Card>
      <CardHeader
        title="Your numbers"
        description="Change these any time — the projection updates instantly."
      />
      <form
        className="grid grid-cols-2 gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void mutate(async () => {
            useUi.getState().setSettings(
              await api.updateSettings({
                fiCorpusMinor: parseMoneyInput(corpus, currency),
                fiTargetSpendMinor: parseMoneyInput(spend, currency),
                fiReturnPct: Math.min(20, Math.max(-5, Number(ret) || 0)),
                fiWithdrawalPct: Math.min(10, Math.max(1, Number(wr) || 4))
              })
            )
          }, 'Projection updated')
        }}
      >
        <Field
          label="Savings & investments today"
          hint="Everything you’d count toward freedom."
          htmlFor="fi-c"
        >
          <Input
            id="fi-c"
            inputMode="decimal"
            value={corpus}
            onChange={(e) => setCorpus(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field
          label="Monthly spending when free"
          hint={`Blank = today’s average (${money(fi.avgMonthlySpendMinor)})`}
          htmlFor="fi-s"
        >
          <Input
            id="fi-s"
            inputMode="decimal"
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
            placeholder={minorToInputValue(fi.avgMonthlySpendMinor, currency)}
          />
        </Field>
        <Field
          label="Yearly return after inflation (%)"
          hint="An assumption, not a promise."
          htmlFor="fi-r"
        >
          <Input
            id="fi-r"
            type="number"
            step="0.5"
            value={ret}
            onChange={(e) => setRet(e.target.value)}
          />
        </Field>
        <Field
          label="Safe withdrawal rate (%)"
          hint="4% means savings of 25× yearly spending."
          htmlFor="fi-w"
        >
          <Input
            id="fi-w"
            type="number"
            step="0.25"
            value={wr}
            onChange={(e) => setWr(e.target.value)}
          />
        </Field>
        <div className="col-span-2 flex justify-end">
          <Button variant="primary" type="submit">
            Update projection
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function FreedomPage(): React.JSX.Element {
  const money = useMoney()
  const country = countryFor(useCurrency())
  const month = useUi((s) => s.month)
  const settings = useUi((s) => s.settings)
  const { go, askAi } = useUi()
  const {
    data: fi,
    error,
    loading,
    reload
  } = useQuery(
    () => api.getFiProjection(month),
    [
      month,
      settings?.fiCorpusMinor,
      settings?.fiReturnPct,
      settings?.fiWithdrawalPct,
      settings?.fiTargetSpendMinor
    ]
  )
  const [extra, setExtra] = useState(0)

  useEffect(() => setExtra(0), [fi?.fiNumberMinor])

  const whatIf = useMemo(() => {
    if (!fi) return null
    const target = Math.max(0, fi.targetMonthlySpendMinor - extra)
    const fiNumber = Math.round((target * 12) / ((settings?.fiWithdrawalPct ?? 4) / 100))
    const m = monthsToTarget(
      fi.corpusMinor,
      fi.monthlySavingsMinor + extra,
      fiNumber,
      settings?.fiReturnPct ?? 5
    )
    return { months: m, fiNumber, date: m == null ? null : addMonthsClamped(todayISO(), m) }
  }, [fi, extra, settings?.fiWithdrawalPct, settings?.fiReturnPct])

  const chart = useMemo(() => {
    if (!fi) return []
    const r = Math.pow(1 + (settings?.fiReturnPct ?? 5) / 100, 1 / 12) - 1
    let v = fi.corpusMinor
    return fi.series.map((p, i) => {
      if (i > 0) for (let k = 0; k < 12; k++) v = v * (1 + r) + fi.monthlySavingsMinor + extra
      return { ...p, whatIf: extra > 0 ? Math.max(0, Math.round(v)) : null }
    })
  }, [fi, extra, settings?.fiReturnPct])

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!fi) return <Spinner label={loading ? 'Projecting your path to freedom' : 'Loading'} />
  if (fi.monthsOfData === 0) {
    return (
      <>
        <h1 className="mb-5 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
          Financial independence
        </h1>
        <NoDataState month={month ?? todayISO().slice(0, 7)} />
      </>
    )
  }

  const sliderMax = Math.max(
    100_000,
    Math.round((fi.avgMonthlySpendMinor * 0.4) / 100_000) * 100_000
  )
  const sooner =
    fi.monthsToFi != null && whatIf?.months != null ? fi.monthsToFi - whatIf.months : null

  return (
    <div className="space-y-5">
      <div className="gloss relative overflow-hidden rounded-2xl p-7 text-white">
        <p className="eyebrow text-white/70">Financial independence</p>
        <div className="mt-3 grid grid-cols-[1.2fr_1fr] gap-8">
          <div>
            <p className="font-[family-name:var(--font-display)] text-[46px] leading-none font-semibold tracking-tight">
              {duration(fi.monthsToFi)}
            </p>
            <p className="mt-2 text-[14px] text-white/80">
              {fi.fiDate
                ? `to financial independence — around ${formatDate(fi.fiDate)} (estimate)`
                : 'Start saving something each month and a date appears here.'}
            </p>
            <div className="mt-5 max-w-md">
              <div className="mb-1.5 flex justify-between text-xs text-white/70">
                <span>{money(fi.corpusMinor)} saved</span>
                <span>{formatPercent(fi.progressPct)}</span>
              </div>
              <Progress
                value={fi.progressPct}
                tone="positive"
                label="Progress to financial independence"
              />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 self-center">
            {[
              ['Your FI number', money(fi.fiNumberMinor)],
              ['Saving per month', money(fi.monthlySavingsMinor)],
              ['Saving rate', formatPercent(fi.savingRate)],
              ['Spending per month', money(fi.targetMonthlySpendMinor)]
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl bg-white/[0.06] px-3.5 py-2.5 ring-1 ring-white/10"
              >
                <dt className="text-[11px] text-white/60">{k}</dt>
                <dd className="num mt-0.5 text-[17px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {!fi.corpusIsSet && (
          <p className="mt-5 flex items-center gap-1.5 text-xs text-white/70">
            <Info className="size-3.5" aria-hidden /> Add your current savings & investments below
            for an accurate date.
          </p>
        )}
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Card className="col-span-3">
          <div className="px-5 pt-5">
            <h3 className="text-[15px] font-semibold tracking-tight">What if you saved more?</h3>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Every {country.unit} saved shortens the road twice: you invest more and need less.
            </p>
          </div>
          <div className="px-5 pt-4">
            <label htmlFor="fi-extra" className="flex items-baseline justify-between text-[13px]">
              <span className="text-ink-2">Save an extra</span>
              <span className="num text-[20px] font-semibold">
                {money(extra)}
                <span className="text-[13px] font-normal text-ink-3">/month</span>
              </span>
            </label>
            <input
              id="fi-extra"
              type="range"
              min={0}
              max={sliderMax}
              step={isIndia(country.currency) ? 50_000 : 5_000}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
              className="mt-2 w-full accent-white"
            />
            <p className="mt-2 text-[13px]">
              {extra === 0 ? (
                <span className="text-ink-3">Drag to see how much sooner you could be free.</span>
              ) : whatIf?.months != null ? (
                <>
                  Free in <strong>{duration(whatIf.months)}</strong>
                  {sooner != null && sooner > 0 && (
                    <span className="text-positive"> — {duration(sooner)} sooner</span>
                  )}
                </>
              ) : (
                'Still not in sight.'
              )}
            </p>
          </div>
          <div
            className="h-[230px] px-3 pb-4 pt-3"
            role="img"
            aria-label="Projected savings versus your financial independence number"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="fiFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PAL.accent} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={PAL.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={PAL.grid} />
                <XAxis
                  dataKey="year"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11.5, fill: PAL.tick }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tick={{ fontSize: 11.5, fill: PAL.tick }}
                  tickFormatter={(v: number) => money(v, { compact: true })}
                />
                <Tooltip
                  cursor={{ stroke: '#555' }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof chart)[number] | undefined
                    if (!active || !p) return null
                    return (
                      <div className="material rounded-lg px-3 py-2 text-xs">
                        <p className="font-medium">{p.year}</p>
                        <p className="num text-ink-2">Projected savings {money(p.corpusMinor)}</p>
                        {p.whatIf != null && (
                          <p className="num text-positive">With extra saving {money(p.whatIf)}</p>
                        )}
                        <p className="num text-ink-3">FI number {money(p.fiNumberMinor)}</p>
                      </div>
                    )
                  }}
                />
                <ReferenceLine
                  y={fi.fiNumberMinor}
                  stroke={PAL.cool}
                  strokeDasharray="0"
                  strokeOpacity={0.6}
                  label={{
                    value: 'Freedom',
                    fill: PAL.cool,
                    fontSize: 11,
                    position: 'insideTopLeft'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="corpusMinor"
                  stroke={PAL.accent}
                  strokeWidth={2}
                  fill="url(#fiFill)"
                  isAnimationActive={false}
                />
                {extra > 0 && (
                  <Line
                    type="monotone"
                    dataKey="whatIf"
                    stroke={PAL.cool}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-span-2 flex flex-col">
          <CardHeader
            title="Fastest ways to get there"
            description="From your own spending — each saving, in time won back"
          />
          <ul className="mt-2 flex-1 divide-y divide-line px-5">
            {fi.levers.slice(0, 7).map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <Flag className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.label}</span>
                  <span className="num text-xs text-ink-3">{money(l.monthlyMinor)}/month</span>
                </span>
                <span className="num shrink-0 text-right text-[13px] font-semibold text-positive">
                  {l.monthsSooner ? `${duration(l.monthsSooner)} sooner` : '—'}
                </span>
              </li>
            ))}
            {fi.levers.length === 0 && (
              <li className="py-4 text-[13px] text-ink-3">
                No savings found yet — import more months.
              </li>
            )}
          </ul>
          <div className="flex gap-2 px-5 pb-4 pt-2">
            <Button
              size="sm"
              icon={<ArrowRight className="size-3.5" />}
              onClick={() => go('savings')}
            >
              Save more
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Sparkles className="size-3.5" />}
              onClick={() =>
                askAi(
                  'Make me a realistic plan to reach financial independence sooner. Start with the 3 changes that buy back the most time.'
                )
              }
            >
              Plan with Sanchay
            </Button>
          </div>
        </Card>
      </div>

      <Assumptions fi={fi} />
      <Card className="p-5">
        <p className="text-[13px] font-semibold">How this is estimated</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-2">
          {fi.assumptions.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      </Card>
      <Disclaimer />
    </div>
  )
}
