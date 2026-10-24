import { useState } from 'react'
import { Bot, ExternalLink, Terminal } from 'lucide-react'
import { CLOUD_HELP } from './AiSetup'
import { Button, Card, CardHeader, Field, Input, Segmented } from './ui'
import { useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'

type KeyProvider = 'anthropic' | 'openai'

/**
 * Home-page nudge until the AI CFO is set up: one click when Claude Code is signed in on this Mac,
 * otherwise a Claude or OpenAI API key.
 */
export function HomeAiCard(): React.JSX.Element | null {
  const status = useQuery(() => api.getAiStatus())
  const toast = useUi((s) => s.toast)
  const setSettings = useUi((s) => s.setSettings)
  const [provider, setProvider] = useState<KeyProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!status.data || status.data.ready) return null
  const claudeCode = status.data.providers.find((p) => p.id === 'claude_code')
  const keyInfo = status.data.providers.find((p) => p.id === provider)

  async function use(input: Parameters<typeof api.configureAi>[0]): Promise<void> {
    setBusy(true)
    try {
      const s = await api.configureAi(input)
      setSettings(await api.getSettings())
      const test = s.ready ? await api.testAi() : null
      if (test?.ok) toast('Your AI CFO is ready')
      else toast(test?.message ?? 'Could not finish setup.', 'error')
      status.reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (claudeCode?.available) {
    return (
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Terminal className="size-4" aria-hidden /> Use Claude Code as your AI CFO
            </span>
          }
          description="Claude Code is signed in on this Mac, so your AI CFO can run on your Claude plan — no API key needed."
        />
        <div className="flex items-end justify-between gap-4 p-5 pt-3">
          <p className="max-w-xl text-[12.5px] leading-snug text-ink-3">
            When you chat, a <strong>summary</strong> of your finances (totals, categories, merchant
            names, goals, INDmoney portfolio) is sent to Anthropic. Raw statements and account
            numbers stay on this Mac.
          </p>
          <Button
            variant="primary"
            loading={busy}
            onClick={() =>
              void use({ provider: 'claude_code', model: 'sonnet', cloudConsent: true })
            }
          >
            Allow &amp; use Claude Code
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Bot className="size-4" aria-hidden /> Set up your AI CFO
          </span>
        }
        description="Claude Code isn't signed in on this Mac. Add a Claude or OpenAI API key instead."
        action={
          <Segmented
            label="AI provider"
            value={provider}
            onChange={(p) => {
              setProvider(p)
              setApiKey('')
            }}
            options={[
              { value: 'anthropic', label: 'Claude' },
              { value: 'openai', label: 'OpenAI' }
            ]}
          />
        }
      />
      <div className="space-y-3 p-5 pt-4">
        <Field
          label={`${keyInfo?.name ?? ''} API key`}
          hint={
            keyInfo?.hasKey
              ? 'A key is saved in your Keychain. Paste a new one to replace it.'
              : 'Stored encrypted in your macOS Keychain.'
          }
          htmlFor="home-ai-key"
        >
          <Input
            id="home-ai-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyInfo?.hasKey ? '•••••••• saved' : 'Paste your key'}
          />
        </Field>
        <label className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-accent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I understand a <strong>summary</strong> of my finances is sent to{' '}
            {CLOUD_HELP[provider]?.consent} when I chat.
          </span>
        </label>
        <div className="flex items-center justify-between gap-3">
          <a
            href={CLOUD_HELP[provider]?.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-ink hover:underline"
          >
            Get an API key <ExternalLink className="size-3" />
          </a>
          <Button
            variant="primary"
            loading={busy}
            disabled={!consent || (apiKey.trim().length <= 10 && !keyInfo?.hasKey)}
            onClick={() =>
              void use({
                provider,
                model: keyInfo?.defaultModel ?? null,
                cloudConsent: true,
                ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
              })
            }
          >
            Use this AI
          </Button>
        </div>
      </div>
    </Card>
  )
}
