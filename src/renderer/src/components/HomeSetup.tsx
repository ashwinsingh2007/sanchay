import { CheckCircle2, ChevronRight, Circle } from 'lucide-react'
import { isAnswered, PROFILE_QUESTIONS } from '@shared/domain/profile'
import { Card, CardHeader } from './ui'
import { useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

/**
 * "Get set up" checklist on Home: each step unlocks more of the CFO. Hidden once everything is
 * done. INDmoney, statements and the profile are independent — any one is useful on its own.
 */
export function HomeSetup({ hasStatements }: { hasStatements: boolean }): React.JSX.Element | null {
  const go = useUi((s) => s.go)
  const openImport = useUi((s) => s.openImport)
  const data = useQuery(() =>
    Promise.all([
      api.listDataSources(false),
      api.getAiStatus(),
      api.listProfile(),
      api.listCasImports()
    ])
  )
  if (!data.data) return null
  const [sources, ai, profile, cas] = data.data
  const byKey = new Map(profile.map((e) => [e.key, e]))
  const answered = PROFILE_QUESTIONS.filter((q) => isAnswered(byKey.get(q.key))).length
  const indmoney = sources.find((s) => s.id === 'indmoney')
  const market = sources.some((s) => s.id !== 'indmoney' && s.connected && s.enabled)

  const steps = [
    {
      done: !!indmoney?.connected || cas.length > 0,
      title: 'Add your investments',
      detail:
        'Connect INDmoney or a broker, or upload your NSDL/CDSL/CAMS CAS — every stock and fund you hold.',
      action: () => go('investments')
    },
    {
      done: hasStatements,
      title: 'Upload a bank or card statement',
      detail: 'Income, spending by category, subscriptions and where you can save.',
      action: () => openImport()
    },
    {
      done: ai.ready,
      title: 'Set up Sanchay’s AI',
      detail: 'Claude Code on this Mac, or a Claude / OpenAI key.',
      action: () => go('ai')
    },
    {
      done: answered >= 6,
      title: `Tell Sanchay about you (${answered}/${PROFILE_QUESTIONS.length})`,
      detail: 'Loans, insurance, dependents, risk appetite — skip anything, add more in chat.',
      action: () => go('profile')
    },
    {
      done: market,
      title: 'Add market research (optional)',
      detail: 'Connect Tapetide or TradingView for prices, financials, screeners and forecasts.',
      action: () => go('sources')
    }
  ]
  const left = steps.filter((s) => !s.done).length
  if (left === 0) return null

  return (
    <Card>
      <CardHeader
        title="Finish setting up Sanchay"
        description={`${steps.length - left} of ${steps.length} done — each step gives Sanchay more to work with.`}
      />
      <ul className="grid gap-1 p-3 pt-3 md:grid-cols-2">
        {steps
          .filter((s) => !s.done)
          .map((s) => (
            <li key={s.title}>
              <button
                onClick={s.action}
                disabled={s.done}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  s.done ? 'opacity-60' : 'hover:bg-ink/[0.04]'
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-ink-3" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[13.5px] font-medium', s.done && 'line-through')}>
                    {s.title}
                  </span>
                  <span className="block text-[12px] text-ink-3">{s.detail}</span>
                </span>
                {!s.done && <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-3" />}
              </button>
            </li>
          ))}
      </ul>
    </Card>
  )
}
