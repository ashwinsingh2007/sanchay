/**
 * Knowledge base: UPI apps and how they reward payments (India). Rates are deliberately
 * conservative "typical" values; headline "up to" rates are kept separately. Programmes change
 * often — always shown as indicative with the as-of date.
 */

export interface UpiApp {
  id: string
  name: string
  owner: string
  /** What you earn: cashback to bank, app coins, scratch cards… */
  rewardType: string
  /** Conservative everyday reward as a decimal (0.01 = 1%). */
  typicalRate: number
  /** Advertised best case. */
  upToRate: number
  /** Can you pay with a RuPay credit card on UPI from this app? */
  rupayCredit: boolean
  /** Merchants where the app's rewards are strongest (lowercase fragments). */
  partners: string[]
  bestFor: string
  caveats: string[]
}

export const UPI_KB_AS_OF = 'October 2026'

export const UPI_APPS: UpiApp[] = [
  {
    id: 'kiwi',
    name: 'Kiwi',
    owner: 'Kiwi (with YES Bank / AU / PNB)',
    rewardType: 'Cashback on the Kiwi RuPay card',
    typicalRate: 0.015,
    upToRate: 0.05,
    rupayCredit: true,
    partners: [],
    bestFor: 'Scan & Pay at any shop QR (kirana, small shops)',
    caveats: [
      'Free tier: 1.5% Scan & Pay, 0.5% online UPI.',
      'Neon ₹999+GST/yr: 2%, then 3/4/5% at ₹50K/₹1L/₹1.5L yearly spend.',
      'Monthly cap 1% of credit limit; rates apply to the Kiwi card only.'
    ]
  },
  {
    id: 'super-money',
    name: 'super.money',
    owner: 'Flipkart',
    rewardType: 'Cashback (app offers + Axis super.money RuPay card)',
    typicalRate: 0.005,
    upToRate: 0.03,
    rupayCredit: true,
    partners: [
      'flipkart',
      'myntra',
      'cleartrip',
      'swiggy',
      'zomato',
      'blinkit',
      'ola',
      'uber',
      'rapido',
      'makemytrip',
      'bookmyshow'
    ],
    bestFor: 'Shop QR with the Axis super.money RuPay card; Flipkart-group merchants',
    caveats: [
      'From Jan 2026 the card gives 1% elsewhere; 3% on super.money UPI capped at your 1% earnings, max ₹300/month; nothing under ₹100.',
      'Headline “5% cashback” is promo-driven.'
    ]
  },
  {
    id: 'tata-neu-upi',
    name: 'Tata Neu UPI',
    owner: 'Tata Digital',
    rewardType: 'NeuCoins',
    typicalRate: 0.015,
    upToRate: 0.05,
    rupayCredit: true,
    partners: ['bigbasket', 'croma', 'tata 1mg', 'westside', 'air india', 'taj', 'tata cliq'],
    bestFor: 'Tata Neu HDFC RuPay card on UPI; Tata brands',
    caveats: [
      'Infinity RuPay: 1.5% via @tataneu, only ~0.5% via other UPI apps; UPI capped 500 NeuCoins/month.',
      'NeuCoins usable only in the Tata ecosystem.'
    ]
  },
  {
    id: 'pop',
    name: 'POP UPI',
    owner: 'POP (Pop Club)',
    rewardType: 'POPcoins',
    typicalRate: 0.01,
    upToRate: 0.1,
    rupayCredit: true,
    partners: ['popshop'],
    bestFor: 'YES Bank POP-Club RuPay card holders; POPshop brands',
    caveats: [
      'POPcoins mostly redeemable on POPshop/partners.',
      'POP-Club card: 10 coins/₹100 online, 2 offline, +5 via POP UPI.'
    ]
  },
  {
    id: 'cred',
    name: 'CRED',
    owner: 'CRED',
    rewardType: 'Coins and campaign cashback',
    typicalRate: 0.002,
    upToRate: 0.05,
    rupayCredit: true,
    partners: ['cred store'],
    bestFor: 'Card bill payments; CRED IndusInd RuPay card on CRED UPI',
    caveats: [
      'Needs a 750+ credit score; rewards mostly periodic campaigns.',
      'A platform fee may apply on bill payments.'
    ]
  },
  {
    id: 'slice',
    name: 'slice',
    owner: 'slice Small Finance Bank',
    rewardType: 'Cashback on slice UPI credit',
    typicalRate: 0.01,
    upToRate: 0.03,
    rupayCredit: false,
    partners: [],
    bestFor: 'slice credit line on UPI',
    caveats: ['2% UPI / 1% card; headline 3% is conditional.']
  },
  {
    id: 'salaryse',
    name: 'SalarySe',
    owner: 'SalarySe (with RBL / City Union Bank)',
    rewardType: 'Scoins',
    typicalRate: 0.01,
    upToRate: 0.075,
    rupayCredit: true,
    partners: [],
    bestFor: 'Salaried users at SalarySe-partner employers',
    caveats: [
      'Needs an employer tie-up.',
      '7.5% “salary day” bonus only on the 1st and last day of the month, up to ₹15K of UPI.',
      '5 Scoins = ₹1 on gift cards, 10 = ₹1 cash.'
    ]
  },
  {
    id: 'amazon-pay',
    name: 'Amazon Pay UPI',
    owner: 'Amazon',
    rewardType: 'Amazon Pay balance cashback, offers',
    typicalRate: 0.002,
    upToRate: 0.05,
    rupayCredit: true,
    partners: ['amazon', 'swiggy', 'zomato', 'bookmyshow'],
    bestFor: 'Bills, recharges and Amazon-linked merchants',
    caveats: [
      'Cashback lands as Amazon Pay balance.',
      'Amazon Pay ICICI charges 1% on wallet loads ≥ ₹5K (Jan 2026).'
    ]
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    owner: 'PhonePe',
    rewardType: 'Scratch cards, merchant offers',
    typicalRate: 0.002,
    upToRate: 0.02,
    rupayCredit: true,
    partners: ['pincode'],
    bestFor: 'Universal acceptance; PhonePe SBI card benefits',
    caveats: ['Rewards irregular; platform fees on some recharges/bill payments.']
  },
  {
    id: 'google-pay',
    name: 'Google Pay',
    owner: 'Google',
    rewardType: 'Scratch cards, offers',
    typicalRate: 0.001,
    upToRate: 0.01,
    rupayCredit: true,
    partners: [],
    bestFor: 'Reliability; Axis ACE 5% on bills paid here',
    caveats: ['Minimal rewards; convenience fee on card bill payments and some utilities.']
  },
  {
    id: 'paytm',
    name: 'Paytm',
    owner: 'One97 Communications',
    rewardType: 'Cashback points, offers',
    typicalRate: 0.002,
    upToRate: 0.02,
    rupayCredit: true,
    partners: ['paytm travel', 'paytm movies'],
    bestFor: 'Travel and movie offers',
    caveats: ['UPI handles now via partner banks; low-value points.']
  },
  {
    id: 'navi',
    name: 'Navi UPI',
    owner: 'Navi',
    rewardType: 'Navi Coins (100 = ₹1)',
    typicalRate: 0.002,
    upToRate: 0.01,
    rupayCredit: true,
    partners: [],
    bestFor: 'Small guaranteed coins on Scan & Pay',
    caveats: ['Random coins up to ₹5 per txn; typically ₹3–5/month.']
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    owner: 'Amica Financial',
    rewardType: 'Jewels',
    typicalRate: 0.005,
    upToRate: 0.02,
    rupayCredit: true,
    partners: [],
    bestFor: 'Merchant QR with the Jupiter Edge+ card',
    caveats: ['Edge+ rewards only via Jupiter UPI from Jun 2026.']
  },
  {
    id: 'mobikwik',
    name: 'MobiKwik',
    owner: 'One MobiKwik Systems',
    rewardType: 'SuperCash, cashback offers',
    typicalRate: 0.002,
    upToRate: 0.05,
    rupayCredit: true,
    partners: [],
    bestFor: 'Bill-pay/recharge offers',
    caveats: ['SuperCash only partly redeemable per transaction.']
  },
  {
    id: 'freecharge',
    name: 'Freecharge',
    owner: 'Axis Bank',
    rewardType: 'Cashback offers',
    typicalRate: 0.001,
    upToRate: 0.02,
    rupayCredit: true,
    partners: [],
    bestFor: 'Occasional recharge/bill offers',
    caveats: ['Offers are sporadic.']
  },
  {
    id: 'airtel-thanks',
    name: 'Airtel Thanks',
    owner: 'Bharti Airtel',
    rewardType: 'Offers; unlocks Airtel Axis card cashback',
    typicalRate: 0,
    upToRate: 0.25,
    rupayCredit: true,
    partners: ['airtel'],
    bestFor: 'Paying Airtel and utility bills with the Airtel Axis card',
    caveats: [
      'The 25% belongs to the Airtel Axis card (capped at 2× base cashback since Apr 2026).'
    ]
  },
  {
    id: 'flipkart-upi',
    name: 'Flipkart UPI',
    owner: 'Flipkart',
    rewardType: 'SuperCoins, checkout offers',
    typicalRate: 0.005,
    upToRate: 0.02,
    rupayCredit: true,
    partners: ['flipkart', 'myntra', 'cleartrip'],
    bestFor: 'Flipkart checkout',
    caveats: ['For shop QR payments use super.money instead.']
  },
  {
    id: 'bhim',
    name: 'BHIM',
    owner: 'NPCI',
    rewardType: 'Occasional incentives',
    typicalRate: 0,
    upToRate: 0.005,
    rupayCredit: true,
    partners: [],
    bestFor: 'Neutral, ad-free fallback app',
    caveats: ['No steady rewards.']
  },
  {
    id: 'whatsapp-pay',
    name: 'WhatsApp Pay',
    owner: 'Meta',
    rewardType: 'Rare promos',
    typicalRate: 0,
    upToRate: 0.005,
    rupayCredit: false,
    partners: [],
    bestFor: 'Paying friends',
    caveats: ['No ongoing rewards.']
  },
  {
    id: 'groww-upi',
    name: 'Groww UPI',
    owner: 'Groww',
    rewardType: 'None notable',
    typicalRate: 0,
    upToRate: 0.005,
    rupayCredit: false,
    partners: [],
    bestFor: 'Groww investors who want one app',
    caveats: ['No steady rewards.']
  }
]

/** Products that no longer exist, so the AI doesn't recommend them. */
export const DISCONTINUED = [
  'Fi Money shut consumer banking on 11 Mar 2026 (customers moved to FedMobile).',
  'Original Swiggy HDFC card closed to new applicants (Feb 2026) — replaced by Swiggy BLCK / Ornge.',
  'Club Vistara IDFC FIRST card discontinued after 30 Sep 2026.',
  'American Express India paused all new card applications (Aug 2026).',
  'Air India SBI Signature reported closed to new applications (2026).',
  'Old slice card replaced by the slice UPI credit card.'
]

export function upiAppById(id: string): UpiApp | undefined {
  return UPI_APPS.find((a) => a.id === id)
}
