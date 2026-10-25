import { createHash, randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { formatDate } from '../../shared/dates'
import { formatMoney } from '../../shared/money'
import type { Briefing, FiProjection } from '../../shared/types'
import { getFiProjection, getMonths } from '../analysis'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { getSettings } from '../repository'
import { streamChat } from './providers'
import { getAiStatus, resolveProvider } from './service'

const STALE_MS = 7 * 24 * 60 * 60 * 1000

function months(n: number | null): string {
  if (n == null) return '—'
  if (n < 12) return `${n} month${n === 1 ? '' : 's'}`
  const y = Math.floor(n / 12)
  const m = n % 12
  return `${y} yr${y === 1 ? '' : 's'}${m ? ` ${m} mo` : ''}`
}

/** Rule-based briefing used when no AI is set up (or it fails). */
function fallback(fi: FiProjection): string {
  const fmt = (m: number): string => formatMoney(m, fi.currency)
  const moves = fi.levers
    .slice(0, 3)
    .map(
      (l) =>
        `- **${l.label}** — about ${fmt(l.monthlyMinor)}/month${l.monthsSooner ? `, financial independence ~${months(l.monthsSooner)} sooner` : ''} (estimate).`
    )
  const head =
    fi.monthsToFi != null
      ? `At your current pace you reach financial independence in about **${months(fi.monthsToFi)}** (${fi.fiDate ? formatDate(fi.fiDate) : ''}, estimate).`
      : 'You aren’t saving yet at your current pace, so financial independence isn’t in sight. These moves change that:'
  return [head, '', 'This week’s money moves:', ...moves].join('\n')
}

/**
 * The AI CFO's weekly "money moves" briefing, regenerated when the underlying numbers change or
 * after a week. Falls back to a rule-based briefing without AI.
 */
export async function getBriefing(db: Db, refresh = false): Promise<Briefing | null> {
  const { months: list } = getMonths(db)
  if (list.length === 0) return null
  const fi = getFiProjection(db)
  const status = await getAiStatus(db)
  const settings = getSettings(db)
  const hash = createHash('sha256')
    .update(
      JSON.stringify([
        fi.avgMonthlySpendMinor,
        fi.avgMonthlyIncomeMinor,
        fi.fiNumberMinor,
        fi.levers.map((l) => l.id),
        status.provider,
        status.model,
        settings.goalText
      ])
    )
    .digest('hex')

  const cached = db
    .select()
    .from(s.aiNotes)
    .where(eq(s.aiNotes.kind, 'briefing'))
    .orderBy(desc(s.aiNotes.createdAt))
    .get()
  if (
    !refresh &&
    cached &&
    cached.contextHash === hash &&
    Date.now() - Date.parse(cached.createdAt) < STALE_MS
  ) {
    return {
      content: cached.content,
      createdAt: cached.createdAt,
      provider: cached.provider,
      model: cached.model,
      byAi: !!cached.provider
    }
  }

  if (!status.ready) {
    return {
      content: fallback(fi),
      createdAt: new Date().toISOString(),
      provider: null,
      model: null,
      byAi: false
    }
  }

  // The model only phrases the briefing; every number comes from our own calculations so a small
  // local model can't invent figures.
  const fmt = (m: number): string => formatMoney(m, fi.currency)
  const facts = [
    `Headline: ${fi.monthsToFi != null ? `about ${months(fi.monthsToFi)} to financial independence (around ${fi.fiDate ? formatDate(fi.fiDate) : ''}, estimate)` : 'not on track for financial independence yet — they are not saving each month'}. Saving rate ${fi.savingRate ?? 0}%.`,
    'Moves (use exactly these, in this order, with exactly these numbers):',
    ...fi.levers
      .slice(0, 3)
      .map(
        (l, i) =>
          `${i + 1}. ${l.label} — saves ${fmt(l.monthlyMinor)}/month${l.monthsSooner ? `, financial independence ${months(l.monthsSooner)} sooner` : ''}.`
      )
  ].join('\n')
  let text = ''
  try {
    const { provider, model, apiKey, baseUrl } = resolveProvider(db)
    await streamChat(provider, {
      system:
        'You are a warm, concise money coach. Rewrite the facts you are given as a short weekly briefing. Use ONLY the numbers in the facts; never add, change or estimate any number, never suggest anything not listed, and never claim they are on track for a goal or age the facts do not mention.',
      messages: [
        {
          role: 'user',
          content: `${facts}\n${settings.goalText ? `Their goal: ${settings.goalText}\n` : ''}\nFormat: one sentence with the headline. Then the 3 moves as bullets "- **<short title>** — <one sentence with its numbers>". Then one short encouraging line tied to their goal. Under 110 words. No headings.`
        }
      ],
      model,
      apiKey,
      baseUrl,
      signal: AbortSignal.timeout(90_000),
      onText: (t) => (text += t)
    })
  } catch {
    return {
      content: fallback(fi),
      createdAt: new Date().toISOString(),
      provider: null,
      model: null,
      byAi: false
    }
  }
  // Guard: if the model introduced money figures that aren't in the facts, use the rule-based text.
  const allowed = new Set((facts.match(/[\d,]+/g) ?? []).map((n) => n.replace(/,/g, '')))
  const used = (text.match(/[₹$€£¥]\s?[\d,]+/g) ?? []).map((n) => n.replace(/[₹$€£¥,\s]/g, ''))
  if (used.some((n) => !allowed.has(n))) text = ''
  const content = text.trim() || fallback(fi)
  const createdAt = new Date().toISOString()
  db.delete(s.aiNotes).where(eq(s.aiNotes.kind, 'briefing')).run()
  db.insert(s.aiNotes)
    .values({
      id: randomUUID(),
      kind: 'briefing',
      content,
      contextHash: hash,
      provider: status.provider,
      model: status.model,
      createdAt
    })
    .run()
  return { content, createdAt, provider: status.provider, model: status.model, byAi: true }
}
