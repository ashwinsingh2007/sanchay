import { AlertTriangle, Info, ShieldAlert, Sparkles } from 'lucide-react'
import { formatDate } from '@shared/dates'
import type { CfoReview, ReviewFinding } from '@shared/domain/cfoReview'
import { formatMoney } from '@shared/money'
import { Card, CardHeader } from './ui'
import { useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

/**
 * The numbers the AI CFO works from, on screen: so you can check them, and so every answer
 * starts from the same facts.
 */
const money = (minor: number | null): string =>
  minor == null ? '—' : formatMoney(minor, 'INR', { compact: true })

const SEVERITY: Record<ReviewFinding['severity'], { icon: React.ReactNode; tone: string }> = {
  high: { icon: <ShieldAlert className="size-4" />, tone: 'text-hot' },
  attention: { icon: <AlertTriangle className="size-4" />, tone: 'text-warm' },
  info: { icon: <Info className="size-4" />, tone: 'text-ink-3' }
}

function Allocation({ review }: { review: CfoReview }): React.JSX.Element {
  const slices = review.allocation.filter((a) => a.currentPct > 0 || (a.targetPct ?? 0) > 0)
  return (
    <div className="space-y-3">
      {slices.map((a) => (
        <div key={a.key} className="text-[12.5px]">
          <div className="mb-1 flex justify-between">
            <span className="font-medium">{a.label}</span>
            <span className="num text-ink-2">
              {a.currentPct}%{' '}
              {a.targetPct != null && <span className="text-ink-3">· target {a.targetPct}%</span>}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-cold"
              style={{ width: `${Math.min(100, a.currentPct)}%` }}
            />
            {a.targetPct != null && (
              <div
                className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink"
                style={{ left: `calc(${Math.min(100, a.targetPct)}% - 1px)` }}
                title={`Target ${a.targetPct}%`}
              />
            )}
          </div>
        </div>
      ))}
      <p className="text-[11.5px] leading-snug text-ink-3">{review.targetBasis}</p>
    </div>
  )
}

export function CfoReviewCard(): React.JSX.Element | null {
  const review = useQuery(() => api.getCfoReview())
  const askAi = useUi((s) => s.askAi)
  const r = review.data
  if (!r) return null
  const stat = (label: string, value: string, note?: string): React.JSX.Element => (
    <div>
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className="text-[18px] font-semibold tracking-tight">{value}</p>
      {note && <p className="text-[11.5px] text-ink-3">{note}</p>}
    </div>
  )
  return (
    <Card>
      <CardHeader
        title="Portfolio review"
        description={`What Sanchay sees, computed from INDmoney (${formatDate(r.asOf)}), your statements and profile. Every answer starts from these numbers.`}
        action={
          <button
            onClick={() =>
              askAi(
                'Go through my portfolio review and tell me exactly what to do with my money, in priority order.',
                true
              )
            }
            className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent-ink hover:opacity-90"
          >
            <Sparkles className="size-3.5" /> Ask for a plan
          </button>
        }
      />
      <div className="grid gap-6 p-5 pt-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {stat('Cash in savings', money(r.cashMinor))}
            {stat(
              'Emergency fund',
              money(r.emergencyFundMinor),
              r.typicalMonthlySpendMinor != null
                ? `6 × ${money(r.typicalMonthlySpendMinor)} typical month`
                : 'needs statements'
            )}
            {stat('Investable surplus', money(r.investableSurplusMinor), 'cash beyond the fund')}
            {stat(
              'Holdings',
              `${r.stocks.count} stocks · ${r.funds.count} funds`,
              r.funds.elssCount ? `${r.funds.elssCount} tax-saver funds` : undefined
            )}
          </div>
          <Allocation review={r} />
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-ink-2">In priority order</p>
          <ul className="space-y-3">
            {r.findings.map((f) => (
              <li key={f.id} className="flex gap-3">
                <span className={cn('mt-0.5 shrink-0', SEVERITY[f.severity].tone)}>
                  {SEVERITY[f.severity].icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium">{f.title}</p>
                  <p className="text-[12.5px] leading-snug text-ink-3">{f.detail}</p>
                </div>
              </li>
            ))}
            {r.findings.length === 0 && (
              <li className="text-[13px] text-ink-3">Nothing urgent — nicely balanced.</li>
            )}
          </ul>
        </div>
      </div>
    </Card>
  )
}
