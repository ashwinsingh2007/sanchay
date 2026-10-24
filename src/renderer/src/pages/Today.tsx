import { useMemo, useState } from 'react'
import { ArrowUp, Check, ChevronRight, RefreshCw, Sparkles } from 'lucide-react'
import { formatDate, monthLabel, todayISO } from '@shared/dates'
import { isAnswered, PROFILE_QUESTIONS } from '@shared/domain/profile'
import { formatMoney } from '@shared/money'
import type { IndmoneySnapshot, Insight, MonthlyCloseReport } from '@shared/types'
import { Sparkline } from '../components/homeCharts'
import { HomeAiCard } from '../components/HomeAiCard'
import { HomeSetup } from '../components/HomeSetup'
import { Card, Disclaimer, Spinner } from '../components/ui'
import { VoiceButton } from '../components/VoiceButton'
import { useMoney, useMutation, useQuery } from '../lib/hooks'
import { recategorise } from '../lib/recategorise'
import { useMonthlyReport } from '../lib/report'
import { useUi } from '../lib/store'
import { PAL } from '../lib/theme'
import { api, cn } from '../lib/utils'
import { Markdown } from './AiCfo'

/**
 * Today: the AI CFO's page. Its note on where you stand, one box to ask anything, four quiet
 * vital signs and the next three moves. Charts live on their own pages.
 */
function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

type Row = Record<string, unknown>
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

function parseRow(rows: IndmoneySnapshot[] | null, tool: string): Row | null {
  const row = rows?.find((r) => r.tool === tool)
  if (!row || row.content.startsWith('Error:')) return null
  try {
    const v = JSON.parse(row.content) as Row
    return typeof v['result'] === 'string' ? (JSON.parse(v['result']) as Row) : v
  } catch {
    return null
  }
}

/** Portfolio facts for tiles and prompts, from the INDmoney snapshot. */
function usePortfolio(rows: IndmoneySnapshot[] | null): {
  netWorth: number | null
  dayChange: number | null
  savingsCash: number
  hasFunds: boolean
  hasStocks: boolean
  cardDue: { name: string; amount: number; date: string } | null
} {
  return useMemo(() => {
    const snap = parseRow(rows, 'networth_snapshot')
    const investments = (snap?.['investments'] as Row[] | undefined) ?? []
    const value = (type: string): number =>
      n(investments.find((i) => i['asset_type'] === type)?.['current_value'])
    let dayChange: number | null = null
    for (const r of rows ?? []) {
      if (!r.tool.startsWith('networth_holdings:')) continue
      const summary = parseRow(rows, r.tool)?.['asset_summary'] as Row | undefined
      if (summary) dayChange = (dayChange ?? 0) + n(summary['one_day_change'])
    }
    const cards =
      ((snap?.['liabilities'] as Row | undefined)?.['credit_cards'] as Row[] | undefined) ?? []
    const card = cards.find((c) => n(c['total_due']) > 0)
    return {
      netWorth: snap ? n(snap['total_networth']) : null,
      dayChange,
      savingsCash: value('SA'),
      hasFunds: value('MF') > 0,
      hasStocks: value('STOCK') > 0,
      cardDue: card
        ? {
            name: String(card['name'] ?? 'Credit card'),
            amount: n(card['total_due']),
            date: String(card['due_date'] ?? '')
          }
        : null
    }
  }, [rows])
}

// ---------- The CFO's note + ask box ----------

function CfoNote({ prompts }: { prompts: string[] }): React.JSX.Element {
  const askAi = useUi((s) => s.askAi)
  const [text, setText] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const briefing = useQuery(() => api.getBriefing(false))
  const ask = (q: string): void => {
    if (q.trim()) askAi(q.trim(), true)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-4 p-6 pb-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-2">
              Your CFO&apos;s note
              {briefing.data && (
                <span className="font-normal text-ink-3">
                  {' '}
                  · {formatDate(briefing.data.createdAt.slice(0, 10), 'short')}
                </span>
              )}
            </p>
            {briefing.data && (
              <button
                className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
                disabled={refreshing}
                onClick={() => {
                  setRefreshing(true)
                  void api
                    .getBriefing(true)
                    .then(() => briefing.reload())
                    .finally(() => setRefreshing(false))
                }}
              >
                <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} /> Refresh
              </button>
            )}
          </div>
          <div className="mt-2 text-[14.5px] leading-relaxed text-ink" data-selectable>
            {briefing.loading && !briefing.data ? (
              <p className="text-ink-3">Reading your numbers…</p>
            ) : briefing.data ? (
              <Markdown text={briefing.data.content} />
            ) : (
              <p className="text-ink-2">
                Import a statement or connect INDmoney and I&apos;ll tell you where you stand.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-line bg-sunken/50 px-6 py-4">
        <form
          className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pl-4 pr-1.5 focus-within:border-accent"
          onSubmit={(e) => {
            e.preventDefault()
            ask(text)
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask your CFO anything about your money…"
            aria-label="Ask your CFO"
            className="h-8 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
          />
          <VoiceButton onText={(t) => setText((cur) => (cur ? `${cur} ${t}` : t))} />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Ask"
            className="gloss-btn flex size-8 items-center justify-center rounded-lg disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button
              key={p}
              onClick={() => ask(p)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ---------- Vital signs ----------

const TONE = { cold: 'text-cold', cool: 'text-cool', warm: 'text-warm', hot: 'text-hot' } as const

function Tile({
  label,
  value,
  tone,
  note,
  trend,
  onClick
}: {
  label: string
  value: string
  tone?: 'cold' | 'cool' | 'warm' | 'hot'
  note?: React.ReactNode
  trend?: number[]
  onClick?: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="material group flex min-w-0 flex-col justify-between gap-3 rounded-xl p-4 text-left transition-colors hover:border-line-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-3">{label}</span>
        <ChevronRight className="size-3.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn('truncate text-[22px] font-semibold tracking-tight', tone && TONE[tone])}
          >
            {value}
          </p>
          {note && <p className="mt-0.5 truncate text-[12px] text-ink-3">{note}</p>}
        </div>
        {trend && trend.length > 2 && (
          <Sparkline values={trend} color={PAL.prev} dotColor={tone ? PAL[tone] : PAL.accent} />
        )}
      </div>
    </button>
  )
}

function VitalSigns({
  report,
  portfolio
}: {
  report: MonthlyCloseReport | null
  portfolio: ReturnType<typeof usePortfolio>
}): React.JSX.Element {
  const money = useMoney()
  const go = useUi((s) => s.go)
  const inr = (rupees: number, compact = true): string =>
    formatMoney(Math.round(rupees * 100), 'INR', { compact })
  const tiles: React.ReactNode[] = []

  if (portfolio.netWorth !== null)
    tiles.push(
      <Tile
        key="nw"
        label="Net worth"
        value={inr(portfolio.netWorth)}
        tone="cold"
        note={
          portfolio.dayChange ? (
            <span className={portfolio.dayChange < 0 ? 'text-hot' : 'text-cool'}>
              {portfolio.dayChange > 0 ? '▲' : '▼'} {inr(Math.abs(portfolio.dayChange))} today
            </span>
          ) : (
            'INDmoney'
          )
        }
        onClick={() => go('investments')}
      />
    )

  if (report?.hasData) {
    const c = report.current
    const past = report.trend.slice(0, -1).slice(-6)
    const avgSpend = past.length
      ? past.reduce((t, p) => t + p.spendingMinor, 0) / past.length
      : null
    const vsAvg = avgSpend ? (c.spendingMinor - avgSpend) / avgSpend : null
    const spendHot = vsAvg !== null && vsAvg > 0.15
    tiles.push(
      <Tile
        key="spent"
        label={`Spent in ${monthLabel(report.month, 'short')}`}
        value={money(c.spendingMinor, { compact: true })}
        tone={spendHot ? 'hot' : 'warm'}
        note={
          vsAvg === null
            ? 'first month'
            : Math.abs(vsAvg) < 0.05
              ? 'about usual'
              : `${vsAvg > 0 ? '▲' : '▼'} ${Math.min(999, Math.round(Math.abs(vsAvg) * 100))}% vs avg`
        }
        trend={report.trend.map((t) => t.spendingMinor)}
        onClick={() => go('flow')}
      />
    )
    const net = c.incomeMinor - c.spendingMinor
    tiles.push(
      <Tile
        key="net"
        label={net >= 0 ? 'Saved' : 'Overspent'}
        value={money(Math.abs(net), { compact: true })}
        tone={net >= 0 ? 'cool' : 'hot'}
        note={`of ${money(c.incomeMinor, { compact: true })} in`}
        trend={report.trend.map((t) => t.incomeMinor - t.spendingMinor)}
        onClick={() => go('flow')}
      />
    )
    const sts = report.safeToSpend
    tiles.push(
      sts.status === 'ok' ? (
        <Tile
          key="sts"
          label="Safe to spend"
          value={money(sts.valueMinor, { compact: true })}
          tone={sts.valueMinor > 0 ? 'cool' : 'hot'}
          note={`until ${formatDate(sts.nextIncomeDate, 'short')} · ${money(sts.dailyAllowanceMinor, { compact: true })}/day`}
          onClick={() => go('accounts')}
        />
      ) : portfolio.cardDue ? (
        <Tile
          key="due"
          label="Card due"
          value={inr(portfolio.cardDue.amount, false)}
          tone="warm"
          note={`${portfolio.cardDue.name.split('•')[0]?.trim()} · ${formatDate(portfolio.cardDue.date, 'short')}`}
          onClick={() => go('investments')}
        />
      ) : (
        <Tile
          key="sts"
          label="Safe to spend"
          value="Set payday"
          note="add your next income date"
          onClick={() => go('settings')}
        />
      )
    )
  }

  if (tiles.length === 0) return <></>
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles}</div>
}

// ---------- Next moves ----------

function NextMoves({ insights }: { insights: Insight[] }): React.JSX.Element | null {
  const money = useMoney()
  const mutate = useMutation()
  const { askAi, go } = useUi()
  const todo = insights.filter((i) => !i.completed).slice(0, 3)
  if (todo.length === 0) return null
  return (
    <section>
      <div className="mb-2 flex items-end justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-tight">Next moves</h2>
        <button className="text-[12.5px] text-ink-3 hover:text-ink" onClick={() => go('steps')}>
          All moves →
        </button>
      </div>
      <Card>
        <ul className="divide-y divide-line">
          {todo.map((i) => (
            <li key={i.id} className="flex items-center gap-4 px-5 py-3.5">
              <button
                aria-label="Mark done"
                title="Mark done"
                onClick={() =>
                  void mutate(() => api.setInsightDone({ id: i.id, done: true }), 'Nice — done')
                }
                className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition-colors hover:border-cool hover:text-cool"
              >
                <Check className="size-3" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{i.title}</p>
                <p className="truncate text-[12.5px] text-ink-3">{i.action || i.summary}</p>
              </div>
              {i.estimatedImpactMinor ? (
                <span className="num shrink-0 text-[13px] font-medium text-cool">
                  {money(i.estimatedImpactMinor, { compact: true })}
                  <span className="text-[11px] font-normal text-ink-3">/mo</span>
                </span>
              ) : null}
              <button
                onClick={() =>
                  askAi(
                    `Help me act on this: ${i.title}. ${i.summary} What exactly should I do?`,
                    true
                  )
                }
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] text-accent-ink hover:bg-accent-soft"
              >
                <Sparkles className="size-3.5" /> Ask
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

/** When "Other" swallows a big share, every insight gets worse — offer the one-click fix. */
function UncategorisedNudge({ report }: { report: MonthlyCloseReport }): React.JSX.Element | null {
  const money = useMoney()
  const [busy, setBusy] = useState(false)
  const other = report.current.byCategory.find((c) => c.categoryId === 'other')
  const share =
    other && report.current.spendingMinor ? other.spendMinor / report.current.spendingMinor : 0
  if (share < 0.25) return null
  return (
    <div className="flex items-center gap-4 rounded-xl border border-warm/25 bg-warm-soft px-5 py-3.5">
      <p className="min-w-0 flex-1 text-[13px] text-ink-2">
        <span className="font-medium text-ink">
          {Math.round(share * 100)}% of {monthLabel(report.month, 'short')} spending
        </span>{' '}
        ({money(other!.spendMinor, { compact: true })}) is uncategorised, so my advice on it is
        guesswork.
      </p>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void recategorise().finally(() => setBusy(false))
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-line hover:ring-line-strong disabled:opacity-60"
      >
        <Sparkles className={cn('size-3.5 text-accent-ink', busy && 'animate-pulse')} />
        {busy ? 'Sorting…' : 'Sort it with AI'}
      </button>
    </div>
  )
}

// ---------- Page ----------

function suggestedPrompts(
  report: MonthlyCloseReport | null,
  portfolio: ReturnType<typeof usePortfolio>,
  profileGaps: number
): string[] {
  const out: string[] = []
  const fmt = (m: number): string => formatMoney(m, 'INR', { compact: true })
  if (report?.hasData) {
    const net = report.current.incomeMinor - report.current.spendingMinor
    if (net < 0)
      out.push(`Why did I overspend ${fmt(-net)} in ${monthLabel(report.month, 'short')}?`)
  }
  if (portfolio.savingsCash > 300_000)
    out.push(`What should I do with ${fmt(portfolio.savingsCash * 100)} sitting in savings?`)
  if (portfolio.hasFunds) out.push('Which of my mutual funds should I keep?')
  if (portfolio.hasStocks) out.push('Is my stock portfolio too concentrated?')
  if (profileGaps > 6) out.push('What do you need to know about me to advise better?')
  out.push('Am I on track for financial independence?')
  return out.slice(0, 4)
}

export function TodayPage(): React.JSX.Element {
  const { data: report, month } = useMonthlyReport()
  const indmoney = useQuery(() => api.listIndmoneySnapshots())
  const profile = useQuery(() => api.listProfile())
  const portfolio = usePortfolio(indmoney.data)
  const gaps = useMemo(() => {
    const byKey = new Map((profile.data ?? []).map((e) => [e.key, e]))
    return PROFILE_QUESTIONS.filter((q) => !isAnswered(byKey.get(q.key))).length
  }, [profile.data])

  if (!month || indmoney.loading) return <Spinner />

  // Warn when the latest statement is well behind today.
  const coverageEnd = report?.current.coverageEnd ?? null
  const staleDays = coverageEnd
    ? Math.round((Date.parse(todayISO()) - Date.parse(coverageEnd)) / 86_400_000)
    : 0

  return (
    <div className="mx-auto max-w-[920px] space-y-6">
      <header className="flex items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-[13px] text-ink-3">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
            {greeting()}
          </h1>
        </div>
        {staleDays > 20 && coverageEnd && (
          <p className="rounded-full bg-warm-soft px-3 py-1 text-[12px] text-warm">
            Statements end {formatDate(coverageEnd, 'short')} — import newer ones for a sharper view
          </p>
        )}
      </header>

      <HomeAiCard />
      <CfoNote prompts={suggestedPrompts(report, portfolio, gaps)} />
      <VitalSigns report={report} portfolio={portfolio} />
      {report?.hasData && <UncategorisedNudge report={report} />}
      {report?.hasData && <NextMoves insights={report.insights} />}
      <HomeSetup hasStatements={!!report?.hasData} />
      <Disclaimer className="pt-2" />
    </div>
  )
}
