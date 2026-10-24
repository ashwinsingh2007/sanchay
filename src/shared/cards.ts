import { EVERYDAY_CARDS } from './knowledge/cards/everyday'
import { IDFC_RUPAY_CARDS } from './knowledge/cards/idfcRupay'
import { TRAVEL_PREMIUM_CARDS } from './knowledge/cards/travel'

/**
 * Knowledge base: indicative reward structures for popular Indian credit cards, used to estimate
 * what a card *might* earn on the user's own spending and how best to pay at each merchant.
 * Rates change often; caps, milestones and exclusions are simplified. Every figure is shown as an
 * estimate with a "verify with the issuer" note. Not a recommendation to apply for credit.
 *
 * Reward rates are effective value as a decimal (0.05 = 5% back), assuming the usual redemption.
 */

export type CardNetwork = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'diners'
export type CardTag =
  | 'cashback'
  | 'travel'
  | 'fuel'
  | 'shopping'
  | 'dining'
  | 'upi'
  | 'lifetime-free'
  | 'premium'
  | 'zero-forex'
  | 'bills'

export interface CardProduct {
  id: string
  /**
   * How you get the card. Invite-only and relationship-banking cards are never suggested from
   * spending alone — most people can't simply apply for them.
   */
  access?: 'open' | 'invite' | 'relationship'
  name: string
  issuer: string
  network: CardNetwork
  /** Annual fee in paise (INR), before GST. */
  annualFeeMinor: number
  /** Annual spend (paise) above which the fee is usually waived. */
  feeWaiverSpendMinor?: number
  /** Reward rate applied to eligible spend not matched below. */
  baseRate: number
  /** Category-level rates by category id. */
  categoryRates?: Record<string, number>
  /** Merchant-level rates; keys are lowercase merchant name fragments. */
  merchantRates?: Record<string, number>
  /** Rate on UPI payments when this RuPay card is linked to UPI. Undefined = can't be used on UPI. */
  upiRate?: number
  /** Monthly cap (paise) on the *accelerated* part of rewards (above baseRate). */
  monthlyCapMinor?: number
  /** Foreign-currency markup, % (e.g. 3.5). */
  forexMarkupPct: number
  lounges?: { domestic: number; international: number }
  tags: CardTag[]
  bestFor: string[]
  notes: string[]
}

export const CATALOGUE_AS_OF = 'October 2026'

/** Categories card networks typically exclude from rewards or that are paid outside cards. */
export const NON_REWARD_CATEGORIES = new Set([
  'housing',
  'emi',
  'investments',
  'transfers',
  'cash',
  'fees',
  'insurance',
  'income'
])

/** Reward rate assumed for whatever card the user pays with today. */
export const BASELINE_REWARD_RATE = 0.01
/** Typical forex markup on an ordinary card. */
export const BASELINE_FOREX_PCT = 3.5

/**
 * The full catalogue: everyday/cashback, IDFC FIRST + RuPay-on-UPI, and travel/premium cards.
 * Researched October 2026; see knowledge/SOURCES.md. Later lists win when ids repeat.
 */
export const CARD_CATALOGUE: CardProduct[] = (() => {
  const byId = new Map<string, CardProduct>()
  for (const c of [...EVERYDAY_CARDS, ...IDFC_RUPAY_CARDS, ...TRAVEL_PREMIUM_CARDS])
    byId.set(c.id, c)
  return [...byId.values()]
})()

/** Looks up a card in the catalogue. */
export function cardById(id: string): CardProduct | undefined {
  return CARD_CATALOGUE.find((c) => c.id === id)
}
