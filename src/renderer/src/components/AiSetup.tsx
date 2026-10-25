import {
  Apple,
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  ExternalLink,
  KeyRound,
  Terminal,
  Loader2,
  Lock,
  Sparkles
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AI_PROVIDER_ORDER, preferredOllamaModel, suggestedProvider } from '@shared/aiDefaults'
import type { AiProviderId, AiProviderInfo, AiStatus } from '@shared/types'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'
import { Badge, Button, Field, Input, Select } from './ui'

const RECOMMENDED_OLLAMA = 'gemma3:4b'

const OLLAMA_MODELS: { id: string; label: string; size: string; note: string }[] = [
  {
    id: 'gemma3:4b',
    label: 'Google Gemma 3 · 4B',
    size: '3.3 GB',
    note: 'Recommended — fast and smart on most Macs'
  },
  {
    id: 'gemma3:12b',
    label: 'Google Gemma 3 · 12B',
    size: '8.1 GB',
    note: 'Sharper answers, needs 16 GB+ RAM'
  },
  { id: 'llama3.2:3b', label: 'Meta Llama 3.2 · 3B', size: '2.0 GB', note: 'Lightweight' },
  { id: 'qwen2.5:7b', label: 'Qwen 2.5 · 7B', size: '4.7 GB', note: 'Strong with numbers' }
]

const ICONS: Record<string, React.ReactNode> = {
  claude_code: <Terminal className="size-4" />,
  ollama: <Cpu className="size-4" />,
  apple: <Apple className="size-4" />,
  gemini: <Sparkles className="size-4" />,
  anthropic: <Sparkles className="size-4" />,
  openai: <Sparkles className="size-4" />
}

export const CLOUD_HELP: Record<string, { url: string; consent: string }> = {
  claude_code: {
    url: 'https://docs.claude.com/en/docs/claude-code/setup',
    consent: 'Anthropic through your Claude Code sign-in'
  },
  gemini: { url: 'https://aistudio.google.com/apikey', consent: 'Google' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys', consent: 'Anthropic' },
  openai: { url: 'https://platform.openai.com/api-keys', consent: 'OpenAI' }
}

/** Where to get each provider, in plain steps. Shown above the key field. */
const GUIDE: Record<string, { steps: string[]; link: string; label: string; note?: string }> = {
  claude_code: {
    steps: [
      'Install Claude Code on this Mac.',
      'Run `claude auth login` in Terminal and sign in with your Claude account.',
      'Come back here and press Check again.'
    ],
    link: 'https://docs.claude.com/en/docs/claude-code/setup',
    label: 'Claude Code setup guide',
    note: 'Uses your Claude Pro or Max plan, so there is no API key to manage.'
  },
  gemini: {
    steps: [
      'Open Google AI Studio and sign in with your Google account.',
      'Click Create API key.',
      'Copy the key and paste it below.'
    ],
    link: 'https://aistudio.google.com/apikey',
    label: 'Open Google AI Studio',
    note: 'Gemini has a free tier, which is enough for everyday use.'
  },
  anthropic: {
    steps: [
      'Sign in to the Claude Console.',
      'Add credits under Billing.',
      'Go to API keys, create a key and paste it below.'
    ],
    link: 'https://console.anthropic.com/settings/keys',
    label: 'Open the Claude Console',
    note: 'API usage is billed separately from a Claude Pro or Max plan. With a plan, Claude Code is simpler.'
  },
  openai: {
    steps: [
      'Sign in to the OpenAI platform.',
      'Add a payment method under Billing.',
      'Go to API keys, create a secret key and paste it below.'
    ],
    link: 'https://platform.openai.com/api-keys',
    label: 'Open the OpenAI platform',
    note: 'API usage is billed separately from ChatGPT Plus.'
  }
}

export function Guide({ id }: { id: string }): React.JSX.Element | null {
  const g = GUIDE[id]
  if (!g) return null
  return (
    <div className="space-y-2 text-[13px]">
      <p className="font-semibold">How to get it</p>
      <ol className="list-decimal space-y-1 pl-4 text-ink-2">
        {g.steps.map((step) => (
          <li key={step}>
            {step
              .split(/(`[^`]+`)/)
              .map((part, i) =>
                part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part
              )}
          </li>
        ))}
      </ol>
      {g.note && <p className="text-[12px] text-ink-3">{g.note}</p>}
      <a
        href={g.link}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-ink hover:underline"
      >
        {g.label} <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

function installed(info: AiProviderInfo | undefined, model: string): boolean {
  return !!info?.models.some(
    (m) => m === model || m === `${model}:latest` || m.startsWith(`${model}`)
  )
}

/**
 * Lets the user pick where their AI CFO runs, in recommended order with a short guide for each.
 * Cloud options need explicit consent because a spending summary leaves the Mac.
 */
export function AiSetup({
  onReady,
  compact = false
}: {
  onReady?: (status: AiStatus) => void
  compact?: boolean
}): React.JSX.Element {
  const toast = useUi((s) => s.toast)
  const setSettings = useUi((s) => s.setSettings)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [choice, setChoice] = useState<Exclude<AiProviderId, 'none'>>('ollama')
  const [model, setModel] = useState<string>(RECOMMENDED_OLLAMA)
  const [apiKey, setApiKey] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pull, setPull] = useState<{ status: string; pct: number | null } | null>(null)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)

  async function refresh(): Promise<AiStatus> {
    const s = await api.getAiStatus()
    setStatus(s)
    return s
  }

  useEffect(() => {
    void refresh().then((s) => {
      if (s.provider !== 'none') {
        setChoice(s.provider)
        if (s.model) setModel(s.model)
      } else {
        // Nothing chosen yet: suggest the best option in the recommended order.
        const id = suggestedProvider(s.providers)
        const p = s.providers.find((x) => x.id === id)
        setChoice(id)
        if (id === 'ollama' && p)
          setModel(
            installed(p, RECOMMENDED_OLLAMA)
              ? RECOMMENDED_OLLAMA
              : (preferredOllamaModel(p.models) ?? RECOMMENDED_OLLAMA)
          )
        else if (p) setModel(p.defaultModel)
      }
    })
    return window.cfoEvents.onAi((e) => {
      if (e.type === 'pull') {
        setPull({
          status: e.status,
          pct: e.total ? Math.round(((e.completed ?? 0) / e.total) * 100) : null
        })
      }
    })
  }, [])

  const info = status?.providers.find((p) => p.id === choice)
  const isCloud = info?.kind === 'cloud'

  function pick(id: Exclude<AiProviderId, 'none'>): void {
    const p = status?.providers.find((x) => x.id === id)
    if (!p || id === 'apple') return
    setChoice(id)
    setTest(null)
    setApiKey('')
    setModel(
      id === 'ollama'
        ? status?.provider === 'ollama' && status.model
          ? status.model
          : RECOMMENDED_OLLAMA
        : p.defaultModel
    )
    setConsent(false)
  }

  async function finish(s: AiStatus): Promise<void> {
    setSettings(await api.getSettings())
    if (s.ready) {
      const t = await api.testAi()
      setTest(t)
      if (t.ok) {
        toast('Your AI CFO is ready')
        onReady?.(s)
      }
    }
  }

  async function save(): Promise<void> {
    setBusy(true)
    setTest(null)
    try {
      if (choice === 'ollama' && !installed(info, model)) {
        setPull({ status: 'Starting download…', pct: null })
        const s = await api.pullOllamaModel(model)
        setPull(null)
        setStatus(s)
        await finish(s)
        return
      }
      const s = await api.configureAi({
        provider: choice,
        model,
        ...(isCloud
          ? { cloudConsent: consent, ...(apiKey && info?.usesApiKey ? { apiKey } : {}) }
          : {})
      })
      setStatus(s)
      await finish(s)
      if (!s.ready)
        toast(
          isCloud
            ? 'Add your API key and allow sharing to finish setup.'
            : 'Model not available yet.',
          'error'
        )
    } catch (e) {
      setPull(null)
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-ink-3">
        <Loader2 className="size-4 animate-spin" /> Checking what’s available on this Mac…
      </div>
    )
  }

  const ordered = AI_PROVIDER_ORDER
  const canSave =
    choice === 'ollama'
      ? !!info?.available
      : choice === 'claude_code'
        ? !!info?.available && consent
        : isCloud
          ? consent && (apiKey.trim().length > 10 || !!info?.hasKey)
          : false

  return (
    <div className={cn('grid gap-4', !compact && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
      <div role="radiogroup" aria-label="AI engine" className="space-y-2">
        {ordered.map((id) => {
          const p = status.providers.find((x) => x.id === id)!
          const selected = choice === id
          const disabled = id === 'apple'
          return (
            <button
              key={id}
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => pick(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all',
                selected
                  ? 'border-accent bg-accent-soft/50 shadow-[3px_3px_0_0_var(--color-accent-deep)]'
                  : 'border-line-strong/70 bg-surface/60 hover:border-accent/50',
                disabled && 'cursor-not-allowed opacity-55 hover:border-line-strong/70'
              )}
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-md',
                  p.kind === 'local'
                    ? 'bg-positive-soft text-positive'
                    : 'bg-accent-soft text-accent-ink'
                )}
              >
                {ICONS[id]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold">
                  {p.name}
                  {id === 'claude_code' && p.available && <Badge tone="positive">Signed in</Badge>}
                  {id === 'ollama' && <Badge tone="positive">Most private · Google Gemma</Badge>}
                  {id === 'apple' && <Badge tone="outline">Coming soon</Badge>}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-3">
                  {id === 'claude_code' ? (
                    <>
                      <Cloud className="size-3" /> Your Claude plan · no API key · sends a spending
                      summary
                    </>
                  ) : p.kind === 'local' ? (
                    <>
                      <Lock className="size-3" /> Runs on this Mac · nothing leaves your device
                    </>
                  ) : (
                    <>
                      <Cloud className="size-3" /> Cloud · sends a spending summary · your API key
                    </>
                  )}
                </span>
              </span>
              {id === 'ollama' && (
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    p.available ? 'text-positive' : 'text-attention'
                  )}
                >
                  {p.available ? '● Running' : '● Not running'}
                </span>
              )}
              {p.kind === 'cloud' && p.hasKey && (
                <KeyRound className="size-3.5 text-positive" aria-label="API key saved" />
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-line-strong/60 bg-surface/60 p-4">
        {choice === 'ollama' && info && (
          <div className="space-y-3">
            {!info.available ? (
              <div className="space-y-2 text-[13px]">
                <p className="font-semibold">Install Ollama to run AI privately</p>
                <ol className="list-decimal space-y-1 pl-4 text-ink-2">
                  <li>Download Ollama (free) and open it.</li>
                  <li>Come back here — we’ll download Google’s Gemma model for you.</li>
                </ol>
                <div className="flex gap-2 pt-1">
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:opacity-90"
                  >
                    Get Ollama <ExternalLink className="size-3.5" />
                  </a>
                  <Button size="sm" onClick={() => void refresh()}>
                    I’ve opened it
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[13px] font-semibold">Choose a model</p>
                <div className="space-y-1.5">
                  {[
                    ...OLLAMA_MODELS,
                    ...info.models
                      .filter((m) => !OLLAMA_MODELS.some((x) => m.startsWith(x.id)))
                      .map((m) => ({ id: m, label: m, size: '', note: 'Installed' }))
                  ].map((m) => {
                    const have = installed(info, m.id)
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] hover:bg-ink/[0.03]',
                          model === m.id && 'bg-accent-soft/50'
                        )}
                      >
                        <input
                          type="radio"
                          name="ollama-model"
                          className="accent-accent"
                          checked={model === m.id}
                          onChange={() => setModel(m.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{m.label}</span>
                          <span className="block text-[11.5px] text-ink-3">{m.note}</span>
                        </span>
                        {have ? (
                          <span className="flex items-center gap-1 text-[11.5px] font-medium text-positive">
                            <CheckCircle2 className="size-3.5" /> Installed
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-ink-3">{m.size}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
                {pull && (
                  <div className="space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                      <div
                        className="gloss h-full rounded-full transition-[width]"
                        style={{ width: `${pull.pct ?? 5}%` }}
                      />
                    </div>
                    <p className="text-[11.5px] text-ink-3">
                      {pull.status}
                      {pull.pct != null && ` · ${pull.pct}%`}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {choice === 'claude_code' && info && !info.available && (
          <div className="space-y-2 text-[13px]">
            <Guide id="claude_code" />
            <p className="text-[12px] text-ink-3">{info.reason}</p>
            <div className="flex gap-2 pt-1">
              <a
                href={CLOUD_HELP.claude_code!.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:opacity-90"
              >
                Get Claude Code <ExternalLink className="size-3.5" />
              </a>
              <Button size="sm" onClick={() => void refresh()}>
                Check again
              </Button>
            </div>
          </div>
        )}

        {isCloud && info && (info.usesApiKey || info.available) && (
          <div className="space-y-3">
            {info.usesApiKey && (
              <>
                {!info.hasKey && <Guide id={choice} />}
                <Field
                  label={`${info.name} API key`}
                  hint={
                    info.hasKey
                      ? 'A key is saved in your Keychain. Paste a new one to replace it.'
                      : 'Stored encrypted in your macOS Keychain. Never shown again.'
                  }
                  htmlFor="ai-key"
                >
                  <Input
                    id="ai-key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={info.hasKey ? '•••••••• saved' : 'Paste your key'}
                  />
                </Field>
              </>
            )}
            <Field label="Model" htmlFor="ai-model">
              <Select id="ai-model" value={model} onChange={(e) => setModel(e.target.value)}>
                {[...new Set([model, ...info.models])].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-start gap-2 rounded-xl bg-attention-soft/60 p-3 text-[12.5px] leading-snug text-ink">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-accent"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I understand a <strong>summary</strong> of my finances (totals, categories, merchant
                names, my goals) is sent to {CLOUD_HELP[choice]?.consent} when I chat. Raw
                statements and account numbers stay on this Mac.
              </span>
            </label>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <p
            className={cn(
              'min-w-0 truncate text-[12px]',
              test ? (test.ok ? 'text-positive' : 'text-negative') : 'text-ink-3'
            )}
            title={test?.message}
          >
            {test
              ? test.ok
                ? `✓ Connected: ${test.message}`
                : test.message
              : status.ready && status.provider === choice
                ? `In use: ${status.model}`
                : ''}
          </p>
          <Button
            variant="primary"
            loading={busy}
            disabled={!canSave}
            icon={
              choice === 'ollama' && info?.available && !installed(info, model) ? (
                <Download className="size-4" />
              ) : undefined
            }
            onClick={() => void save()}
          >
            {choice === 'ollama' && info?.available && !installed(info, model)
              ? 'Download & use'
              : 'Use this AI'}
          </Button>
        </div>
      </div>
    </div>
  )
}
