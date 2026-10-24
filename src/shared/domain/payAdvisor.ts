import { addMonths, toMonthKey, type MonthKey } from '../dates'
import {
  BASELINE_FOREX_PCT,
  BASELINE_REWARD_RATE,
  CARD_CATALOGUE,
  CATALOGUE_AS_OF,
  NON_REWARD_CATEGORIES,
  type CardProduct
} from '../cards'
import { PLAYBOOK, type PayRoute, type PlaybookEntry } from '../knowledge/playbook'
import { formatMoney } from '../money'
import type {
  AccountType,
  CardRecommendation,
  PayChannel,
  PayRouteView,
  PayTip,
  PaymentAdvice,
  Transaction
} from '../types'
import { isSpending, spendOf, type KindMap } from './cashflow'
import { normaliseForMatch } from './merchant'

const has = (text: string, word: string): boolean => ` ${text} `.includes(` ${word} `)

/** How a transaction was paid, from the statement text and the account type. */
export function payChannel(description: string, accountType?: AccountType): PayChannel {
  const t = normaliseForMatch(description)
  if (
    ['NACH', 'ACH', 'ECS', 'SI', 'MANDATE', 'AUTOPAY', 'AUTO DEBIT', 'EMANDATE'].some((w) =>
      has(t, w)
    )
  )
    return 'autodebit'
  if (has(t, 'UPI') || /\b[\w.-]+@[a-z]+\b/i.test(description)) return 'upi'
  if (['ATM', 'CASH WDL', 'CASH WITHDRAWAL', 'NWD', 'CWDR'].some((w) => has(t, w))) return 'cash'
  if (['NEFT', 'IMPS', 'RTGS', 'TRANSFER', 'BIL', 'BILLPAY', 'NETBANKING'].some((w) => has(t, w)))
    return 'bank'
  if (accountType === 'credit_card') return 'card'
  if (['POS', 'ECOM', 'CARD', 'VPS', 'IPS', 'PCD'].some((w) => has(t, w))) return 'card'
  return 'other'
}

const CHANNEL_LABEL: Record<PayChannel, string> = {
  upi: 'UPI from your bank account (no rewards)',
  card: 'a card (~1% rewards)',
  bank: 'bank transfer (no rewards)',
  autodebit: 'auto-debit from your bank (no rewards)',
  cash: 'cash',
  other: 'your usual method'
}

const currentRate = (channel: PayChannel): number => (channel === 'card' ? BASELINE_REWARD_RATE : 0)

function isForeign(description: string): boolean {
  const t = normaliseForMatch(description)
  return [
    'FOREX',
    'INTL',
    'INTERNATIONAL',
    'CROSS CURRENCY',
    'USD',
    'EUR',
    'GBP',
    'AED',
    'SGD',
    'DCC'
  ].some((w) => has(t, w))
}

function matchesAny(text: string, fragments: readonly string[]): boolean {
  const t = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
  return fragments.some((f) =>
    t.includes(
      ` ${f
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()} `
    )
  )
}

/** The playbook entry for a merchant/category, given how it was paid. */
export function playbookFor(
  merchant: string,
  description: string,
  categoryId: string | null,
  channel: PayChannel
): PlaybookEntry | null {
  const text = `${merchant} ${description}`
  const byMerchant = PLAYBOOK.find((e) => e.match && matchesAny(text, e.match))
  if (byMerchant) return byMerchant
  if (!categoryId) return null
  // At a shop paid by UPI QR, only UPI-capable routes are realistic.
  if (channel === 'upi') {
    const upi = PLAYBOOK.find((e) => e.id === 'upi-shops')!
    if (upi.categories!.includes(categoryId)) return upi
  }
  return (
    PLAYBOOK.find((e) => e.id !== 'upi-shops' && !e.match && e.categories?.includes(categoryId)) ??
    null
  )
}

const view = (r: PayRoute): PayRouteView => ({
  kind: r.kind,
  label: r.label,
  rate: r.rate,
  how: r.how
})

/**
 * The better way to pay at this merchant, sized from what the user spends there per month.
 * Returns null when it wouldn't make a meaningful difference.
 */
export function payTipFor(input: {
  merchant: string
  description: string
  categoryId: string | null
  monthlyMinor: number
  channel: PayChannel
}): PayTip | null {
  if (NON_REWARD_CATEGORIES.has(input.categoryId ?? '') && input.categoryId !== 'housing')
    return null
  const entry = playbookFor(input.merchant, input.description, input.categoryId, input.channel)
  if (!entry) return null
  const sorted = [...entry.routes].sort((a, b) => b.rate - a.rate)
  // Lead with a card or UPI app anyone can use; situational routes become alternatives.
  const best = sorted.find((r) => r.kind !== 'route') ?? sorted[0]!
  const routes = [best, ...sorted.filter((r) => r !== best)]
  // Size the gain from card/UPI routes; "route" deals (BOGO, portals) are situational.
  const sizing = routes.find((r) => r.kind !== 'route') ?? best
  const gainRate = Math.max(0, Math.min(sizing.rate, 0.1) - currentRate(input.channel))
  const monthlyGainMinor = Math.round(input.monthlyMinor * gainRate)
  if (entry.id !== 'rent' && monthlyGainMinor < 2_000) return null
  if (entry.id === 'rent' && input.channel !== 'card') return null
  return {
    playbookId: entry.id,
    label: entry.label,
    current: CHANNEL_LABEL[input.channel],
    best: view(best),
    others: routes.slice(1).map(view),
    monthlyGainMinor,
    stack: entry.stack,
    avoid: entry.avoid
  }
}

// ---------- Card recommendations ----------

interface SpendTx {
  month: MonthKey
  amount: number
  merchant: string
  categoryId: string
  channel: PayChannel
  foreign: boolean
  /** A known online/brand merchant that accepts cards even if paid by UPI today. */
  acceptsCards: boolean
}

function rateOn(card: CardProduct, t: SpendTx): number {
  const m = t.merchant.toLowerCase()
  let rate = card.baseRate
  for (const [k, r] of Object.entries(card.merchantRates ?? {}))
    if (m.includes(k)) rate = Math.max(rate, r)
  const cat = card.categoryRates?.[t.categoryId]
  if (cat != null) rate = Math.max(rate, cat)
  if (t.channel === 'upi' && !t.acceptsCards) {
    // A shop QR: only RuPay cards on UPI can be used.
    if (card.upiRate == null) return 0
    return Math.max(card.upiRate, cat ?? 0)
  }
  return rate
}

function rewardFor(
  card: CardProduct,
  txs: readonly SpendTx[]
): { reward: number; forex: number; byKey: Map<string, number>; spend: number } {
  const byMonth = new Map<string, { base: number; accel: number }>()
  const byKey = new Map<string, number>()
  let forex = 0
  let spend = 0
  for (const t of txs) {
    const rate = rateOn(card, t)
    if (rate <= 0) continue
    spend += t.amount
    const m = byMonth.get(t.month) ?? { base: 0, accel: 0 }
    m.base += t.amount * Math.min(rate, card.baseRate)
    m.accel += t.amount * Math.max(0, rate - card.baseRate)
    byMonth.set(t.month, m)
    const key = rate > card.baseRate ? t.merchant : `__base`
    byKey.set(key, (byKey.get(key) ?? 0) + t.amount * rate)
    if (t.foreign) forex += (t.amount * Math.max(0, BASELINE_FOREX_PCT - card.forexMarkupPct)) / 100
  }
  let reward = 0
  let uncapped = 0
  for (const m of byMonth.values()) {
    uncapped += m.base + m.accel
    reward +=
      m.base + (card.monthlyCapMinor != null ? Math.min(m.accel, card.monthlyCapMinor) : m.accel)
  }
  // Spread any cap cut across merchants so the "why" lines add up to the real reward.
  if (uncapped > reward && uncapped > 0)
    for (const [k, v] of byKey) byKey.set(k, (v * reward) / uncapped)
  return { reward, forex, byKey, spend }
}

/**
 * Ranks cards by what they'd likely earn on the user's own last 12 months of spending (including
 * whether payments were made by UPI QR, which only RuPay cards can earn on), net of fees, plus
 * the best two-card combination. Indicative, not a recommendation to apply for credit.
 */
export function adviseCards(input: {
  transactions: readonly Transaction[]
  kinds: KindMap
  month: MonthKey
  accountTypes: ReadonlyMap<string, AccountType>
  currency: string
}): PaymentAdvice {
  const { transactions, kinds, month, accountTypes, currency } = input
  const window = new Set(Array.from({ length: 12 }, (_, i) => addMonths(month, -i)))
  const months = new Set<string>()
  const txs: SpendTx[] = []
  for (const t of transactions) {
    const m = toMonthKey(t.transactionDate)
    if (!window.has(m) || !isSpending(t, kinds) || spendOf(t) <= 0) continue
    if (NON_REWARD_CATEGORIES.has(t.categoryId ?? '')) continue
    months.add(m)
    const channel = payChannel(t.descriptionOriginal, accountTypes.get(t.accountId))
    if (channel === 'cash') continue
    const merchant = t.merchantNormalised
    txs.push({
      month: m,
      amount: spendOf(t),
      merchant,
      categoryId: t.categoryId ?? 'other',
      channel,
      foreign: isForeign(t.descriptionOriginal),
      acceptsCards: PLAYBOOK.some(
        (e) =>
          e.id !== 'upi-shops' &&
          e.match &&
          matchesAny(`${merchant} ${t.descriptionOriginal}`, e.match)
      )
    })
  }
  const n = Math.max(1, months.size)
  const annual = (v: number): number => Math.round((v / n) * 12)
  const fmt = (v: number): string => formatMoney(v, currency)

  const totalSpend = txs.reduce((s, t) => s + t.amount, 0)
  const upiSpend = txs.filter((t) => t.channel === 'upi').reduce((s, t) => s + t.amount, 0)
  const todayReward = txs.reduce((s, t) => s + t.amount * currentRate(t.channel), 0)
  const foreign = txs.filter((t) => t.foreign).reduce((s, t) => s + t.amount, 0)
  const byCat = new Map<string, number>()
  for (const t of txs) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount)

  const effectiveFee = (card: CardProduct, annualSpend: number): number =>
    card.feeWaiverSpendMinor != null && annualSpend >= card.feeWaiverSpendMinor
      ? 0
      : card.annualFeeMinor

  const cards: CardRecommendation[] = CARD_CATALOGUE.filter(
    (card) => (card.access ?? 'open') === 'open'
  )
    .map((card) => {
      const r = rewardFor(card, txs)
      const annualReward = annual(r.reward)
      const fee = effectiveFee(card, annual(r.spend))
      const forexSaving = annual(r.forex)
      const why = [...r.byKey.entries()]
        .filter(([k]) => k !== '__base')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${fmt(annual(v))}/yr back on ${k}`)
      const baseShare = r.byKey.get('__base')
      if (baseShare && why.length < 3) why.push(`${fmt(annual(baseShare))}/yr on everything else`)
      if (forexSaving > 0) why.push(`${fmt(forexSaving)}/yr less forex markup`)
      return {
        cardId: card.id,
        name: card.name,
        issuer: card.issuer,
        network: card.network,
        annualFeeMinor: card.annualFeeMinor,
        effectiveFeeMinor: fee,
        annualRewardMinor: annualReward,
        netAnnualGainMinor: annualReward + forexSaving - fee - annual(todayReward),
        forexSavingMinor: forexSaving,
        upi: card.upiRate != null,
        lounges: card.lounges ?? null,
        tags: card.tags,
        bestFor: card.bestFor,
        why,
        notes: card.notes
      }
    })
    .sort((a, b) => b.netAnnualGainMinor - a.netAnnualGainMinor)

  // Best pair: each payment goes to whichever of the two cards earns more on it.
  let combo: PaymentAdvice['combo'] = null
  const shortlist = cards.slice(0, 8).map((c) => CARD_CATALOGUE.find((x) => x.id === c.cardId)!)
  for (let i = 0; i < shortlist.length; i++)
    for (let j = i + 1; j < shortlist.length; j++) {
      const a = shortlist[i]!
      const b = shortlist[j]!
      const toA: SpendTx[] = []
      const toB: SpendTx[] = []
      for (const t of txs) (rateOn(a, t) >= rateOn(b, t) ? toA : toB).push(t)
      const ra = rewardFor(a, toA)
      const rb = rewardFor(b, toB)
      const net =
        annual(ra.reward + rb.reward + ra.forex + rb.forex) -
        effectiveFee(a, annual(ra.spend)) -
        effectiveFee(b, annual(rb.spend)) -
        annual(todayReward)
      if (!combo || net > combo.netAnnualGainMinor) {
        const top = (list: SpendTx[]): string[] => {
          const m = new Map<string, number>()
          for (const t of list) m.set(t.merchant, (m.get(t.merchant) ?? 0) + t.amount)
          return [...m.entries()]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 3)
            .map(([k]) => k)
        }
        combo = {
          cardIds: [a.id, b.id],
          names: [`${a.issuer} ${a.name}`, `${b.issuer} ${b.name}`],
          netAnnualGainMinor: net,
          split: [
            `${a.issuer} ${a.name}: ${top(toA).join(', ') || 'everything else'}`,
            `${b.issuer} ${b.name}: ${top(toB).join(', ') || 'everything else'}`
          ]
        }
      }
    }
  if (combo && cards[0] && combo.netAnnualGainMinor <= cards[0].netAnnualGainMinor) combo = null

  return {
    asOf: CATALOGUE_AS_OF,
    months: months.size,
    annualSpendMinor: annual(totalSpend),
    todayAnnualRewardMinor: annual(todayReward),
    upiSharePct: totalSpend > 0 ? Math.round((upiSpend / totalSpend) * 100) : 0,
    foreignAnnualMinor: annual(foreign),
    byCategory: [...byCat.entries()]
      .map(([categoryId, v]) => ({ categoryId, annualMinor: annual(v) }))
      .sort((a, b) => b.annualMinor - a.annualMinor),
    cards,
    combo,
    notes: [
      `Indicative reward rates as of ${CATALOGUE_AS_OF}; caps simplified, milestones and welcome bonuses ignored. Verify with the issuer.`,
      'Rent, EMIs, insurance, investments, fees and cash are excluded.',
      'Payments made by UPI QR at shops can only earn on RuPay credit cards linked to UPI.',
      'Informational only — not a recommendation to apply for credit.'
    ]
  }
}
