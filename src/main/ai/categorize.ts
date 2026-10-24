import { and, eq, lt, or } from 'drizzle-orm'
import { AI_CATEGORY_CONFIDENCE, aiMemoryKey, isAutoDebit } from '../../shared/domain/categorise'
import { directionFor, kindMap } from '../../shared/domain/cashflow'
import { cleanMerchantName } from '../../shared/domain/merchant'
import type { AiCategoriseResult } from '../../shared/types'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { listCategories, reapplyCategories, saveAiMemory } from '../repository'
import { PROVIDER_META, streamChat } from './providers'
import { getAiStatus, resolveProvider } from './service'

/** What each category means, so the model files money by purpose rather than by shop type. */
const CATEGORY_GUIDE: Record<string, string> = {
  income: 'salary, freelance/business income, interest, dividends, cashback, refunds you earned',
  housing: 'rent, maintenance, society charges, home repairs',
  groceries: 'supermarkets, kirana, quick-commerce groceries (Blinkit, Zepto, BigBasket)',
  dining: 'restaurants, cafes, bars, food delivery (Swiggy, Zomato)',
  transport: 'cabs, auto, metro, fuel, parking, tolls, FASTag',
  shopping: 'retail, e-commerce, clothes, electronics, gadgets, home goods',
  travel: 'flights, trains, hotels, holidays, buses',
  health: 'doctors, hospitals, pharmacies, labs, gyms, fitness',
  insurance: 'life/health/motor insurance premiums',
  education: 'school/college fees, courses, books, online learning',
  entertainment: 'movies, cinemas, events, concerts, games, OTT one-offs',
  utilities: 'electricity, water, gas, mobile, broadband, DTH recharges',
  subscriptions: 'recurring consumer subscriptions: streaming, music, memberships',
  software: 'software & SaaS: cloud hosting, developer tools, AI tools, productivity apps, domains',
  emi: 'loan EMIs and repayments to banks/NBFCs/lenders (L&T Finance, Bajaj Finance, etc.), BNPL, credit lines',
  investments:
    'money moved to FDs/RDs, mutual funds, SIPs, stocks, brokers, NPS, PPF, gold — savings, NOT spending',
  transfers:
    'moving your own money: between your accounts, card bill payments, FD/MF maturity or redemption coming back',
  cash: 'ATM cash withdrawals',
  fees: 'bank charges, late fees, interest charged, GST on fees, penalties',
  other: 'payments to individuals or anything that fits nowhere else'
}

const SYSTEM = `You are a meticulous bookkeeper for an Indian personal-finance app. For each bank or card
transaction line, decide what the money was actually FOR, using the place/merchant name, the direction
and the hints. Think about who the payee really is:
- A lender or NBFC (e.g. "L&T Finance", "Bajaj Finance", "Tata Capital", any "... FINANCE LTD" or "... FINSERV") → emi.
- Fixed/recurring deposits, mutual funds, brokers, SIPs, NPS, PPF, gold → investments (not spending).
- Money returning from an FD, RD or fund (maturity, closure, redemption) → transfers (not income).
- "auto-debit" means a NACH/ECS/standing-instruction mandate: almost always a loan EMI, SIP/RD, insurance
  premium or subscription — pick between those by the payee name.
- Software, cloud, AI and developer tools → software. Consumer streaming/music/memberships → subscriptions.
- Cinemas, movies, events, gaming → entertainment. Restaurants and food delivery → dining.
- Use the business words in the name: SWEETS, FARSAN, BAKERY, CAFE, KITCHEN, DHABA, HOTEL (food) → dining;
  KIRANA, PROVISION, SUPERMARKET, MART, DAIRY, VEGETABLES → groceries; HARDWARE, ELECTRONICS, TEXTILES,
  FASHION, FOOTWEAR, STORES, ENTERPRISES selling goods → shopping; MEDICAL, PHARMACY, CLINIC → health;
  PETROL, FUEL, FILLING STATION → transport.
- Only a plain person's name with no business words → other (or income if it is money in).
If you genuinely cannot tell, answer "unknown". Never guess wildly.

Reply with ONLY a JSON array, no prose: [{"i": <line number>, "category": "<id or unknown>"}]`

const BATCH = 25
const MAX_MERCHANTS = 300
let running: Promise<AiCategoriseResult> | null = null

interface Group {
  key: string
  merchant: string
  sample: string
  inflow: boolean
  autoDebit: boolean
  count: number
  totalMinor: number
  ids: string[]
}

/**
 * Asks the user's AI CFO to categorise everything the rules weren't sure about, one merchant at a
 * time, then remembers each answer so future imports are categorised instantly.
 * Local models see the (trimmed) statement line; cloud models only see the cleaned merchant name.
 */
export function aiCategorise(db: Db): Promise<AiCategoriseResult> {
  running ??= run(db).finally(() => (running = null))
  return running
}

async function run(db: Db): Promise<AiCategoriseResult> {
  // Better rules (and what the AI already learned) first: free, instant, deterministic.
  const reapplied = reapplyCategories(db)

  const status = await getAiStatus(db)
  if (!status.ready) return { reapplied, asked: 0, updated: 0, aiUsed: false }
  let provider: ReturnType<typeof resolveProvider>
  try {
    provider = resolveProvider(db)
  } catch {
    return { reapplied, asked: 0, updated: 0, aiUsed: false }
  }
  const isLocal = PROVIDER_META[provider.provider].kind === 'local'

  const categories = listCategories(db)
  const validIds = new Set(categories.map((c) => c.id))
  const kinds = kindMap(categories)

  const rows = db
    .select()
    .from(s.transactions)
    .where(
      or(
        eq(s.transactions.categorySource, 'fallback'),
        and(
          eq(s.transactions.categorySource, 'keyword'),
          lt(s.transactions.categoryConfidence, 0.6)
        )
      )
    )
    .all()

  const groups = new Map<string, Group>()
  for (const t of rows) {
    const key = aiMemoryKey(t.descriptionOriginal, t.amountMinor)
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        merchant: cleanMerchantName(t.descriptionOriginal),
        sample: t.descriptionOriginal.replace(/\s+/g, ' ').slice(0, 90),
        inflow: t.amountMinor > 0,
        autoDebit: false,
        count: 0,
        totalMinor: 0,
        ids: []
      }
      groups.set(key, g)
    }
    g.autoDebit ||= isAutoDebit(t.descriptionOriginal)
    g.count++
    g.totalMinor += Math.abs(t.amountMinor)
    g.ids.push(t.id)
  }
  const todo = [...groups.values()]
    .filter((g) => g.merchant.trim().length > 1)
    .sort((a, b) => b.totalMinor - a.totalMinor)
    .slice(0, MAX_MERCHANTS)

  const guide = categories
    .map((c) => `${c.id}: ${c.name}${CATEGORY_GUIDE[c.id] ? ` — ${CATEGORY_GUIDE[c.id]}` : ''}`)
    .join('\n')

  let updated = 0
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const lines = batch
      .map((g, j) => {
        const hints = [
          g.inflow ? 'money IN' : 'money OUT',
          g.autoDebit ? 'auto-debit' : null,
          g.count > 1 ? `${g.count} times` : null
        ].filter(Boolean)
        return `${j + 1}. ${isLocal ? g.sample : g.merchant} (${hints.join(', ')})`
      })
      .join('\n')

    let text = ''
    try {
      await streamChat(provider.provider, {
        system: `${SYSTEM}\n\nCategory ids:\n${guide}`,
        messages: [{ role: 'user', content: `Transactions:\n${lines}` }],
        model: provider.model,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        signal: AbortSignal.timeout(isLocal ? 120_000 : 60_000),
        onText: (t) => (text += t)
      })
    } catch {
      break // Model unavailable — keep what we have.
    }

    const answers = parseAnswers(text)
    const learned: { key: string; categoryId: string; merchant: string }[] = []
    for (const a of answers) {
      const g = batch[a.i - 1]
      if (!g || !validIds.has(a.category)) continue
      // Income/transfer ids only make sense for money in; spending ids for money out (refunds aside).
      if (!g.inflow && a.category === 'income') continue
      // "other" tells us nothing new — leave it in Needs review for the user.
      if (a.category === 'other') continue
      learned.push({ key: g.key, categoryId: a.category, merchant: g.merchant })
      const kind = kinds.get(a.category)
      const isTransfer = kind === 'transfer'
      db.transaction((tx) => {
        for (const id of g.ids) {
          const t = tx.select().from(s.transactions).where(eq(s.transactions.id, id)).get()
          if (!t || t.categorySource === 'manual' || t.categorySource === 'user_rule') continue
          tx.update(s.transactions)
            .set({
              categoryId: a.category,
              categoryConfidence: AI_CATEGORY_CONFIDENCE,
              categorySource: 'ai',
              isTransfer,
              direction: directionFor(kind, isTransfer, t.amountMinor)
            })
            .where(eq(s.transactions.id, id))
            .run()
          updated++
        }
      })
    }
    saveAiMemory(db, learned)
  }

  return { reapplied, asked: todo.length, updated, aiUsed: todo.length > 0 }
}

function parseAnswers(text: string): { i: number; category: string }[] {
  const json = /\[[\s\S]*\]/.exec(text)?.[0]
  if (!json) return []
  try {
    const arr = JSON.parse(json) as unknown
    if (!Array.isArray(arr)) return []
    return arr.flatMap((x) => {
      if (!x || typeof x !== 'object') return []
      const o = x as Record<string, unknown>
      const i = Number(o['i'])
      const category = typeof o['category'] === 'string' ? o['category'].trim().toLowerCase() : ''
      return Number.isInteger(i) && category ? [{ i, category }] : []
    })
  } catch {
    return []
  }
}
