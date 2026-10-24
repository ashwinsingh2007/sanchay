import { AlertTriangle, ChevronRight, CircleAlert, Info, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDate } from '@shared/dates'
import type { CalcLine, Evidence, EvidenceTx, Insight, Severity } from '@shared/types'
import { useMoney } from '../lib/hooks'
import { useUi } from '../lib/store'
import { cn } from '../lib/utils'
import { Badge, Card } from './ui'

export function Amount({
  minor,
  className,
  colorInflow = true,
  signed = false
}: {
  minor: number
  className?: string
  colorInflow?: boolean
  signed?: boolean
}): React.JSX.Element {
  const money = useMoney()
  const inflow = minor > 0
  return (
    <span className={cn('num', colorInflow && inflow && 'text-positive', className)}>
      {inflow && (signed || colorInflow) ? '+' : ''}
      {money(inflow ? minor : signed ? minor : Math.abs(minor), {
        // Paise only when there are any; ₹8,000.00 is noise.
        precise: minor % 100 !== 0
      })}
    </span>
  )
}

export function CategoryDot({ categoryId }: { categoryId: string | null }): React.JSX.Element {
  const category = useUi((s) => s.categories.find((c) => c.id === categoryId))
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: category?.color ?? '#cbd5e1' }}
      aria-hidden
    />
  )
}

export function useCategoryName(): (id: string | null) => string {
  const categories = useUi((s) => s.categories)
  return (id) => categories.find((c) => c.id === id)?.name ?? 'Uncategorised'
}

const severityMeta: Record<
  Severity,
  { label: string; tone: 'negative' | 'attention' | 'neutral'; icon: ReactNode }
> = {
  high: { label: 'Urgent', tone: 'negative', icon: <CircleAlert className="size-3" aria-hidden /> },
  attention: {
    label: 'Needs attention',
    tone: 'attention',
    icon: <AlertTriangle className="size-3" aria-hidden />
  },
  info: { label: 'For review', tone: 'neutral', icon: <Info className="size-3" aria-hidden /> }
}

export function SeverityBadge({ severity }: { severity: Severity }): React.JSX.Element {
  const meta = severityMeta[severity]
  return (
    <Badge tone={meta.tone}>
      {meta.icon}
      {meta.label}
    </Badge>
  )
}

export function ConfidenceBadge({
  confidence
}: {
  confidence: number | null
}): React.JSX.Element | null {
  if (confidence == null) return null
  const pct = Math.round(confidence * 100)
  const label = pct >= 80 ? 'High confidence' : pct >= 60 ? 'Medium confidence' : 'Low confidence'
  return (
    <Badge tone="outline">
      {label} · {pct}%
    </Badge>
  )
}

function CalcTable({ lines }: { lines: CalcLine[] }): React.JSX.Element {
  const money = useMoney()
  return (
    <table className="w-full text-[13px]">
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className={cn(l.op === '=' && 'border-t border-line font-medium text-ink')}>
            <td className="w-5 py-1 text-ink-3">{l.op === '=' ? '' : (l.op ?? '')}</td>
            <td className="py-1 pr-4 text-ink-2">{l.label}</td>
            <td className="num py-1 text-right text-ink">
              {l.amountMinor != null ? money(l.amountMinor) : l.text}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function EvidenceTransactions({
  transactions,
  limit = 12
}: {
  transactions: EvidenceTx[]
  limit?: number
}): React.JSX.Element {
  return (
    <ul className="divide-y divide-line">
      {transactions.slice(0, limit).map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2 text-[13px]">
          <span className="num w-[72px] shrink-0 text-ink-3">{formatDate(t.date, 'short')}</span>
          <CategoryDot categoryId={t.categoryId} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{t.merchant}</span>
            <span
              className="block truncate text-[11.5px] text-ink-3"
              data-selectable
              title={t.description}
            >
              {t.description}
            </span>
          </span>
          <Amount minor={t.amountMinor} className="shrink-0" />
        </li>
      ))}
      {transactions.length > limit && (
        <li className="py-2 text-xs text-ink-3">+ {transactions.length - limit} more</li>
      )}
    </ul>
  )
}

export function EvidencePanel({
  evidence,
  label = 'Explain the numbers'
}: {
  evidence: Evidence
  label?: string
}): React.JSX.Element | null {
  const has =
    evidence.calculation.length > 0 || evidence.transactions.length > 0 || evidence.notes.length > 0
  if (!has) return null
  return (
    <details className="group mt-3 rounded-xl border border-line bg-canvas/60">
      <summary className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink">
        <ChevronRight className="chevron size-3.5 transition-transform" aria-hidden />
        {label}
      </summary>
      <div className="space-y-4 px-4 pb-4 pt-1">
        {evidence.calculation.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] eyebrow text-ink-3">Calculation</p>
            <CalcTable lines={evidence.calculation} />
          </div>
        )}
        {evidence.notes.length > 0 && (
          <ul className="space-y-1 text-xs text-ink-2">
            {evidence.notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        )}
        {evidence.transactions.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] eyebrow text-ink-3">
              Linked transactions ({evidence.transactions.length})
            </p>
            <EvidenceTransactions transactions={evidence.transactions} />
          </div>
        )}
      </div>
    </details>
  )
}

export function InsightCard({
  insight,
  index,
  onDismiss
}: {
  insight: Insight
  index?: number
  onDismiss?: (id: string) => void
}): React.JSX.Element {
  const money = useMoney()
  return (
    <Card className="animate-fade-up p-5">
      <div className="flex items-start gap-4">
        {index != null && (
          <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-ink-2">
            {index}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={insight.severity} />
            <ConfidenceBadge confidence={insight.confidence} />
            {insight.isEstimate && <Badge tone="outline">Estimate</Badge>}
          </div>
          <h4 className="text-[15px] font-semibold leading-snug tracking-tight">{insight.title}</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{insight.summary}</p>

          <div className="mt-3 grid gap-3 rounded-xl bg-sunken/70 px-4 py-3 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="text-[11px] eyebrow text-ink-3">Recommended action</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink">{insight.action}</p>
            </div>
            {insight.estimatedImpactMinor != null && (
              <div className="sm:text-right">
                <p className="text-[11px] eyebrow text-ink-3">
                  {insight.isEstimate ? 'Estimated impact' : 'Impact'}
                </p>
                <p className="num mt-0.5 text-[15px] font-semibold">
                  {money(insight.estimatedImpactMinor)}
                </p>
                {insight.impactLabel && (
                  <p className="text-[11.5px] text-ink-3">{insight.impactLabel}</p>
                )}
              </div>
            )}
          </div>
          <p className="mt-2.5 flex items-start gap-1.5 text-xs text-ink-3">
            <Sparkles className="mt-px size-3 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-ink-2">Why this was suggested: </span>
              {insight.why}
            </span>
          </p>
          <EvidencePanel evidence={insight.evidence} />
        </div>
        {onDismiss && (
          <button
            className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink"
            onClick={() => onDismiss(insight.id)}
            aria-label={`Dismiss: ${insight.title}`}
            title="Dismiss"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </Card>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
  children,
  className
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: 'positive' | 'negative' | 'attention'
  children?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <Card className={cn('p-5', className)}>
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <p
        className={cn(
          'num mt-1.5 font-[family-name:var(--font-display)] text-[26px] font-semibold tracking-tight',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          tone === 'attention' && 'text-attention'
        )}
      >
        {value}
      </p>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
      {children}
    </Card>
  )
}

export function Delta({
  minor,
  invert = false,
  suffix = 'vs last month'
}: {
  minor: number
  invert?: boolean
  suffix?: string
}): React.JSX.Element {
  const money = useMoney()
  if (minor === 0) return <span>No change {suffix}</span>
  // For spending, an increase is "bad" (invert = true).
  const good = invert ? minor < 0 : minor > 0
  return (
    <span>
      <span className={cn('num font-medium', good ? 'text-positive' : 'text-attention')}>
        {money(minor, { signed: true })}
      </span>{' '}
      {suffix}
    </span>
  )
}
