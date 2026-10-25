import { useState } from 'react'
import { Bot, Cpu, Terminal } from 'lucide-react'
import { preferredOllamaModel, suggestedProvider } from '@shared/aiDefaults'
import { CLOUD_HELP, Guide } from './AiSetup'
import { Button, Card, CardHeader, Field, Input, Segmented } from './ui'
import { useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'

type KeyProvider = 'gemini' | 'anthropic' | 'openai'
const KEY_PROVIDERS: readonly string[] = ['gemini', 'anthropic', 'openai']

/**
 * Home-page nudge until the AI CFO is set up, in the recommended order: one click when Claude Code
 * is signed in on this Mac, one click for Ollama when it has a model, otherwise an API key
 * (Gemini first, as it has a free tier).
 */
export function HomeAiCard(): React.JSX.Element | null {
  const status = useQuery(() => api.getAiStatus())
  const toast = useUi((s) => s.toast)
  const setSettings = useUi((s) => s.setSettings)
  const [picked, setPicked] = useState<KeyProvider | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!status.data || status.data.ready) return null
  const claudeCode = status.data.providers.find((p) => p.id === 'claude_code')
  const suggested = suggestedProvider(status.data.providers)
  const ollama = status.data.providers.find((p) => p.id === 'ollama')
  const provider: KeyProvider =
    picked ?? (KEY_PROVIDERS.includes(suggested) ? (suggested as KeyProvider) : 'gemini')
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

  if (suggested === 'ollama' && ollama) {
    const model = preferredOllamaModel(ollama.models)
    return (
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Cpu className="size-4" aria-hidden /> Use Ollama as your AI CFO
            </span>
          }
          description={`Ollama is running on this Mac with ${model}. Everything stays on your Mac.`}
        />
        <div className="flex justify-end p-5 pt-3">
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void use({ provider: 'ollama', model })}
          >
            Use Ollama
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
        description="Claude Code isn't signed in on this Mac. Gemini has a free API key, or run a model privately with Ollama from Settings."
        action={
          <Segmented
            label="AI provider"
            value={provider}
            onChange={(p) => {
              setPicked(p)
              setApiKey('')
            }}
            options={[
              { value: 'gemini', label: 'Gemini' },
              { value: 'anthropic', label: 'Claude' },
              { value: 'openai', label: 'OpenAI' }
            ]}
          />
        }
      />
      <div className="space-y-3 p-5 pt-4">
        {!keyInfo?.hasKey && <Guide id={provider} />}
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
        <div className="flex items-center justify-end gap-3">
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
