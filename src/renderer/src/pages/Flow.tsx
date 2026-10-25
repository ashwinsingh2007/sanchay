import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Copy,
  CreditCard,
  Gift,
  Layers,
  Lightbulb,
  Receipt,
  Repeat,
  Sparkles,
  TrendingUp,
  Zap
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatDate, monthEnd, monthLabel, monthStart } from '@shared/dates'
import type {
  FlowCategory,
  FlowMerchant,
  FlowSubscription,
  FlowTx,
  HiddenCost,
  IncomingGroup,
  MoneyFlow,
  PayTip,
  TransactionView,
  TxSuggestion
} from '@shared/types'
import { Amount, useCategoryName } from '../components/finance'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Disclaimer,
  EmptyState,
  ErrorState,
  Segmented,
  Spinner
} from '../components/ui'
import { SalaryBreakdown } from '../components/SalaryBreakdown'
import { SpendCalendar } from '../components/SpendCalendar'
import { useMoney, useQuery } from '../lib/hooks'
import { recategorise } from '../lib/recategorise'
import { NoDataState, useMonthlyReport } from '../lib/report'
import { IncomeExpenseBars, useChartType } from '../components/homeCharts'
import { ChartTypePicker } from './Home'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'
import { EditTransactionDialog } from './Transactions'
import { RecurringView } from './Recurring'

type Side = 'in' | 'out'
type Tab = 'save' | 'recurring' | 'hidden' | 'pay'

const SUGGESTION_META: Record<
  TxSuggestion['kind'],
  { label: string; tone: string; icon: ReactNode }
> = {
  free: {
    label: 'Free alternative',
    tone: 'bg-positive-soft text-positive',
    icon: <Gift className="size-3.5" />
  },
  cheaper: {
    label: 'Cheaper option',
    tone: 'bg-positive-soft text-positive',
    icon: <TrendingUp className="size-3.5 rotate-180" />
  },
  habit: {
    label: 'Smarter habit',
    tone: 'bg-attention-soft text-attention',
    icon: <Lightbulb className="size-3.5" />
  },
  avoid: {
    label: 'Avoidable',
    tone: 'bg-negative-soft text-negative',
    icon: <AlertTriangle className="size-3.5" />
  }
}

const HIDDEN_ICON: Record<HiddenCost['kind'], ReactNode> = {
  fee: <Receipt className="size-4" />,
  overlap: <Layers className="size-4" />,
  price_rise: <TrendingUp className="size-4" />,
  duplicate: <Copy className="size-4" />,
  small_recurring: <Repeat className="size-4" />
}

const CADENCE_LABEL: Record<FlowSubscription['cadence'], string> = {
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
  custom: 'cycle'
}

function useCategoryColor(): (id: string | null) => string {
  const categories = useUi((s) => s.categories)
  return (id) => categories.find((c) => c.id === id)?.color ?? '#94a3b8'
}

// ---------- Small building blocks ----------

function MerchantAvatar({ name, color }: { name: string; color: string }): React.JSX.Element {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold text-white ring-1 ring-white/10"
      style={{ background: `linear-gradient(145deg, ${color}55, ${color}22)` }}
      aria-hidden
    >
      {initials || '•'}
    </span>
  )
}

function TxList({ txs }: { txs: FlowTx[] }): React.JSX.Element {
  return (
    <ul className="divide-y divide-line rounded-lg bg-sunken/60">
      {txs.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
          <span className="num w-[52px] shrink-0 text-ink-3">{formatDate(t.date, 'short')}</span>
          <span className="min-w-0 flex-1 truncate text-ink-2" title={t.description}>
            {t.description}
          </span>
          {t.autoDebit && <Badge tone="outline">Auto-debit</Badge>}
          {t.accountName && (
            <span className="hidden shrink-0 text-ink-3 md:inline">{t.accountName}</span>
          )}
          <Amount minor={t.amountMinor} className="w-[96px] shrink-0 text-right" />
        </li>
      ))}
    </ul>
  )
}

/** The saving idea attached to a merchant. Rendered only when one exists. */
function SuggestionStrip({
  s,
  merchant,
  compact = false
}: {
  s: TxSuggestion
  merchant: string
  compact?: boolean
}): React.JSX.Element {
  const money = useMoney()
  const askAi = useUi((st) => st.askAi)
  const meta = SUGGESTION_META[s.kind]
  return (
    <div className="mt-2 rounded-lg border border-positive/15 bg-positive-soft px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
            meta.tone
          )}
        >
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">
            {s.title}
            <span className="ml-2 text-[12px] font-normal text-ink-3">{meta.label}</span>
            {s.source === 'ai' && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-ink-3">
                <Sparkles className="size-3" /> AI
              </span>
            )}
          </p>
          {!compact && (
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{s.detail}</p>
          )}
          {s.alternatives.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {s.alternatives.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-line-strong px-2 py-0.5 text-[11.5px] text-ink-2"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[14px] font-semibold text-positive">
            Save {money(s.monthlySavingMinor)}
            <span className="text-[11px] font-normal text-ink-3">/mo</span>
          </p>
          {!compact && (
            <button
              className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
              onClick={() =>
                askAi(
                  `I spend at ${merchant}. ${s.title}: ${s.detail} What's the cheapest way to get the same thing? Compare free and paid options and any current offers.`
                )
              }
            >
              <Sparkles className="size-3" /> Ask Sanchay
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MerchantRow({ m, color }: { m: FlowMerchant; color: string }): React.JSX.Element {
  const money = useMoney()
  const [open, setOpen] = useState(false)
  return (
    <li className="py-2.5">
      <button
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <MerchantAvatar name={m.merchant} color={color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-ink">{m.merchant}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
            {m.count} payment{m.count === 1 ? '' : 's'}
            {m.recurring && <Badge tone="outline">Recurring</Badge>}
            {m.autoDebit && <Badge tone="outline">Auto-debit</Badge>}
          </p>
        </div>
        <span className="num text-[13.5px] font-medium">{money(m.totalMinor)}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')}
        />
      </button>
      {m.suggestion && <SuggestionStrip s={m.suggestion} merchant={m.merchant} compact={!open} />}
      {m.payTip && <PayTipStrip tip={m.payTip} />}
      {open && (
        <div className="mt-2 pl-12">
          <TxList txs={m.transactions} />
        </div>
      )}
    </li>
  )
}

// ---------- Outgoing: categories ----------

function ShareBar({ categories }: { categories: FlowCategory[] }): React.JSX.Element {
  const color = useCategoryColor()
  const name = useCategoryName()
  return (
    <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
      {categories
        .filter((c) => c.sharePct > 0)
        .map((c) => (
          <div
            key={c.categoryId}
            title={`${name(c.categoryId)} · ${c.sharePct}%`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${c.sharePct}%`, background: color(c.categoryId) }}
          />
        ))}
    </div>
  )
}

function CategoryRow({ c, max }: { c: FlowCategory; max: number }): React.JSX.Element {
  const money = useMoney()
  const name = useCategoryName()
  const color = useCategoryColor()(c.categoryId)
  const [open, setOpen] = useState(false)
  const ideas = c.merchants.filter((m) => m.suggestion)
  const save = ideas.reduce((n, m) => n + (m.suggestion?.monthlySavingMinor ?? 0), 0)
  const delta =
    c.usualMinor && c.usualMinor > 0
      ? Math.round(((c.totalMinor - c.usualMinor) / c.usualMinor) * 100)
      : null
  return (
    <Card className={cn('overflow-hidden transition-colors', open && 'ring-1 ring-white/15')}>
      <button
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold">{name(c.categoryId)}</p>
            {c.kind === 'savings' && <Badge tone="positive">Not spending</Badge>}
            {c.categoryId === 'emi' && <Badge tone="outline">Debt</Badge>}
            {ideas.length > 0 && (
              <Badge tone="positive">
                <Lightbulb className="size-3" /> {ideas.length} way{ideas.length === 1 ? '' : 's'}{' '}
                to save {money(save)}/mo
              </Badge>
            )}
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (c.totalMinor / max) * 100)}%`, background: color }}
            />
          </div>
        </div>
        <div className="w-[150px] shrink-0 text-right">
          <p className="num text-[15px] font-semibold">{money(c.totalMinor)}</p>
          <p className="text-[11.5px] text-ink-3">
            {c.sharePct}% · {c.count} txn{c.count === 1 ? '' : 's'}
            {delta != null && Math.abs(delta) >= 10 && (
              <span className={cn('ml-1', delta > 0 ? 'text-negative' : 'text-positive')}>
                {Math.abs(delta) >= 200
                  ? `${Math.round(1 + delta / 100)}× usual`
                  : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs usual`}
              </span>
            )}
          </p>
        </div>
        <ChevronDown
          className={cn('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line px-5">
          {c.merchants.map((m) => (
            <MerchantRow key={m.key} m={m} color={color} />
          ))}
        </ul>
      )}
    </Card>
  )
}

export function CategoriesTab({ flow }: { flow: MoneyFlow }): React.JSX.Element {
  const cats = flow.outgoing.categories
  const name = useCategoryName()
  const color = useCategoryColor()
  if (cats.length === 0)
    return (
      <Card>
        <EmptyState
          icon={<ArrowUpRight className="size-5" />}
          title="Nothing went out"
          description="No outgoing payments this month."
        />
      </Card>
    )
  const max = cats[0]!.totalMinor
  return (
    <div className="space-y-3">
      <Card className="p-5">
        <ShareBar categories={cats} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {cats.slice(0, 8).map((c) => (
            <span key={c.categoryId} className="flex items-center gap-1.5 text-[12px] text-ink-2">
              <span className="size-2 rounded-full" style={{ background: color(c.categoryId) }} />
              {name(c.categoryId)} <span className="num text-ink-3">{c.sharePct}%</span>
            </span>
          ))}
        </div>
      </Card>
      {cats.map((c) => (
        <CategoryRow key={c.categoryId} c={c} max={max} />
      ))}
    </div>
  )
}

// ---------- Outgoing: subscriptions ----------

export function SubscriptionsTab({ flow }: { flow: MoneyFlow }): React.JSX.Element {
  const money = useMoney()
  const name = useCategoryName()
  const color = useCategoryColor()
  const subs = flow.outgoing.subscriptions
  if (subs.length === 0)
    return (
      <Card>
        <EmptyState
          icon={<Repeat className="size-5" />}
          title="No subscriptions found yet"
          description="Subscriptions show up once a charge repeats. Import two or three months of statements to see them."
        />
      </Card>
    )
  const monthly = subs.reduce((n, s) => n + s.monthlyMinor, 0)
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-8 px-6 py-5">
        <div>
          <p className="eyebrow text-ink-3">Subscriptions</p>
          <p className="num mt-1 text-[24px] font-semibold tracking-tight">{subs.length}</p>
        </div>
        <div>
          <p className="eyebrow text-ink-3">Per month</p>
          <p className="num mt-1 text-[24px] font-semibold tracking-tight">{money(monthly)}</p>
        </div>
        <div>
          <p className="eyebrow text-ink-3">Per year</p>
          <p className="num mt-1 text-[24px] font-semibold tracking-tight">{money(monthly * 12)}</p>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {subs.map((s) => (
          <Card key={s.key} className="flex flex-col p-4">
            <div className="flex items-start gap-3">
              <MerchantAvatar name={s.merchant} color={color(s.categoryId)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{s.merchant}</p>
                <p className="text-[12px] text-ink-3">{name(s.categoryId)}</p>
              </div>
              <div className="text-right">
                <p className="num text-[15px] font-semibold">{money(s.amountMinor)}</p>
                <p className="text-[11.5px] text-ink-3">per {CADENCE_LABEL[s.cadence]}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.nextExpectedDate && (
                <Badge tone="neutral">Next {formatDate(s.nextExpectedDate, 'short')}</Badge>
              )}
              {s.autoDebit && <Badge tone="outline">Auto-debit</Badge>}
              {s.overlapGroup && <Badge tone="attention">Overlaps: {s.overlapGroup}</Badge>}
              {s.priceRisePct != null && s.priceRisePct >= 3 && (
                <Badge tone="negative">Price up {s.priceRisePct}%</Badge>
              )}
            </div>
            {s.suggestion && <SuggestionStrip s={s.suggestion} merchant={s.merchant} />}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------- Outgoing: hidden costs ----------

function HiddenTab({ flow }: { flow: MoneyFlow }): React.JSX.Element {
  const money = useMoney()
  const [open, setOpen] = useState<string | null>(null)
  const hidden = flow.outgoing.hidden
  if (hidden.length === 0)
    return (
      <Card>
        <EmptyState
          icon={<Zap className="size-5" />}
          title="No hidden costs this month"
          description="No fees, double charges, overlapping or quietly rising subscriptions. Nice."
        />
      </Card>
    )
  return (
    <div className="space-y-3">
      {hidden.map((h) => (
        <Card key={h.id} className="p-5">
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-attention-soft text-attention">
              {HIDDEN_ICON[h.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold">{h.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{h.detail}</p>
              {h.transactions.length > 0 && (
                <button
                  className="mt-2 text-[12px] text-ink-3 hover:text-ink"
                  onClick={() => setOpen(open === h.id ? null : h.id)}
                >
                  {open === h.id ? 'Hide' : 'Show'} {h.transactions.length} transaction
                  {h.transactions.length === 1 ? '' : 's'}
                </button>
              )}
              {open === h.id && (
                <div className="mt-2">
                  <TxList txs={h.transactions} />
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="num text-[16px] font-semibold text-attention">{money(h.amountMinor)}</p>
              <p className="text-[11.5px] text-ink-3">
                {h.kind === 'fee' || h.kind === 'duplicate' ? 'this month' : 'per month'}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------- Outgoing: how to save ----------

function SaveTab({ flow, aiBusy }: { flow: MoneyFlow; aiBusy: boolean }): React.JSX.Element {
  const money = useMoney()
  const name = useCategoryName()
  const color = useCategoryColor()
  const askAi = useUi((s) => s.askAi)
  const list = flow.outgoing.suggestions
  return (
    <div className="space-y-3">
      {aiBusy && (
        <Card className="flex items-center gap-3 px-5 py-3 text-[13px] text-ink-2">
          <Sparkles className="size-4 animate-pulse text-ink" />
          Sanchay is looking for free and cheaper options for {flow.pendingAiMerchants} more
          merchant{flow.pendingAiMerchants === 1 ? '' : 's'}…
        </Card>
      )}
      {list.length === 0 && !aiBusy && (
        <Card>
          <EmptyState
            icon={<Lightbulb className="size-5" />}
            title="No obvious savings this month"
            description="Your spending doesn’t match any known cheaper or free alternatives. Ask Sanchay for a deeper look."
            action={
              <Button
                icon={<Sparkles className="size-4" />}
                onClick={() =>
                  askAi(
                    `Look at my spending in ${monthLabel(flow.month)} and find free or cheaper alternatives for what I pay for.`
                  )
                }
              >
                Ask Sanchay
              </Button>
            }
          />
        </Card>
      )}
      {list.map((s, i) => {
        const meta = SUGGESTION_META[s.kind]
        return (
          <Card
            key={s.merchantKey}
            className="animate-fade-up p-5"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="flex items-start gap-4">
              <MerchantAvatar name={s.merchant} color={color(s.categoryId)} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium',
                      meta.tone
                    )}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-[12px] text-ink-3">
                    {s.merchant} · {name(s.categoryId)}
                  </span>
                  {s.source === 'ai' && (
                    <Badge tone="outline">
                      <Sparkles className="size-3" /> AI suggestion
                    </Badge>
                  )}
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{s.detail}</p>
                {s.alternatives.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.alternatives.map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-ink ring-1 ring-white/10"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11.5px] text-ink-3">
                  {s.basis}. Estimate, not guaranteed.
                </p>
              </div>
              <div className="w-[140px] shrink-0 text-right">
                <p className="num text-[20px] font-semibold tracking-tight text-positive">
                  {money(s.monthlySavingMinor)}
                </p>
                <p className="text-[11.5px] text-ink-3">per month</p>
                <p className="num mt-0.5 text-[12px] text-ink-2">
                  {money(s.monthlySavingMinor * 12)}/yr
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 -mr-2"
                  icon={<Sparkles className="size-3.5" />}
                  onClick={() =>
                    askAi(
                      `Help me save at ${s.merchant}: "${s.title}". ${s.detail} Compare the free and cheaper options for my usage and tell me exactly what to switch.`
                    )
                  }
                >
                  Ask Sanchay
                </Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ---------- Incoming ----------

/** Twelve months of money in vs money out (moved here from Home). */
function IncomeTrendCard(): React.JSX.Element | null {
  const { data: report } = useMonthlyReport()
  const setMonth = useUi((s) => s.setMonth)
  const [type, setType] = useChartType('income-expenses')
  if (!report?.hasData || report.trend.length < 2) return null
  return (
    <Card>
      <CardHeader
        title="Money in vs money out"
        description="Last 12 months. Tap a month to open it."
        action={<ChartTypePicker value={type} onChange={setType} />}
      />
      <div className="px-3 pb-4 pt-3">
        <IncomeExpenseBars
          data={report.trend}
          selected={report.month}
          onSelect={setMonth}
          type={type}
        />
      </div>
    </Card>
  )
}

function IncomingView({ flow }: { flow: MoneyFlow }): React.JSX.Element {
  const money = useMoney()
  const color = useCategoryColor()
  const groups = flow.incoming.groups
  if (groups.length === 0)
    return (
      <div className="space-y-4">
        <SalaryBreakdown />
        <Card>
          <EmptyState
            icon={<ArrowDownLeft className="size-5" />}
            title="Nothing came in"
            description="No incoming money this month."
          />
        </Card>
      </div>
    )
  return (
    <div className="space-y-4">
      <IncomeTrendCard />
      <SalaryBreakdown />
      {groups.map((g: IncomingGroup) => (
        <Card key={g.id} className="overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-2">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight">{g.label}</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-2">{g.description}</p>
            </div>
            <p
              className={cn(
                'num text-[18px] font-semibold',
                g.id === 'own_money' ? 'text-ink-2' : 'text-positive'
              )}
            >
              +{money(g.totalMinor)}
            </p>
          </div>
          <ul className="divide-y divide-line px-5 pb-2">
            {g.merchants.map((m) => (
              <MerchantRow key={m.key} m={m} color={color(m.categoryId)} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

// ---------- Paying smarter ----------

const pct = (r: number): string => `${Math.round(r * 1000) / 10}%`

function PayTipStrip({ tip }: { tip: PayTip }): React.JSX.Element {
  const money = useMoney()
  return (
    <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-ink">
        <CreditCard className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <p className="text-ink">
          Pay with <span className="font-medium">{tip.best.label}</span>{' '}
          <span className="text-ink-3">· {pct(tip.best.rate)} back</span>
        </p>
        <p className="mt-0.5 text-ink-3">
          {tip.best.how} Today: {tip.current}.
        </p>
        {tip.others.length > 0 && (
          <p className="mt-1 text-ink-3">
            Also: {tip.others.map((o) => `${o.label} ${pct(o.rate)}`).join(' · ')}
          </p>
        )}
      </div>
      {tip.monthlyGainMinor > 0 && (
        <p className="num shrink-0 text-[13px] font-semibold text-positive">
          +{money(tip.monthlyGainMinor)}
          <span className="text-[11px] font-normal text-ink-3">/mo</span>
        </p>
      )}
    </div>
  )
}

function PaySmarterTab({ flow, month }: { flow: MoneyFlow; month: string }): React.JSX.Element {
  const money = useMoney()
  const askAi = useUi((s) => s.askAi)
  const advice = useQuery(() => api.getPaymentAdvice(month), [month])
  const a = advice.data
  const tips = flow.outgoing.payTips
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-8 px-6 py-5">
        <div>
          <p className="eyebrow text-ink-3">Rewards left on the table</p>
          <p className="num mt-1 text-[24px] font-semibold tracking-tight text-positive">
            {money(flow.outgoing.rewardsLeftMinor)}
            <span className="text-[13px] font-normal text-ink-3">/month</span>
          </p>
        </div>
        {a && (
          <>
            <div>
              <p className="eyebrow text-ink-3">Paid by UPI</p>
              <p className="num mt-1 text-[24px] font-semibold tracking-tight">{a.upiSharePct}%</p>
            </div>
            <div>
              <p className="eyebrow text-ink-3">Rewards today (est.)</p>
              <p className="num mt-1 text-[24px] font-semibold tracking-tight">
                {money(a.todayAnnualRewardMinor)}
                <span className="text-[13px] font-normal text-ink-3">/yr</span>
              </p>
            </div>
          </>
        )}
        <Button
          variant="ghost"
          className="ml-auto"
          icon={<Sparkles className="size-4" />}
          onClick={() =>
            askAi(
              'Which credit card(s) and UPI apps should I use for my spending, and exactly how should I pay at each of my top merchants to earn the most rewards and cashback?'
            )
          }
        >
          Ask Sanchay
        </Button>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="eyebrow text-ink-3">Best cards for your spending</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Ranked on your last {a?.months ?? 12} months — extra per year vs today, after fees.
          </p>
        </div>
        {!a ? (
          <Spinner />
        ) : (
          <>
            {a.combo && (
              <Card className="border-positive/20 bg-positive-soft p-5">
                <div className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-positive-soft text-positive">
                    <Layers className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow text-ink-3">Best two-card combo</p>
                    <p className="mt-1 text-[15px] font-semibold">{a.combo.names.join(' + ')}</p>
                    <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-ink-2">
                      {a.combo.split.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="num shrink-0 text-[20px] font-semibold text-positive">
                    +{money(a.combo.netAnnualGainMinor)}
                    <span className="text-[12px] font-normal text-ink-3">/yr</span>
                  </p>
                </div>
              </Card>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              {a.cards.slice(0, 3).map((c, i) => (
                <Card key={c.cardId} className="flex flex-col p-5">
                  <div className="flex items-center gap-2">
                    <span className="num flex size-6 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-[11.5px] uppercase tracking-wide text-ink-3">
                      {c.network}
                    </span>
                    {c.upi && <Badge tone="positive">Works on UPI</Badge>}
                  </div>
                  <p className="mt-2 text-[15px] font-semibold leading-tight">
                    {c.issuer} {c.name}
                  </p>
                  <p className="num mt-2 text-[22px] font-semibold tracking-tight text-positive">
                    +{money(Math.max(0, c.netAnnualGainMinor))}
                    <span className="text-[12px] font-normal text-ink-3">/yr</span>
                  </p>
                  <p className="text-[11.5px] text-ink-3">
                    Fee {c.effectiveFeeMinor === 0 ? 'nil' : money(c.effectiveFeeMinor)}
                    {c.annualFeeMinor > 0 && c.effectiveFeeMinor === 0 && ' (waived at your spend)'}
                    {c.lounges &&
                      ` · ${c.lounges.domestic >= 99 ? 'unlimited' : c.lounges.domestic} lounges`}
                  </p>
                  <ul className="mt-3 flex-1 space-y-1 text-[12.5px] text-ink-2">
                    {c.why.map((w) => (
                      <li key={w}>• {w}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.bestFor.slice(0, 2).map((b) => (
                      <span
                        key={b}
                        className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-2"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
            <p className="text-[11.5px] leading-relaxed text-ink-3">{a.notes.join(' ')}</p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="eyebrow text-ink-3">How to pay at each merchant</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            The card, UPI app or route that earns the most where you already spend.
          </p>
        </div>
        {tips.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CreditCard className="size-5" />}
              title="You’re already paying well"
              description="No meaningful extra rewards found for this month’s merchants."
            />
          </Card>
        ) : (
          tips.map((t) => (
            <Card key={t.merchantKey} className="p-5">
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-ink ring-1 ring-white/10">
                  <CreditCard className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-ink-3">
                    {t.merchant} · about {money(t.monthlyMinor)}/month · today: {t.current}
                  </p>
                  <h3 className="mt-0.5 text-[15px] font-semibold tracking-tight">
                    {t.best.label}{' '}
                    <span className="font-normal text-positive">{pct(t.best.rate)} back</span>
                  </h3>
                  <p className="mt-0.5 text-[13px] text-ink-2">{t.best.how}</p>
                  {t.others.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.others.map((o) => (
                        <span
                          key={o.label}
                          className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-ink ring-1 ring-white/10"
                        >
                          {o.label} · {pct(o.rate)}
                        </span>
                      ))}
                    </div>
                  )}
                  {(t.stack || t.avoid) && (
                    <p className="mt-2 text-[12px] text-ink-3">
                      {t.stack && <>Stacks: {t.stack} </>}
                      {t.avoid && <>Avoid: {t.avoid}</>}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-[18px] font-semibold text-positive">
                    +{money(t.monthlyGainMinor)}
                  </p>
                  <p className="text-[11.5px] text-ink-3">per month</p>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  )
}

// ---------- Page ----------

export function FlowPage(): React.JSX.Element {
  const month = useUi((s) => s.month)
  const money = useMoney()
  const flow = useQuery(() => api.getMoneyFlow(month), [month])
  const rows = useQuery(
    () =>
      month
        ? api.listTransactions({ from: monthStart(month), to: monthEnd(month), limit: 20000 })
        : Promise.resolve([]),
    [month]
  )
  const aiStatus = useQuery(() => api.getAiStatus())
  const [side, setSide] = useState<Side>('out')
  const [tab, setTab] = useState<Tab>('save')
  const [aiBusy, setAiBusy] = useState(false)
  const [sorting, setSorting] = useState(false)
  const [editing, setEditing] = useState<TransactionView | null>(null)

  const f = flow.data
  const aiReady = aiStatus.data?.ready ?? false
  const pending = f?.pendingAiMerchants ?? 0

  // Ask the AI for alternatives for merchants the catalogue doesn't cover (once per merchant).
  useEffect(() => {
    if (!month || !aiReady || pending === 0) return
    let cancelled = false
    setAiBusy(true)
    api
      .suggestAlternatives(month)
      .then((found) => {
        if (!cancelled && found > 0) flow.reload()
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setAiBusy(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, aiReady, pending])

  // Saving tips per merchant, shown under each outgoing transaction in the calendar.
  const tips = useMemo(() => {
    const map = new Map<string, TxSuggestion>()
    for (const c of f?.outgoing.categories ?? [])
      for (const m of c.merchants) if (m.suggestion) map.set(m.key, m.suggestion)
    for (const s of f?.outgoing.subscriptions ?? [])
      if (s.suggestion && !map.has(s.key)) map.set(s.key, s.suggestion)
    return map
  }, [f])
  const payTips = useMemo(() => {
    const map = new Map<string, PayTip>()
    for (const c of f?.outgoing.categories ?? [])
      for (const m of c.merchants) if (m.payTip) map.set(m.key, m.payTip)
    return map
  }, [f])

  if (!month) return <Spinner />
  if (flow.error) return <ErrorState message={flow.error} onRetry={flow.reload} />
  if (!f || !rows.data) return <Spinner />
  if (f.incoming.groups.length === 0 && f.outgoing.categories.length === 0)
    return <NoDataState month={month} />

  const counts = {
    subscriptions: f.outgoing.subscriptions.length,
    hidden: f.outgoing.hidden.length,
    save: f.outgoing.suggestions.length
  }
  const tabLabel = (label: string, n: number): ReactNode => (
    <>
      {label}
      {n > 0 && <span className="num rounded-full bg-white/10 px-1.5 text-[11px]">{n}</span>}
    </>
  )
  const sideTab = (
    value: Side,
    label: string,
    amount: number,
    icon: ReactNode
  ): React.JSX.Element => (
    <button
      role="tab"
      aria-selected={side === value}
      onClick={() => setSide(value)}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-4 py-2 text-left transition-all',
        side === value
          ? 'bg-surface text-ink shadow-[2px_2px_0_0_var(--color-line-strong)] ring-1 ring-line-strong'
          : 'text-ink-2 hover:text-ink'
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full',
          value === 'in' ? 'bg-positive-soft text-positive' : 'bg-expense-soft text-expense'
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block text-[12px] text-ink-3">{label}</span>
        <span
          className={cn(
            'num block text-[16px] font-semibold',
            side === value && (value === 'in' ? 'text-positive' : 'text-expense')
          )}
        >
          {money(amount)}
        </span>
      </span>
    </button>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="mb-1 eyebrow text-xs text-ink-3">{monthLabel(month)}</p>
          <h1 className="font-[family-name:var(--font-display)] text-[26px] font-semibold tracking-tight">
            Transactions
          </h1>
        </div>
        <Button
          variant="ghost"
          icon={<Sparkles className="size-4" />}
          loading={sorting}
          title="Re-check every category with the latest rules and Sanchay"
          onClick={() => {
            setSorting(true)
            void recategorise().finally(() => setSorting(false))
          }}
        >
          Re-categorise with AI
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Income or expenses"
          className="inline-flex gap-1 rounded-xl bg-ink/[0.06] p-1"
        >
          {sideTab('in', 'Income', f.incoming.totalMinor, <ArrowDownLeft className="size-4" />)}
          {sideTab('out', 'Expenses', f.outgoing.totalMinor, <ArrowUpRight className="size-4" />)}
        </div>
        <div className="text-right">
          <p className="text-[12px] text-ink-3">{f.netMinor >= 0 ? 'Saved' : 'Overspent'}</p>
          <p
            className={cn(
              'num text-[16px] font-semibold',
              f.netMinor >= 0 ? 'text-positive' : 'text-negative'
            )}
          >
            {money(Math.abs(f.netMinor))}
          </p>
        </div>
      </div>

      <SpendCalendar
        key={`${month}-${side}`}
        mode={side}
        month={month}
        rows={rows.data}
        onEdit={setEditing}
        suggestions={tips}
        payTips={payTips}
      />

      {side === 'in' ? (
        <IncomingView flow={f} />
      ) : (
        <>
          {f.outgoing.potentialMonthlyMinor > 0 && tab !== 'save' && (
            <button
              onClick={() => setTab('save')}
              className="flex w-full items-center gap-3 rounded-xl border border-positive/20 bg-positive-soft px-5 py-3.5 text-left transition-colors hover:border-positive/40"
            >
              <Lightbulb className="size-5 text-positive" />
              <span className="flex-1 text-[13.5px]">
                You could pay about{' '}
                <span className="num font-semibold text-positive">
                  {money(f.outgoing.potentialMonthlyMinor)}/month
                </span>{' '}
                less — {counts.save} idea{counts.save === 1 ? '' : 's'}, including free
                alternatives.
              </span>
              <span className="text-[12.5px] text-ink-2">See how →</span>
            </button>
          )}
          <Segmented
            label="Expense breakdown"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'save', label: tabLabel('How to save', counts.save) },
              { value: 'recurring', label: tabLabel('Recurring', counts.subscriptions) },
              { value: 'hidden', label: tabLabel('Hidden costs', counts.hidden) },
              { value: 'pay', label: tabLabel('Pay smarter', f.outgoing.payTips.length) }
            ]}
          />
          {tab === 'hidden' && <HiddenTab flow={f} />}
          {tab === 'save' && <SaveTab flow={f} aiBusy={aiBusy} />}
          {tab === 'recurring' && <RecurringView />}
          {tab === 'pay' && <PaySmarterTab flow={f} month={month} />}
        </>
      )}
      {editing && <EditTransactionDialog tx={editing} onClose={() => setEditing(null)} />}
      <Disclaimer />
    </div>
  )
}
