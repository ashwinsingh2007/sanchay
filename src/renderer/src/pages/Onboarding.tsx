import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CloudOff,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp
} from 'lucide-react'
import { useState } from 'react'
import { Button, Disclaimer } from '../components/ui'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'
import { CsvDropzone } from './ImportWizard'
import { AiSetup } from '../components/AiSetup'
import { Logo } from '../components/Logo'

const PROMISES = [
  {
    icon: <Building2 className="size-4" />,
    title: 'No bank login, ever',
    body: 'Export a CSV from your bank. We never ask for credentials.'
  },
  {
    icon: <CloudOff className="size-4" />,
    title: 'Zero data sharing',
    body: 'Everything stays on this Mac. Nothing is uploaded, ever.'
  },
  {
    icon: <BadgeCheck className="size-4" />,
    title: 'Every number explained',
    body: 'Each insight links to the exact transactions behind it.'
  }
]

function Brand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className="size-8 shrink-0" />
      <span className="text-[15px] font-semibold tracking-tight">Sanchay</span>
    </div>
  )
}

function Steps({ step }: { step: number }): React.JSX.Element {
  return (
    <ol className="flex items-center gap-2" aria-label={`Step ${step + 1} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i === step ? 'w-8 bg-accent' : i < step ? 'w-4 bg-accent/40' : 'w-4 bg-line-strong'
          )}
        />
      ))}
    </ol>
  )
}

/** Illustrative preview of what the app produces. Clearly labelled as an example. */
function PreviewPanel(): React.JSX.Element {
  return (
    <div className="relative hidden h-full flex-col justify-center overflow-hidden gloss px-12 text-white lg:flex">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-white/[0.04]" />
      <div className="relative mx-auto w-full max-w-[380px]">
        <p className="mb-3 text-xs font-medium eyebrow text-white/70">Example monthly close</p>
        <div className="rounded-2xl bg-surface p-5 text-ink shadow-2xl ring-1 ring-white/10">
          <p className="text-[13px] text-ink-2">Your September close</p>
          <p className="mt-1 text-[22px] font-semibold tracking-tight">You saved ₹63,629</p>
          <p className="text-xs text-ink-3">Saving rate 34% · ₹15,000 moved to investments</p>
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px]">
            {[
              ['Dining & Delivery', '+₹4,790'],
              ['One-off: Health insurance', '+₹18,500'],
              ['Shopping', '+₹3,850']
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-ink-2">{label}</span>
                <span className="num font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/12 p-4 ring-1 ring-white/20">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-black">
            <TrendingUp className="size-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold">Safe to spend: ₹20,972/day</p>
            <p className="text-xs text-white/75">until your next salary, after bills and buffer</p>
          </div>
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-white/75">
          <Lock className="size-3" aria-hidden /> Calculated on your Mac. Never uploaded.
        </p>
      </div>
    </div>
  )
}

const GOAL_TEMPLATES = [
  'Become financially independent by 45 — work becomes optional.',
  'Retire early and live off my investments.',
  'Build an emergency fund covering 6 months of expenses within a year.',
  'Save ₹10 lakh for a home down payment in 3 years.',
  'Cut food delivery spending in half.',
  'Save 30% of my salary every month.',
  'Pay off my car loan early.',
  'Plan a ₹2 lakh holiday next summer without touching savings.',
  'Stop running out of money before payday.'
]

export function Onboarding(): React.JSX.Element {
  const { openImport, go, setMonth, toast, bump, settings, setSettings } = useUi()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [goal, setGoal] = useState(settings?.goalText ?? '')

  async function saveGoal(skip: boolean): Promise<void> {
    try {
      setSettings(await api.updateSettings({ goalText: skip ? null : goal.trim() || null }))
      setStep(3)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  async function loadSample(): Promise<void> {
    setBusy(true)
    try {
      await api.loadSampleData()
      await api.updateSettings({ onboardingComplete: true })
      const { defaultMonth } = await api.listMonths()
      setMonth(defaultMonth)
      go('home')
      bump()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-app grid h-full grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      <div className="drag flex h-full flex-col overflow-y-auto px-10 pb-8 pt-12 xl:px-16">
        <div className="no-drag flex items-center justify-between">
          <Brand />
          <Steps step={step} />
        </div>

        <div
          className={cn(
            'no-drag my-auto w-full py-8',
            step === 1 ? 'max-w-[600px]' : 'max-w-[520px]'
          )}
        >
          {step === 1 ? (
            <div className="animate-fade-up">
              <p className="text-[13px] font-semibold eyebrow text-accent-ink">
                Step 2 · Intelligence
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
                Set up your AI CFO
              </h1>
              <p className="mt-2 text-[15px] text-ink-2">
                Choose where your AI runs. We recommend Google’s Gemma model running privately on
                this Mac through Ollama.
              </p>
              <div className="mt-5">
                <AiSetup compact onReady={() => setStep(2)} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  icon={<ArrowLeft className="size-3.5" />}
                  onClick={() => setStep(0)}
                >
                  Back
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  Skip for now
                </Button>
              </div>
            </div>
          ) : step === 2 ? (
            <div className="animate-fade-up">
              <p className="text-[13px] font-semibold eyebrow text-accent-ink">
                Step 3 · Your goals
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
                Tell your AI CFO what matters
              </h1>
              <p className="mt-2 text-[15px] text-ink-2">
                In your own words. Your CFO uses this to prioritise advice. Stays on this Mac unless
                you chose a cloud AI.
              </p>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={5}
                maxLength={4000}
                aria-label="Your financial goals"
                placeholder="e.g. I want to build a 6-month emergency fund and stop overspending on food delivery."
                className="material mt-5 w-full resize-none rounded-xl px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent/30"
              />
              <p className="mt-3 text-[12px] font-medium text-ink-3">Or start from a template</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {GOAL_TEMPLATES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setGoal((g) => (g.trim() ? `${g.trim()}\n${t}` : t))}
                    className="rounded-full border border-line-strong/70 bg-surface/60 px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent-ink"
                  >
                    + {t}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  icon={<ArrowLeft className="size-3.5" />}
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => void saveGoal(true)}>
                    Skip
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!goal.trim()}
                    icon={<ArrowRight className="size-4" />}
                    onClick={() => void saveGoal(false)}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          ) : step === 0 ? (
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent-ink">
                <ShieldCheck className="size-3.5" aria-hidden /> Private spending insights. Kept
                private.
              </p>
              <h1 className="mt-5 font-[family-name:var(--font-display)] text-[42px] leading-[1.08] font-semibold tracking-tight">
                Meet your private
                <br />
                <span className="text-accent-ink">Sanchay.</span>
              </h1>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
                Import your statements, understand your spending, and get a clear plan—without
                connecting your bank account.
              </p>
              <ul className="mt-8 grid gap-2.5">
                {PROMISES.map((p) => (
                  <li key={p.title} className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                      {p.icon}
                    </span>
                    <span className="text-[14px]">
                      <span className="font-semibold">{p.title}</span>
                      <span className="text-ink-2"> — {p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex items-center gap-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setStep(1)}
                  icon={<ArrowRight className="size-4" />}
                >
                  Get started
                </Button>
                <span className="text-xs text-ink-3">Takes under two minutes</span>
              </div>
            </div>
          ) : (
            <div className="animate-fade-up">
              <p className="text-[13px] font-semibold eyebrow text-accent-ink">
                Step 4 · Your data
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
                Upload your bank statement
              </h1>
              <p className="mt-2 text-[15px] text-ink-2">
                Start with your main bank account. You can add credit cards later.
              </p>
              <div className="mt-6">
                <CsvDropzone onParsed={(csv) => openImport(csv)} compact />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">No statement handy?</p>
                  <p className="text-xs text-ink-3">
                    Explore with six months of sample data. Delete it anytime.
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={<Sparkles className="size-3.5" />}
                  onClick={() => void loadSample()}
                  loading={busy}
                >
                  Use sample data
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-5 -ml-3"
                icon={<ArrowLeft className="size-3.5" />}
                onClick={() => setStep(2)}
              >
                Back
              </Button>
            </div>
          )}
        </div>

        <Disclaimer className="no-drag max-w-[520px]" />
      </div>
      <PreviewPanel />
    </div>
  )
}
