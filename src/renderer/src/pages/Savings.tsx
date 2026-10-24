import {
  AlertTriangle,
  BadgePercent,
  CreditCard,
  ExternalLink,
  Lightbulb,
  Receipt,
  Repeat,
  Search,
  Sparkles,
  Tag,
  TrendingDown
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatDate, monthLabel } from '@shared/dates'
import { monthsToTarget } from '@shared/domain/fi'
import type { FiProjection, OffersResult, SavingsKind, SavingsOpportunity } from '@shared/types'
import { ConfidenceBadge, EvidencePanel } from '../components/finance'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Disclaimer,
  EmptyState,
  ErrorState,
  Spinner
} from '../components/ui'
import { useMoney, useQuery } from '../lib/hooks'
import { NoDataState } from '../lib/report'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'
import { duration } from './Freedom'

const KIND_META: Record<SavingsKind, { label: string; icon: ReactNode }> = {
  alternative: { label: 'Smarter alternative', icon: <Lightbulb className="size-4" /> },
  subscription: { label: 'Subscription', icon: <Repeat className="size-4" /> },
  category: { label: 'Spending habit', icon: <TrendingDown className="size-4" /> },
  fees: { label: 'Fees', icon: <Receipt className="size-4" /> },
  card_rewards: { label: 'Rewards', icon: <BadgePercent className="size-4" /> },
  duplicate: { label: 'One-time', icon: <AlertTriangle className="size-4" /> }
}

function OpportunityCard({
  o,
  sooner
}: {
  o: SavingsOpportunity
  sooner: number | null
}): React.JSX.Element {
  const money = useMoney()
  const askAi = useUi((s) => s.askAi)
  const meta = KIND_META[o.kind]
  return (
    <Card className="animate-fade-up p-5">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-ink ring-1 ring-white/10">
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{meta.label}</Badge>
            <Badge tone={o.effort === 'easy' ? 'positive' : 'neutral'}>
              {o.effort === 'easy' ? 'Quick win' : 'Habit change'}
            </Badge>
            <ConfidenceBadge confidence={o.confidence} />
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight">{o.title}</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{o.detail}</p>
          <EvidencePanel evidence={o.evidence} />
        </div>
        <div className="w-[150px] shrink-0 text-right">
          <p className="num text-[20px] font-semibold tracking-tight text-positive">
            {money(o.monthlyMinor)}
          </p>
          <p className="text-[11.5px] text-ink-3">
            {o.kind === 'duplicate' ? 'one-time' : 'per month'}
          </p>
          {sooner != null && sooner > 0 && (
            <p className="mt-1 text-[11.5px] font-medium text-ink">
              Free {duration(sooner)} sooner
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 -mr-2"
            icon={<Sparkles className="size-3.5" />}
            onClick={() =>
              askAi(
                `Help me act on this: "${o.title}". ${o.detail} Give me concrete steps for this week, and any current offers or cheaper alternatives you can find.`
              )
            }
          >
            Ask AI CFO
          </Button>
        </div>
      </div>
    </Card>
  )
}

function Section({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="eyebrow text-ink-3">{title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{description}</p>
      </div>
      {children}
    </section>
  )
}

function LiveOffers(): React.JSX.Element {
  const toast = useUi((s) => s.toast)
  const go = useUi((s) => s.go)
  const { data, reload } = useQuery(() => api.listOffers())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<OffersResult | null>(null)
  const r = result ?? data

  async function search(): Promise<void> {
    setBusy(true)
    try {
      setResult(await api.findOffers())
      reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const byMerchant = new Map<string, OffersResult['offers']>()
  for (const o of r?.offers ?? [])
    byMerchant.set(o.merchant, [...(byMerchant.get(o.merchant) ?? []), o])

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Tag className="size-4" aria-hidden /> Live offers & coupons
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {r?.merchants.length
              ? `For where you actually spend: ${r.merchants.slice(0, 5).join(', ')}${r.merchants.length > 5 ? '…' : ''}`
              : 'Import a statement to see where offers would help most.'}
          </p>
        </div>
        {r?.supported && (
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            icon={<Search className="size-3.5" />}
            onClick={() => void search()}
          >
            {r.offers.length ? 'Search again' : 'Find offers now'}
          </Button>
        )}
      </div>
      <div className="p-5 pt-4">
        {!r ? (
          <Spinner />
        ) : !r.supported ? (
          <div className="rounded-xl border border-line bg-white/[0.02] p-4 text-[13px]">
            <p className="text-ink-2">{r.reason}</p>
            <Button size="sm" className="mt-3" onClick={() => go('settings')}>
              Open AI settings
            </Button>
          </div>
        ) : busy ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-ink-2">
            <Sparkles className="size-4 animate-pulse" aria-hidden /> Your AI CFO is searching the
            web for current offers… this can take a minute.
          </p>
        ) : r.offers.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-3">
            {r.foundAt
              ? 'No current offers were found for your merchants.'
              : 'Run a search to find current coupons, cashback and bank offers for your merchants.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[...byMerchant.entries()].map(([merchant, list]) => (
              <div key={merchant} className="rounded-xl border border-line p-4">
                <p className="eyebrow text-ink-3">{merchant}</p>
                <ul className="mt-2 space-y-3">
                  {list.map((o) => (
                    <li key={o.id} className="text-[13px]">
                      <p className="font-medium">{o.title}</p>
                      {o.details && <p className="mt-0.5 text-xs text-ink-2">{o.details}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {o.code && (
                          <button
                            className="rounded border border-dashed border-line-strong px-2 py-0.5 font-mono font-semibold tracking-wider hover:bg-white/5"
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(o.code!)
                                .then(() => toast(`Copied ${o.code}`))
                            }
                            title="Copy code"
                          >
                            {o.code}
                          </button>
                        )}
                        {o.validTill && (
                          <span className="text-ink-3">Valid till {o.validTill}</span>
                        )}
                        <a
                          href={o.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-ink-2 underline underline-offset-2 hover:text-ink"
                        >
                          Source <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {r?.foundAt && r.offers.length > 0 && (
          <p className="mt-3 text-[11.5px] text-ink-3">
            Found via web search on {formatDate(r.foundAt.slice(0, 10))}. Offers change often —
            check the source before relying on one. Only merchant names were searched.
          </p>
        )}
      </div>
    </Card>
  )
}

export function SavingsPage(): React.JSX.Element {
  const money = useMoney()
  const month = useUi((s) => s.month)
  const settings = useUi((s) => s.settings)
  const askAi = useUi((s) => s.askAi)
  const { data, error, loading, reload } = useQuery(
    () => (month ? api.getPotentialSavings(month) : Promise.reject(new Error('No month'))),
    [month]
  )
  const fiQuery = useQuery<FiProjection | null>(
    () => (month ? api.getFiProjection(month) : Promise.resolve(null)),
    [month]
  )
  const fi = fiQuery.data

  if (!month) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Spinner label={loading ? 'Looking for savings' : 'Loading'} />

  const sooner = new Map((fi?.levers ?? []).map((l) => [l.id, l.monthsSooner]))
  const alternatives = data.opportunities.filter((o) => o.kind === 'alternative')
  const cuts = data.opportunities.filter(
    (o) => o.kind !== 'alternative' && o.kind !== 'card_rewards' && o.kind !== 'duplicate'
  )
  const rewards = data.opportunities.filter((o) => o.kind === 'card_rewards')
  const oneTime = data.opportunities.filter((o) => o.kind === 'duplicate')

  // Time won back if every monthly saving were adopted (same maths as the Freedom page).
  let allSooner: number | null = null
  if (fi && fi.monthsToFi != null && settings) {
    const target = Math.max(0, fi.targetMonthlySpendMinor - data.totalMonthlyMinor)
    const fiNum = Math.round((target * 12) / (settings.fiWithdrawalPct / 100))
    const m = monthsToTarget(
      fi.corpusMinor,
      fi.monthlySavingsMinor + data.totalMonthlyMinor,
      fiNum,
      settings.fiReturnPct
    )
    allSooner = m == null ? null : Math.max(0, fi.monthsToFi - m)
  }

  if (data.opportunities.length === 0 && data.cards.length === 0) {
    return (
      <>
        <h1 className="mb-5 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
          Save more
        </h1>
        <NoDataState month={month} />
      </>
    )
  }

  return (
    <div className="space-y-7">
      <div className="gloss relative overflow-hidden rounded-2xl p-7 text-white">
        <p className="eyebrow text-white/70">Save more · {monthLabel(month)}</p>
        <p className="num mt-3 font-[family-name:var(--font-display)] text-[46px] leading-none font-semibold tracking-tight">
          {money(data.totalMonthlyMinor)}
          <span className="ml-1 text-[18px] font-medium text-white/70">/month</span>
        </p>
        <p className="mt-3 text-[14px] text-white/80">
          About {money(data.totalMonthlyMinor * 12)} a year
          {allSooner ? (
            <>
              {' '}
              — financial independence{' '}
              <strong className="text-white">{duration(allSooner)} sooner</strong>
            </>
          ) : null}
          . Found in your own spending; estimates, every number explained.
        </p>
        <button
          onClick={() =>
            askAi(
              'Go through my spending category by category and find every way to save: cheaper alternatives, offers, coupons, better plans. Be specific with amounts and links.'
            )
          }
          className="mt-5 flex items-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-black hover:bg-neutral-200"
        >
          <Sparkles className="size-3.5" aria-hidden /> Ask AI CFO to find more
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-7">
          {alternatives.length > 0 && (
            <Section
              title="Smarter alternatives"
              description="Same life, lower cost — cheaper ways to get what you already buy."
            >
              {alternatives.map((o) => (
                <OpportunityCard key={o.id} o={o} sooner={sooner.get(o.id) ?? null} />
              ))}
            </Section>
          )}

          <Section
            title="Live offers & coupons"
            description="Current deals at the places you spend most, found by your AI CFO."
          >
            <LiveOffers />
          </Section>

          {rewards.length > 0 && (
            <Section title="Rewards" description="Earn back more on what you already spend.">
              {rewards.map((o) => (
                <OpportunityCard key={o.id} o={o} sooner={sooner.get(o.id) ?? null} />
              ))}
            </Section>
          )}

          <Section
            title="Cut & cancel"
            description="Subscriptions, fees and habits running above your normal."
          >
            {cuts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Sparkles className="size-5" />}
                  title="Nothing to cut"
                  description="No subscriptions, fees or overspending found this month."
                />
              </Card>
            ) : (
              cuts.map((o) => (
                <OpportunityCard key={o.id} o={o} sooner={sooner.get(o.id) ?? null} />
              ))
            )}
          </Section>

          {oneTime.length > 0 && (
            <Section
              title="Worth checking"
              description="Possible double charges — ask for a refund if one was a mistake."
            >
              {oneTime.map((o) => (
                <OpportunityCard key={o.id} o={o} sooner={null} />
              ))}
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <CreditCard className="size-4" aria-hidden /> Rewards on your spending
                </span>
              }
              description="What popular cards might earn on your actual spending mix"
            />
            <ul className="mt-3 divide-y divide-line px-5">
              {data.cards.slice(0, 5).map((c) => (
                <li key={c.cardId} className="py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-7 w-11 shrink-0 items-center justify-center rounded-md bg-ink text-[10px] font-bold text-surface"
                      aria-hidden
                    >
                      {c.issuer.split(' ')[0]?.slice(0, 4).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">
                        {c.issuer} {c.name}
                      </p>
                      <p className="truncate text-[11.5px] text-ink-3">{c.bestFor.join(' · ')}</p>
                    </div>
                    <p
                      className={cn(
                        'num text-[13px] font-semibold',
                        c.netMonthlyGainMinor > 0 ? 'text-positive' : 'text-ink-3'
                      )}
                    >
                      {c.netMonthlyGainMinor > 0 ? '+' : ''}
                      {money(c.netMonthlyGainMinor)}
                    </p>
                  </div>
                </li>
              ))}
              {data.cards.length === 0 && (
                <li className="py-4 text-[13px] text-ink-3">{data.cardsNote}</li>
              )}
            </ul>
            {data.cards.length > 0 && (
              <p className="px-5 pb-4 pt-1 text-[11px] leading-relaxed text-ink-3">
                {data.cardsNote} Net vs a typical 1% card after fees. Informational only — not a
                recommendation to apply for credit.
              </p>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-[13px] font-semibold">How these are estimated</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-2">
              {[
                ...data.assumptions,
                'Alternatives assume you change part of a habit, not all of it.'
              ].map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <Disclaimer />
    </div>
  )
}
