import { describe, expect, it } from 'vitest'
import { suggestedProvider } from './aiDefaults'
import type { AiProviderInfo } from './types'

const p = (id: AiProviderInfo['id'], over: Partial<AiProviderInfo> = {}): AiProviderInfo => ({
  id,
  name: id,
  kind: id === 'ollama' || id === 'apple' ? 'local' : 'cloud',
  available: false,
  reason: null,
  hasKey: false,
  usesApiKey: id !== 'claude_code' && id !== 'ollama' && id !== 'apple',
  models: [],
  defaultModel: '',
  ...over
})

describe('suggestedProvider', () => {
  const none = [p('claude_code'), p('ollama'), p('apple'), p('gemini'), p('anthropic'), p('openai')]
  const swap = (id: AiProviderInfo['id'], over: Partial<AiProviderInfo>) =>
    none.map((x) => (x.id === id ? p(id, over) : x))

  it('prefers a signed-in Claude Code over everything else', () => {
    const all = swap('claude_code', { available: true }).map((x) =>
      x.id === 'ollama' ? p('ollama', { available: true, models: ['gemma3:4b'] }) : x
    )
    expect(suggestedProvider(all)).toBe('claude_code')
  })

  it('falls back to Gemini, then Ollama, then Claude API, then OpenAI', () => {
    expect(suggestedProvider(swap('gemini', { hasKey: true }))).toBe('gemini')
    expect(suggestedProvider(swap('ollama', { available: true, models: ['llama3.2:3b'] }))).toBe(
      'ollama'
    )
    expect(suggestedProvider(swap('anthropic', { hasKey: true }))).toBe('anthropic')
    expect(suggestedProvider(swap('openai', { hasKey: true }))).toBe('openai')
  })

  it('skips Ollama when it has no model, and suggests Gemini when nothing works yet', () => {
    expect(suggestedProvider(swap('ollama', { available: true }))).toBe('gemini')
    expect(suggestedProvider(none)).toBe('gemini')
  })
})
