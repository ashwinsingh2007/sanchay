import Anthropic from '@anthropic-ai/sdk'
import type { AiProviderId } from '../../shared/types'
import { streamClaudeCode } from './claudeCode'
import { redact, type RedactTerm } from '../../shared/domain/redact'

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamArgs {
  system: string
  messages: LlmMessage[]
  model: string
  signal: AbortSignal
  onText: (text: string) => void
  apiKey?: string | null
  baseUrl?: string
  /** Let cloud models search the web (live offers, prices). Ignored by local models. */
  webSearch?: boolean
  /** Live data-source tools (Claude Code and Anthropic only; others get synced context). */
  tools?: ChatTools
  /** Extra names to hide from cloud models (e.g. the employer). Identifiers are always hidden. */
  redactTerms?: RedactTerm[]
}

export interface ChatTools {
  list: { name: string; description: string; inputSchema: Record<string, unknown> }[]
  call: (name: string, args: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>
  /** Called when the model starts using a tool, with the hub tool name. */
  onTool: (name: string) => void
  /** Local MCP endpoint serving the same tools, for Claude Code. */
  bridge: { url: string; token: string }
}

/** Providers that can call data-source tools during a chat. */
export const TOOL_PROVIDERS = new Set(['claude_code', 'anthropic'])

/** Providers that can search the web while answering. */
export const WEB_SEARCH_PROVIDERS = new Set(['claude_code', 'anthropic', 'gemini'])

export const PROVIDER_META: Record<
  Exclude<AiProviderId, 'none'>,
  { name: string; kind: 'local' | 'cloud'; defaultModel: string; suggested: string[] }
> = {
  claude_code: {
    name: 'Claude Code (on this Mac)',
    kind: 'cloud',
    defaultModel: 'sonnet',
    suggested: ['sonnet', 'opus', 'haiku']
  },
  ollama: {
    name: 'Ollama (on this Mac)',
    kind: 'local',
    defaultModel: 'gemma3:4b',
    suggested: ['gemma3:4b', 'gemma3:12b', 'llama3.2:3b', 'qwen2.5:7b']
  },
  apple: {
    name: 'Apple Intelligence',
    kind: 'local',
    defaultModel: 'apple-on-device',
    suggested: []
  },
  gemini: {
    name: 'Google Gemini',
    kind: 'cloud',
    defaultModel: 'gemini-2.5-flash',
    suggested: ['gemini-2.5-flash', 'gemini-2.5-pro']
  },
  anthropic: {
    name: 'Anthropic Claude',
    kind: 'cloud',
    defaultModel: 'claude-opus-5-5',
    suggested: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5']
  },
  openai: {
    name: 'OpenAI',
    kind: 'cloud',
    defaultModel: 'gpt-4.1-mini',
    suggested: ['gpt-4.1-mini', 'gpt-4.1']
  }
}

/** Reads a fetch body as newline-delimited chunks. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line) yield line
    }
  }
  if (buffer.trim()) yield buffer.trim()
}

async function ensureOk(res: Response, label: string): Promise<ReadableStream<Uint8Array>> {
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    let message = text.slice(0, 300)
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string }
      message = typeof j.error === 'string' ? j.error : (j.error?.message ?? message)
    } catch {
      /* keep raw text */
    }
    throw new Error(`${label} error ${res.status}: ${message || res.statusText}`)
  }
  return res.body
}

// ---------- Ollama (local) ----------

export async function ollamaModels(baseUrl: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return null
    const json = (await res.json()) as { models?: { name: string }[] }
    return (json.models ?? []).map((m) => m.name)
  } catch {
    return null
  }
}

export async function ollamaPull(
  baseUrl: string,
  model: string,
  onProgress: (p: { status: string; completed: number | null; total: number | null }) => void
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })
  for await (const line of lines(await ensureOk(res, 'Ollama'))) {
    const j = JSON.parse(line) as {
      status?: string
      completed?: number
      total?: number
      error?: string
    }
    if (j.error) throw new Error(j.error)
    onProgress({ status: j.status ?? '', completed: j.completed ?? null, total: j.total ?? null })
  }
}

async function streamOllama(a: StreamArgs): Promise<void> {
  const res = await fetch(`${a.baseUrl}/api/chat`, {
    method: 'POST',
    signal: a.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: a.model,
      stream: true,
      // Room for the financial context + payment knowledge base.
      options: { temperature: 0.3, num_ctx: 16384 },
      messages: [{ role: 'system', content: a.system }, ...a.messages]
    })
  })
  for await (const line of lines(await ensureOk(res, 'Ollama'))) {
    const j = JSON.parse(line) as { message?: { content?: string }; error?: string }
    if (j.error) throw new Error(j.error)
    if (j.message?.content) a.onText(j.message.content)
  }
}

// ---------- Google Gemini (cloud, raw REST) ----------

async function streamGemini(a: StreamArgs): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:streamGenerateContent?alt=sse`
  const res = await fetch(url, {
    method: 'POST',
    signal: a.signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': a.apiKey ?? '' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: a.system }] },
      contents: a.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      ...(a.webSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.3 }
    })
  })
  for await (const line of lines(await ensureOk(res, 'Gemini'))) {
    if (!line.startsWith('data:')) continue
    const j = JSON.parse(line.slice(5)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    for (const part of j.candidates?.[0]?.content?.parts ?? []) if (part.text) a.onText(part.text)
  }
}

// ---------- OpenAI (cloud, raw REST) ----------

async function streamOpenAI(a: StreamArgs): Promise<void> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: a.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${a.apiKey ?? ''}` },
    body: JSON.stringify({
      model: a.model,
      stream: true,
      messages: [{ role: 'system', content: a.system }, ...a.messages]
    })
  })
  for await (const line of lines(await ensureOk(res, 'OpenAI'))) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') break
    const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
    const text = j.choices?.[0]?.delta?.content
    if (text) a.onText(text)
  }
}

// ---------- Anthropic Claude (cloud, official SDK) ----------

/** Models that accept server-side refusal fallbacks ("default" routing). */
const FALLBACK_MODELS = new Set([
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-opus-5',
  'claude-fable-5-1'
])

async function streamAnthropic(a: StreamArgs): Promise<void> {
  const client = new Anthropic({ apiKey: a.apiKey ?? undefined })
  const useFallback = FALLBACK_MODELS.has(a.model)
  // Server-side web search may pause a long turn; continue it by sending the partial turn back.
  const messages: Anthropic.Beta.BetaMessageParam[] = a.messages.map((m) => ({
    role: m.role,
    content: m.content
  }))
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...(a.webSearch
      ? [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 5 }]
      : []),
    ...(a.tools?.list ?? []).map((t) => ({
      name: t.name,
      description: t.description.slice(0, 4000),
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema
    }))
  ]
  for (let round = 0; round < 16; round++) {
    const stream = client.beta.messages.stream(
      {
        model: a.model,
        max_tokens: 16000,
        system: a.system,
        messages,
        ...(tools.length ? { tools } : {}),
        ...(useFallback
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {})
      },
      { signal: a.signal }
    )
    stream.on('text', (text) => a.onText(text))
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      a.onText('\n\n_The model declined to answer this request._')
      return
    }
    if (final.stop_reason === 'tool_use' && a.tools) {
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const block of final.content) {
        if (block.type !== 'tool_use') continue
        a.tools.onTool(block.name)
        const r = await a.tools.call(block.name, (block.input ?? {}) as Record<string, unknown>)
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: r.text,
          is_error: r.isError
        })
      }
      messages.push({
        role: 'assistant',
        content: final.content as Anthropic.Beta.BetaContentBlockParam[]
      })
      messages.push({ role: 'user', content: results })
      a.onText('\n\n')
      continue
    }
    if (final.stop_reason !== 'pause_turn') return
    messages.push({
      role: 'assistant',
      content: final.content as Anthropic.Beta.BetaContentBlockParam[]
    })
  }
}

export async function streamChat(
  provider: Exclude<AiProviderId, 'none'>,
  input: StreamArgs
): Promise<void> {
  // Anything leaving the Mac has personal identifiers masked; amounts are never changed.
  const args: StreamArgs =
    PROVIDER_META[provider].kind === 'cloud'
      ? {
          ...input,
          system: redact(input.system, input.redactTerms),
          messages: input.messages.map((m) => ({
            ...m,
            content: redact(m.content, input.redactTerms)
          }))
        }
      : input
  switch (provider) {
    case 'claude_code':
      return streamClaudeCode(args)
    case 'ollama':
      return streamOllama(args)
    case 'gemini':
      return streamGemini(args)
    case 'openai':
      return streamOpenAI(args)
    case 'anthropic':
      return streamAnthropic(args)
    case 'apple':
      throw new Error('Apple Intelligence support is coming soon.')
  }
}
