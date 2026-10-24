import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { asc } from 'drizzle-orm'
import { addDays, todayISO } from '../../shared/dates'
import type { Offer, OffersResult } from '../../shared/types'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { allTransactions, getSettings } from '../repository'
import { getSecret } from './secrets'
import { PROVIDER_META } from './providers'

const SKIP = new Set(['housing', 'emi', 'investments', 'transfers', 'cash', 'fees', 'income'])
const COUNTRY: Record<string, string> = {
  INR: 'India',
  USD: 'the United States',
  GBP: 'the United Kingdom',
  EUR: 'Europe',
  AED: 'the UAE',
  SGD: 'Singapore',
  AUD: 'Australia',
  CAD: 'Canada',
  JPY: 'Japan'
}

/** Merchants worth hunting offers for: the biggest discretionary spends of the last 90 days. */
export function offerMerchants(db: Db): string[] {
  const since = addDays(todayISO(), -90)
  const totals = new Map<string, number>()
  for (const t of allTransactions(db)) {
    if (
      t.transactionDate < since ||
      t.amountMinor >= 0 ||
      t.isTransfer ||
      SKIP.has(t.categoryId ?? '')
    )
      continue
    totals.set(t.merchantNormalised, (totals.get(t.merchantNormalised) ?? 0) - t.amountMinor)
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([m]) => m)
}

export function listOffers(db: Db): OffersResult {
  const offers = db.select().from(s.offers).orderBy(asc(s.offers.merchant)).all()
  const settings = getSettings(db)
  const supported =
    (settings.aiProvider === 'anthropic' || settings.aiProvider === 'gemini') &&
    settings.cloudConsent
  return {
    offers,
    supported,
    reason: supported
      ? null
      : 'Live offers need web search. Choose Google Gemini or Anthropic Claude in Settings → AI CFO. Only merchant names are searched — never your amounts or statements.',
    merchants: offerMerchants(db),
    foundAt: offers[0]?.foundAt ?? null
  }
}

function parseOffers(text: string, merchants: string[]): Omit<Offer, 'id' | 'foundAt'>[] {
  const json = /\[[\s\S]*\]/.exec(text)?.[0]
  if (!json) return []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const out: Omit<Offer, 'id' | 'foundAt'>[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const url = typeof r['sourceUrl'] === 'string' ? r['sourceUrl'] : ''
    const merchant = typeof r['merchant'] === 'string' ? r['merchant'] : ''
    const title = typeof r['title'] === 'string' ? r['title'] : ''
    // Only keep offers with a real source link, for a merchant we asked about.
    if (
      !/^https:\/\//.test(url) ||
      !title ||
      !merchants.some((m) => m.toLowerCase() === merchant.toLowerCase())
    )
      continue
    out.push({
      merchant,
      title: title.slice(0, 160),
      details: typeof r['details'] === 'string' ? r['details'].slice(0, 400) : '',
      code:
        typeof r['code'] === 'string' && r['code'].trim() ? r['code'].trim().slice(0, 40) : null,
      validTill:
        typeof r['validTill'] === 'string' && r['validTill'].trim()
          ? r['validTill'].slice(0, 40)
          : null,
      sourceUrl: url.slice(0, 500)
    })
  }
  return out.slice(0, 30)
}

/**
 * Searches the web for current offers at the user's top merchants using the chosen cloud model's
 * built-in search. Sends merchant names and country only. Codes are only kept when the model
 * found them on a page it can link to; nothing is invented.
 */
export async function findOffers(db: Db): Promise<OffersResult> {
  const current = listOffers(db)
  if (!current.supported) return current
  const settings = getSettings(db)
  const provider = settings.aiProvider as 'anthropic' | 'gemini'
  const apiKey = getSecret(db, `${provider}_api_key`)
  if (!apiKey)
    return {
      ...current,
      supported: false,
      reason: `Add your ${PROVIDER_META[provider].name} API key in Settings → AI CFO.`
    }
  const merchants = current.merchants
  if (merchants.length === 0) return current
  const country = COUNTRY[settings.primaryCurrency] ?? 'my country'
  const prompt = `Today is ${todayISO()}. For each merchant below, search the web for discounts, coupon codes, cashback or bank/card offers that are currently valid for customers in ${country}.
Merchants: ${merchants.join(', ')}.
Rules: only include offers you actually found on a web page during this search, with that page's URL. Never invent or guess codes. Max 3 per merchant; skip merchants with nothing current.
Reply with ONLY a JSON array: [{"merchant": "<one of the names above>", "title": "...", "details": "how to get it, conditions", "code": "CODE or null", "validTill": "date or null", "sourceUrl": "https://..."}]`

  let text = ''
  const model = settings.aiModel ?? PROVIDER_META[provider].defaultModel
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey })
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
    for (let round = 0; round < 4; round++) {
      const res = await client.messages
        .stream({
          model,
          max_tokens: 16000,
          messages,
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 }]
        })
        .finalMessage()
      for (const b of res.content) if (b.type === 'text') text += b.text
      if (res.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: res.content })
    }
  } else {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }]
        })
      }
    )
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  }

  const found = parseOffers(text, merchants)
  const foundAt = new Date().toISOString()
  db.transaction((tx) => {
    tx.delete(s.offers).run()
    for (const o of found)
      tx.insert(s.offers)
        .values({ id: randomUUID(), ...o, foundAt })
        .run()
  })
  return listOffers(db)
}
