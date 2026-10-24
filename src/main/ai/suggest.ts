import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { formatMoney } from '../../shared/money'
import { aiSuggestionCandidates, type AiSuggestion } from '../../shared/domain/moneyFlow'
import type { MoneyFlow } from '../../shared/types'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { getSettings, listCategories } from '../repository'
import { streamChat } from './providers'
import { getAiStatus, resolveProvider } from './service'

const KIND = 'alt'
const KINDS = new Set<AiSuggestion['kind']>(['free', 'cheaper', 'habit', 'avoid'])

const SYSTEM = `You help an Indian household spend less on things they already buy. For each merchant,
suggest ONE practical free alternative, cheaper service/plan, or buying habit that gets the same thing
for less. Use well-known, real options only (apps, plans, stores, free tiers). Never invent coupon codes
or prices, never suggest loans, credit or investments. If there is no sensible cheaper option (e.g. a
doctor, a school fee, a person), answer "none".

Reply with ONLY a JSON array, no prose:
[{"i": <line number>, "kind": "free" | "cheaper" | "habit" | "none",
  "title": "<max 8 words>", "detail": "<one sentence, max 30 words>",
  "alternatives": ["<name>", ...up to 3], "savingPct": <0.05–1, typical share of the spend saved>}]`

/** Cached AI suggestions per merchant key. A null value means "asked, nothing useful". */
export function loadAiSuggestions(db: Db): Map<string, AiSuggestion | null> {
  const rows = db.select().from(s.aiNotes).where(eq(s.aiNotes.kind, KIND)).all()
  const map = new Map<string, AiSuggestion | null>()
  for (const r of rows) {
    try {
      map.set(r.contextHash, JSON.parse(r.content) as AiSuggestion | null)
    } catch {
      map.set(r.contextHash, null)
    }
  }
  return map
}

let running: Promise<number> | null = null

/**
 * Asks the user's AI CFO for free/cheaper alternatives for their biggest merchants that the
 * built-in catalogue doesn't cover. Only merchant names, categories and rounded monthly amounts are
 * sent. Returns how many new suggestions were found.
 */
export function suggestAlternatives(db: Db, flow: MoneyFlow): Promise<number> {
  running ??= run(db, flow).finally(() => (running = null))
  return running
}

async function run(db: Db, flow: MoneyFlow): Promise<number> {
  const status = await getAiStatus(db)
  if (!status.ready) return 0
  let provider: ReturnType<typeof resolveProvider>
  try {
    provider = resolveProvider(db)
  } catch {
    return 0
  }
  const asked = new Set(loadAiSuggestions(db).keys())
  const todo = aiSuggestionCandidates(flow, asked, 15)
  if (todo.length === 0) return 0

  const currency = getSettings(db).primaryCurrency
  const names = new Map(listCategories(db).map((c) => [c.id, c.name]))
  const round = (m: number): number => Math.max(100, Math.round(m / 10_000) * 10_000)
  const lines = todo
    .map(
      (m, i) =>
        `${i + 1}. ${m.merchant} — ${names.get(m.categoryId) ?? m.categoryId}, about ${formatMoney(round(m.monthlyMinor), currency)}/month`
    )
    .join('\n')

  let text = ''
  try {
    await streamChat(provider.provider, {
      system: SYSTEM,
      messages: [{ role: 'user', content: `Merchants:\n${lines}` }],
      model: provider.model,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      signal: AbortSignal.timeout(120_000),
      onText: (t) => (text += t)
    })
  } catch {
    return 0
  }

  const answers = parse(text)
  const createdAt = new Date().toISOString()
  let found = 0
  db.transaction((tx) => {
    todo.forEach((m, i) => {
      const a = answers.get(i + 1)
      // No answer at all (model cut off) → ask again next time.
      if (a === undefined) return
      if (a) found++
      tx.delete(s.aiNotes).where(eq(s.aiNotes.contextHash, m.key)).run()
      tx.insert(s.aiNotes)
        .values({
          id: randomUUID(),
          kind: KIND,
          content: JSON.stringify(a),
          contextHash: m.key,
          provider: status.provider,
          model: status.model,
          createdAt
        })
        .run()
    })
  })
  return found
}

function parse(text: string): Map<number, AiSuggestion | null> {
  const out = new Map<number, AiSuggestion | null>()
  const json = /\[[\s\S]*\]/.exec(text)?.[0]
  if (!json) return out
  let arr: unknown
  try {
    arr = JSON.parse(json)
  } catch {
    return out
  }
  if (!Array.isArray(arr)) return out
  const str = (v: unknown, max: number): string =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const i = Number(o['i'])
    if (!Number.isInteger(i)) continue
    const kind = str(o['kind'], 10) as AiSuggestion['kind']
    const title = str(o['title'], 80)
    const detail = str(o['detail'], 240)
    const pct = Number(o['savingPct'])
    if (!KINDS.has(kind) || !title || !detail || !(pct > 0)) {
      out.set(i, null)
      continue
    }
    const alternatives = Array.isArray(o['alternatives'])
      ? o['alternatives']
          .map((a) => str(a, 40))
          .filter(Boolean)
          .slice(0, 3)
      : []
    out.set(i, { kind, title, detail, alternatives, savingPct: Math.min(1, Math.max(0.05, pct)) })
  }
  return out
}
