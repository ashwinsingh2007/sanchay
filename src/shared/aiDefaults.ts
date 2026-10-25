import type { AiProviderInfo } from './types'

type ProviderId = AiProviderInfo['id']

/** Recommended order. Apple Intelligence stays last until it ships. */
export const AI_PROVIDER_ORDER: readonly ProviderId[] = [
  'claude_code',
  'gemini',
  'ollama',
  'anthropic',
  'openai',
  'apple'
]

/** Ready to use without any setup step: signed in, running with a model, or a key saved. */
export function usableNow(p: AiProviderInfo): boolean {
  if (p.id === 'apple') return false
  if (p.id === 'claude_code') return p.available
  if (p.id === 'ollama') return p.available && p.models.length > 0
  return p.hasKey
}

/**
 * The provider to suggest: the first one in the recommended order that works right now. When
 * nothing does, Gemini, because its free key is the quickest to get.
 */
export function suggestedProvider(providers: readonly AiProviderInfo[]): ProviderId {
  for (const id of AI_PROVIDER_ORDER) {
    const p = providers.find((x) => x.id === id)
    if (p && usableNow(p)) return id
  }
  return 'gemini'
}

/** Gemma if it's installed, else whatever model Ollama already has. */
export function preferredOllamaModel(models: readonly string[]): string | null {
  return models.find((m) => m.startsWith('gemma3')) ?? models[0] ?? null
}
