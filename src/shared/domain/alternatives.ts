import { addMonths, toMonthKey, type MonthKey } from '../dates'
import { formatMoney, sumMinor } from '../money'
import type { SavingsOpportunity, Transaction } from '../types'
import { isSpending, spendOf, toEvidence, type KindMap } from './cashflow'

interface Group {
  txs: Transaction[]
  monthly: number
  perMonthCount: number
}

const DELIVERY = ['swiggy', 'zomato', 'uber eats', 'eatsure', 'doordash', 'deliveroo']
const CABS = ['uber', 'ola', 'rapido', 'lyft', 'bolt']
const QUICK_COMMERCE = ['blinkit', 'zepto', 'instamart', 'bbnow', 'swiggy instamart']
const COFFEE = [
  'starbucks',
  'third wave',
  'blue tokai',
  'chaayos',
  'costa',
  'cafe coffee day',
  'tim hortons'
]
const VIDEO = [
  'netflix',
  'hotstar',
  'disney',
  'prime video',
  'amazon prime',
  'sonyliv',
  'zee5',
  'jiocinema',
  'youtube'
]

const has = (name: string, list: string[]): boolean => {
  const n = name.toLowerCase()
  return list.some((k) => n.includes(k))
}

/**
 * "Smarter alternatives": cheaper ways to get the same thing, sized from the user's own recent
 * spending at specific merchants. Every saving states its assumption; none are guaranteed.
 */
export function findAlternatives(
  transactions: readonly Transaction[],
  month: MonthKey,
  kinds: KindMap,
  currency: string
): SavingsOpportunity[] {
  const fmt = (m: number): string => formatMoney(m, currency)
  const window = new Set([0, 1, 2].map((n) => addMonths(month, -n)))
  const spend = transactions.filter(
    (t) => window.has(toMonthKey(t.transactionDate)) && isSpending(t, kinds) && spendOf(t) > 0
  )
  const monthsWithData = new Set(spend.map((t) => toMonthKey(t.transactionDate))).size || 1

  const group = (match: (t: Transaction) => boolean): Group => {
    const txs = spend.filter(match)
    return {
      txs,
      monthly: Math.round(sumMinor(txs.map(spendOf)) / monthsWithData),
      perMonthCount: txs.length / monthsWithData
    }
  }
  const out: SavingsOpportunity[] = []
  const evidence = (
    g: Group,
    lines: SavingsOpportunity['evidence']['calculation'],
    notes: string[]
  ) => ({
    calculation: lines,
    transactions: [...g.txs]
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
      .slice(0, 8)
      .map(toEvidence),
    notes: [
      ...notes,
      `Based on ${monthsWithData} month${monthsWithData === 1 ? '' : 's'} of your transactions.`
    ]
  })

  // 1. Food delivery → cook some meals at home.
  const delivery = group((t) => t.categoryId === 'dining' && has(t.merchantNormalised, DELIVERY))
  if (delivery.perMonthCount >= 6 && delivery.monthly > 0) {
    const saving = Math.round((delivery.monthly / 3) * 0.6)
    out.push({
      id: 'alt:delivery-cook',
      kind: 'alternative',
      categoryId: 'dining',
      title: 'Cook 1 in 3 delivery meals at home',
      detail: `You order about ${Math.round(delivery.perMonthCount)} times a month (${fmt(delivery.monthly)}). A home-cooked meal typically costs ~40% of a delivered one.`,
      monthlyMinor: saving,
      effort: 'medium',
      confidence: 0.6,
      evidence: evidence(
        delivery,
        [
          { label: 'Food delivery per month', amountMinor: delivery.monthly },
          { label: 'Swap one in three orders', text: '÷ 3' },
          { label: 'Saving per swapped meal (~60%)', text: '× 0.6' },
          { label: 'Estimated saving per month', amountMinor: saving, op: '=' }
        ],
        ['Assumes a home-cooked meal costs about 40% of the same meal delivered.']
      )
    })
    if (currency === 'INR' && delivery.perMonthCount >= 10) {
      const feeSaving = Math.round(delivery.perMonthCount * 4000 - 15000)
      if (feeSaving > 0) {
        out.push({
          id: 'alt:delivery-membership',
          kind: 'alternative',
          categoryId: 'dining',
          title: 'A delivery membership would pay for itself',
          detail: `At ~${Math.round(delivery.perMonthCount)} orders a month, a free-delivery membership on the app you use most usually saves more than it costs.`,
          monthlyMinor: feeSaving,
          effort: 'easy',
          confidence: 0.5,
          evidence: evidence(
            delivery,
            [
              { label: 'Orders per month', text: String(Math.round(delivery.perMonthCount)) },
              { label: 'Typical delivery + platform fee saved per order', amountMinor: 4000 },
              { label: 'Typical membership cost per month', amountMinor: 15000, op: '−' },
              { label: 'Estimated saving per month', amountMinor: feeSaving, op: '=' }
            ],
            [
              'Fees and membership prices vary by city and app; check the current price before joining.'
            ]
          )
        })
      }
    }
  }

  // 2. Cabs → public transport / bike taxi for short trips.
  const cabs = group((t) => t.categoryId === 'transport' && has(t.merchantNormalised, CABS))
  if (cabs.perMonthCount >= 6 && cabs.monthly > 0) {
    const saving = Math.round((cabs.monthly / 3) * 0.5)
    out.push({
      id: 'alt:cabs-transit',
      kind: 'alternative',
      categoryId: 'transport',
      title: 'Use metro, bus or bike taxi for short trips',
      detail: `You take ~${Math.round(cabs.perMonthCount)} cab rides a month (${fmt(cabs.monthly)}). Swapping one in three short trips is usually about half the price.`,
      monthlyMinor: saving,
      effort: 'medium',
      confidence: 0.55,
      evidence: evidence(
        cabs,
        [
          { label: 'Cabs per month', amountMinor: cabs.monthly },
          { label: 'Swap one in three trips at ~50% of the fare', text: '÷ 3 × 0.5' },
          { label: 'Estimated saving per month', amountMinor: saving, op: '=' }
        ],
        ['Assumes transit or a bike taxi costs about half of a cab for short distances.']
      )
    })
  }

  // 3. Quick-commerce groceries → planned monthly stock-up.
  const quick = group((t) => has(t.merchantNormalised, QUICK_COMMERCE))
  if (quick.monthly >= 200_000) {
    const saving = Math.round(quick.monthly * 0.1)
    out.push({
      id: 'alt:quick-commerce',
      kind: 'alternative',
      categoryId: 'groceries',
      title: 'Stock up monthly instead of 10-minute deliveries',
      detail: `${fmt(quick.monthly)} a month goes to quick-commerce apps, where prices and fees often run 5–15% above a planned supermarket shop.`,
      monthlyMinor: saving,
      effort: 'medium',
      confidence: 0.5,
      evidence: evidence(
        quick,
        [
          { label: 'Quick-commerce per month', amountMinor: quick.monthly },
          { label: 'Typical premium avoided (~10%)', text: '× 0.1' },
          { label: 'Estimated saving per month', amountMinor: saving, op: '=' }
        ],
        ['Keep quick delivery for genuine top-ups; move staples to a planned shop.']
      )
    })
  }

  // 4. Café coffee → home brew a few days a week.
  const coffee = group((t) => has(t.merchantNormalised, COFFEE))
  if (coffee.perMonthCount >= 5 && coffee.monthly > 0) {
    const saving = Math.round(coffee.monthly * 0.5 * 0.85)
    out.push({
      id: 'alt:coffee',
      kind: 'alternative',
      categoryId: 'dining',
      title: 'Brew coffee at home half the time',
      detail: `${Math.round(coffee.perMonthCount)} café visits a month (${fmt(coffee.monthly)}). Home coffee costs a fraction of a café cup.`,
      monthlyMinor: saving,
      effort: 'easy',
      confidence: 0.6,
      evidence: evidence(
        coffee,
        [
          { label: 'Cafés per month', amountMinor: coffee.monthly },
          { label: 'Half the visits, ~85% cheaper at home', text: '× 0.5 × 0.85' },
          { label: 'Estimated saving per month', amountMinor: saving, op: '=' }
        ],
        []
      )
    })
  }

  // 5. Several video-streaming services → rotate one at a time.
  const byService = new Map<string, number>()
  for (const t of spend) {
    if (t.categoryId !== 'subscriptions' || !has(t.merchantNormalised, VIDEO)) continue
    byService.set(t.merchantNormalised, (byService.get(t.merchantNormalised) ?? 0) + spendOf(t))
  }
  if (byService.size >= 2) {
    const monthly = [...byService.entries()].map(([name, total]) => ({
      name,
      monthly: Math.round(total / monthsWithData)
    }))
    monthly.sort((a, b) => b.monthly - a.monthly)
    const saving = sumMinor(monthly.slice(1).map((m) => m.monthly))
    const g = group((t) => t.categoryId === 'subscriptions' && has(t.merchantNormalised, VIDEO))
    out.push({
      id: 'alt:streaming-rotate',
      kind: 'alternative',
      categoryId: 'subscriptions',
      title: `Rotate streaming: keep one of ${monthly.length} video services at a time`,
      detail: `You pay for ${monthly.map((m) => m.name).join(', ')}. Keep the one you're watching now, pause the rest, switch next month.`,
      monthlyMinor: saving,
      effort: 'easy',
      confidence: 0.7,
      evidence: evidence(
        g,
        [
          ...monthly.map((m, i) => ({
            label: `${m.name}${i === 0 ? ' (keep)' : ''}`,
            amountMinor: m.monthly
          })),
          { label: 'Saved by pausing the others', amountMinor: saving, op: '=' as const }
        ],
        []
      )
    })
  }

  // 6. Frequent online shopping → 48-hour rule for non-essentials.
  const shopping = group((t) => t.categoryId === 'shopping')
  const totalMonthly = Math.round(sumMinor(spend.map(spendOf)) / monthsWithData)
  if (shopping.perMonthCount >= 4 && shopping.monthly > totalMonthly * 0.06) {
    const saving = Math.round(shopping.monthly * 0.2)
    out.push({
      id: 'alt:shopping-48h',
      kind: 'alternative',
      categoryId: 'shopping',
      title: 'Try a 48-hour rule for online shopping',
      detail: `${Math.round(shopping.perMonthCount)} orders a month (${fmt(shopping.monthly)}). Waiting two days before buying non-essentials typically cuts about a fifth of impulse orders.`,
      monthlyMinor: saving,
      effort: 'medium',
      confidence: 0.45,
      evidence: evidence(
        shopping,
        [
          { label: 'Shopping per month', amountMinor: shopping.monthly },
          { label: 'Impulse orders avoided (~20%)', text: '× 0.2' },
          { label: 'Estimated saving per month', amountMinor: saving, op: '=' }
        ],
        ['Add items to a wishlist and revisit after 48 hours.']
      )
    })
  }

  return out.sort((a, b) => b.monthlyMinor - a.monthlyMinor)
}
