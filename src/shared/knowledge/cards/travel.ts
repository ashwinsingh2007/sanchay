import type { CardProduct } from '../../cards'

/** Travel, premium and lifestyle cards — researched October 2026 (see SOURCES in knowledge/README). */
export const TRAVEL_PREMIUM_CARDS: CardProduct[] = [
  {
    id: 'hdfc-infinia',
    access: 'invite',
    name: 'Infinia Metal',
    issuer: 'HDFC Bank',
    network: 'visa',
    annualFeeMinor: 1250000,
    feeWaiverSpendMinor: 100000000,
    baseRate: 0.033,
    categoryRates: { travel: 0.165 },
    merchantRates: { 'smartbuy hotel': 0.33, 'smartbuy flight': 0.165, 'smartbuy voucher': 0.165 },
    forexMarkupPct: 2,
    lounges: { domestic: 99, international: 99 },
    tags: ['travel', 'premium'],
    bestFor: ['High spenders', 'SmartBuy flights/hotels', 'Airline/hotel transfers'],
    notes: [
      'Invite-only. 5 RP/₹150; 1 RP = ₹1 on SmartBuy travel or 1:1 transfers (less in catalogue/cash).',
      'SmartBuy 10X hotels / 5X flights & vouchers, capped 15,000 RP/month; brand vouchers capped 3,000 RP/month from 1 Jul 2026.',
      'Jan 2026: Turkish/Avianca transfers 2:1; max 5 redemptions/month.',
      'Unlimited lounges incl. guests.'
    ]
  },
  {
    id: 'hdfc-diners-black-metal',
    name: 'Diners Club Black Metal',
    issuer: 'HDFC Bank',
    network: 'diners',
    annualFeeMinor: 1000000,
    feeWaiverSpendMinor: 80000000,
    baseRate: 0.033,
    categoryRates: { travel: 0.165 },
    merchantRates: { 'smartbuy hotel': 0.165, 'smartbuy flight': 0.165, 'smartbuy voucher': 0.165 },
    forexMarkupPct: 2,
    lounges: { domestic: 99, international: 99 },
    tags: ['travel', 'premium', 'dining'],
    bestFor: ['Infinia alternative', 'Quarterly milestones'],
    notes: [
      '5 RP/₹150 uncapped base; 1 RP = ₹1 on SmartBuy travel or 1:1 transfers.',
      'SmartBuy cap 10,000 RP/month; vouchers capped 3,000 RP/month from Jul 2026.',
      'Diners acceptance is weaker abroad and at small merchants — keep a Visa/Mastercard backup.'
    ]
  },
  {
    id: 'hdfc-regalia-gold',
    name: 'Regalia Gold',
    issuer: 'HDFC Bank',
    network: 'visa',
    annualFeeMinor: 250000,
    feeWaiverSpendMinor: 40000000,
    baseRate: 0.0125,
    categoryRates: { travel: 0.0625 },
    merchantRates: { myntra: 0.06, nykaa: 0.06, 'reliance digital': 0.06, 'marks & spencer': 0.06 },
    forexMarkupPct: 2,
    lounges: { domestic: 12, international: 6 },
    tags: ['travel', 'premium'],
    bestFor: ['Mid-tier SmartBuy user', 'Partner-brand 5X'],
    notes: [
      'From 15 May 2026: 5 RP/₹200 (was 4/₹150); RP ≈ ₹0.5 on SmartBuy travel/transfers.',
      'Domestic lounges from Jul 2026 need ₹60K spend in the previous quarter.',
      'SmartBuy vouchers capped 3,000 RP/month.'
    ]
  },
  {
    id: 'hdfc-marriott-bonvoy',
    name: 'Marriott Bonvoy',
    issuer: 'HDFC Bank',
    network: 'diners',
    annualFeeMinor: 300000,
    baseRate: 0.008,
    categoryRates: { travel: 0.016, dining: 0.016, entertainment: 0.016 },
    merchantRates: { marriott: 0.032 },
    forexMarkupPct: 3.5,
    lounges: { domestic: 12, international: 12 },
    tags: ['travel', 'premium'],
    bestFor: ['Marriott loyalists', 'Free Night Awards'],
    notes: [
      '8 Bonvoy pts/₹150 at Marriott, 4 on travel/dining/entertainment, 2 elsewhere; point ≈ ₹0.6.',
      'Fee includes a Free Night Award, Silver Elite, 10 elite night credits; milestone FNAs ~₹6L/₹9L/₹15L.'
    ]
  },
  {
    id: 'axis-atlas',
    name: 'Atlas',
    issuer: 'Axis Bank',
    network: 'visa',
    annualFeeMinor: 500000,
    baseRate: 0.02,
    categoryRates: { travel: 0.05 },
    merchantRates: { 'travel edge': 0.075 },
    forexMarkupPct: 3.5,
    lounges: { domestic: 8, international: 4 },
    tags: ['travel', 'premium'],
    bestFor: ['Airline-miles redemptions (KrisFlyer, Aeroplan)'],
    notes: [
      '2 EDGE Miles/₹100; 5/₹100 on travel (up to ₹2L/month). EDGE Mile valued ~₹1.5 via 1:2 airline transfers.',
      'Apr 2026: Marriott/Accor/Qatar removed; Sep 2026 Accor back at a worse ratio. Annual transfer caps apply.',
      'Tier milestones at ₹3L / ₹7.5L / ₹15L; lounges grow with tier.'
    ]
  },
  {
    id: 'axis-magnus',
    name: 'Magnus',
    issuer: 'Axis Bank',
    network: 'visa',
    annualFeeMinor: 1250000,
    feeWaiverSpendMinor: 250000000,
    baseRate: 0.024,
    categoryRates: { travel: 0.06 },
    forexMarkupPct: 2,
    lounges: { domestic: 99, international: 99 },
    tags: ['travel', 'premium'],
    bestFor: ['₹1.5L+/month spenders'],
    notes: [
      '12 EDGE pts/₹200; 35/₹200 above ₹1.5L monthly spend (~7% at 5:2 transfers).',
      'Lounge access needs quarterly spend (reported ₹50K); verify fee-waiver threshold.'
    ]
  },
  {
    id: 'axis-magnus-burgundy',
    access: 'relationship',
    name: 'Magnus for Burgundy',
    issuer: 'Axis Bank',
    network: 'visa',
    annualFeeMinor: 3000000,
    feeWaiverSpendMinor: 300000000,
    baseRate: 0.03,
    categoryRates: { travel: 0.075 },
    forexMarkupPct: 2,
    lounges: { domestic: 99, international: 99 },
    tags: ['travel', 'premium'],
    bestFor: ['Axis Burgundy wealth customers'],
    notes: [
      'Needs a Burgundy relationship; transfer ratio after Apr 2026 reported inconsistently — verify.'
    ]
  },
  {
    id: 'axis-horizon',
    name: 'Horizon',
    issuer: 'Axis Bank',
    network: 'visa',
    annualFeeMinor: 300000,
    baseRate: 0.02,
    categoryRates: { travel: 0.05 },
    forexMarkupPct: 3.5,
    lounges: { domestic: 8, international: 4 },
    tags: ['travel'],
    bestFor: ['Entry-level EDGE Miles'],
    notes: ['2 EDGE Miles/₹100; 5/₹100 on Travel EDGE and airlines direct. Fee/lounges unverified.']
  },
  {
    id: 'icici-emeralde-private-metal',
    access: 'invite',
    name: 'Emeralde Private Metal',
    issuer: 'ICICI Bank',
    network: 'visa',
    annualFeeMinor: 1249900,
    feeWaiverSpendMinor: 100000000,
    baseRate: 0.03,
    merchantRates: { ishop: 0.03 },
    forexMarkupPct: 2,
    lounges: { domestic: 99, international: 99 },
    tags: ['travel', 'premium'],
    bestFor: ['ICICI wealth clients'],
    notes: [
      'Invite-only; 6 RP/₹200 (~3% at ₹1/RP on travel).',
      'Feb 2026: iShop voucher value-back cut 18% → 3%; no points on govt, fuel, rent, tax, wallet.'
    ]
  },
  {
    id: 'icici-sapphiro',
    name: 'Sapphiro',
    issuer: 'ICICI Bank',
    network: 'visa',
    annualFeeMinor: 350000,
    feeWaiverSpendMinor: 60000000,
    baseRate: 0.005,
    categoryRates: { utilities: 0.0025, insurance: 0.0025 },
    forexMarkupPct: 3.5,
    lounges: { domestic: 16, international: 2 },
    tags: ['premium'],
    bestFor: ['ICICI loyalists only'],
    notes: ['2 RP/₹100 domestic (RP ≈ ₹0.25); domestic lounges need ₹75K quarterly spend.']
  },
  {
    id: 'sbi-elite',
    name: 'ELITE',
    issuer: 'SBI Card',
    network: 'visa',
    annualFeeMinor: 499900,
    feeWaiverSpendMinor: 100000000,
    baseRate: 0.005,
    categoryRates: { dining: 0.025, groceries: 0.025, shopping: 0.025 },
    forexMarkupPct: 1.99,
    lounges: { domestic: 8, international: 6 },
    tags: ['premium', 'dining'],
    bestFor: ['Low forex with SBI', 'Movie benefit'],
    notes: [
      '2 RP/₹100 base; 10/₹100 on dining, department stores, grocery (capped). RP = ₹0.25.',
      'From Apr 2026 statement-credit redemption only in 4,000-RP blocks.'
    ]
  },
  {
    id: 'sbi-prime',
    name: 'PRIME',
    issuer: 'SBI Card',
    network: 'visa',
    annualFeeMinor: 299900,
    feeWaiverSpendMinor: 30000000,
    baseRate: 0.005,
    categoryRates: { dining: 0.025, groceries: 0.025, entertainment: 0.025, shopping: 0.025 },
    forexMarkupPct: 3.5,
    lounges: { domestic: 8, international: 4 },
    tags: ['dining'],
    bestFor: ['Dining & grocery with SBI'],
    notes: ['10 RP/₹100 on dining, groceries, department stores, movies; 2 elsewhere. RP = ₹0.25.']
  },
  {
    id: 'sbi-miles-elite',
    name: 'MILES ELITE',
    issuer: 'SBI Card',
    network: 'visa',
    annualFeeMinor: 499900,
    feeWaiverSpendMinor: 150000000,
    baseRate: 0.01,
    categoryRates: { travel: 0.03 },
    forexMarkupPct: 1.99,
    lounges: { domestic: 8, international: 6 },
    tags: ['travel', 'premium'],
    bestFor: ['SBI travel credits with low forex'],
    notes: ['6 Travel Credits/₹200 on travel, 2 elsewhere; ~₹1/credit on travel or transfers.']
  },
  {
    id: 'hsbc-travelone',
    name: 'TravelOne',
    issuer: 'HSBC',
    network: 'mastercard',
    annualFeeMinor: 499900,
    feeWaiverSpendMinor: 80000000,
    baseRate: 0.015,
    categoryRates: { travel: 0.03 },
    forexMarkupPct: 3.5,
    lounges: { domestic: 6, international: 4 },
    tags: ['travel'],
    bestFor: ['Instant 1:1 transfers incl. Accor, Marriott, Qatar'],
    notes: [
      '2 RP/₹100 base, 4 on travel & forex (cap 50K RP/month); mostly 1:1 instant transfers.',
      'No points on fuel, utilities, rent, insurance, education, government, wallets.'
    ]
  },
  {
    id: 'hsbc-premier',
    access: 'relationship',
    name: 'Premier Metal',
    issuer: 'HSBC',
    network: 'mastercard',
    annualFeeMinor: 2000000,
    baseRate: 0.03,
    forexMarkupPct: 0.99,
    lounges: { domestic: 99, international: 99 },
    tags: ['travel', 'premium'],
    bestFor: ['HSBC Premier clients', 'Forex', 'Rent'],
    notes: [
      '3 RP/₹100 with 1:1 transfers; fee waived for eligible Premier customers; reportedly earns on rent via NoBrokerPay.'
    ]
  },
  {
    id: 'scapia-federal',
    name: 'Scapia',
    issuer: 'Federal Bank (Scapia)',
    network: 'visa',
    annualFeeMinor: 0,
    baseRate: 0.02,
    categoryRates: { travel: 0.04 },
    merchantRates: { scapia: 0.04 },
    forexMarkupPct: 0,
    lounges: { domestic: 99, international: 0 },
    tags: ['travel', 'zero-forex', 'lifetime-free'],
    bestFor: ['International spends', 'Zero forex'],
    notes: [
      '10% Scapia Coins (2% value), 20% on Scapia-app travel; 5 coins = ₹1, redeemable only on Scapia travel.',
      'Unlimited domestic lounges need ₹20K spend per statement (from Feb 2026); utilities/insurance earn nothing.',
      'Axis and BOBCARD variants also exist.'
    ]
  },
  {
    id: 'amex-platinum-travel',
    name: 'Platinum Travel',
    issuer: 'American Express',
    network: 'amex',
    annualFeeMinor: 500000,
    baseRate: 0.01,
    forexMarkupPct: 3.5,
    lounges: { domestic: 8, international: 0 },
    tags: ['travel'],
    bestFor: ['Existing holders hitting ₹4L'],
    notes: [
      'New Amex India applications paused (Aug 2026).',
      'From Sep 2026: ₹1.9L milestone removed; ₹4L = 10K MR; ₹7L = ₹20K Taj voucher.'
    ]
  },
  {
    id: 'amex-mrcc',
    name: 'Membership Rewards',
    issuer: 'American Express',
    network: 'amex',
    annualFeeMinor: 150000,
    feeWaiverSpendMinor: 15000000,
    baseRate: 0.01,
    forexMarkupPct: 3.5,
    tags: ['shopping'],
    bestFor: ['Monthly bonus-MR milestones'],
    notes: [
      'New applications paused; 1 MR/₹50 + 1,000 bonus MR for 4 txns of ₹1,500+/month (≈3–4% via Gold Collection).'
    ]
  },
  {
    id: 'yes-marquee',
    name: 'Marquee',
    issuer: 'YES Bank',
    network: 'mastercard',
    annualFeeMinor: 999900,
    baseRate: 0.0225,
    categoryRates: { shopping: 0.045, subscriptions: 0.045, software: 0.045 },
    forexMarkupPct: 1,
    lounges: { domestic: 99, international: 6 },
    tags: ['premium', 'shopping'],
    bestFor: ['Heavy online spend'],
    notes: [
      '36 RP/₹200 online, 18 offline; RP ₹0.25 on flights/hotels (vouchers ₹0.15); max 70% of a txn redeemable.',
      'Excludes insurance, education, government, rent, wallet, fuel, rail, jewellery, EMI.'
    ]
  },
  {
    id: 'indusind-avios',
    name: 'Avios Visa Infinite',
    issuer: 'IndusInd Bank',
    network: 'visa',
    annualFeeMinor: 500000,
    baseRate: 0.01,
    merchantRates: { 'qatar airways': 0.02, 'british airways': 0.02 },
    forexMarkupPct: 3.5,
    tags: ['travel'],
    bestFor: ['Qatar/BA Avios collectors'],
    notes: ['1.5% forex in your chosen preferred country; earn rates vary by source — verify.']
  },
  {
    id: 'sc-ultimate',
    name: 'Ultimate',
    issuer: 'Standard Chartered',
    network: 'visa',
    annualFeeMinor: 500000,
    baseRate: 0.033,
    categoryRates: { utilities: 0.02, groceries: 0.02, insurance: 0.02, education: 0.02 },
    forexMarkupPct: 2,
    lounges: { domestic: 4, international: 12 },
    tags: ['premium'],
    bestFor: ['Flat 3.3% on most spends'],
    notes: [
      '5 RP/₹150, 1 RP = ₹1; utilities, supermarkets, insurance, schools 3 RP/₹150; no points on fuel.'
    ]
  },
  {
    id: 'au-zenith-plus',
    name: 'Zenith+',
    issuer: 'AU Small Finance Bank',
    network: 'visa',
    annualFeeMinor: 499900,
    baseRate: 0.01,
    categoryRates: { dining: 0.02, travel: 0.02 },
    forexMarkupPct: 0.99,
    lounges: { domestic: 16, international: 99 },
    tags: ['travel', 'premium'],
    bestFor: ['Low forex', 'Priority Pass'],
    notes: ['1 RP/₹100, 2 on dining/travel/international; 1 RP = ₹1.']
  },
  {
    id: 'kotak-white',
    name: 'White',
    issuer: 'Kotak Mahindra Bank',
    network: 'visa',
    annualFeeMinor: 300000,
    feeWaiverSpendMinor: 50000000,
    baseRate: 0.015,
    forexMarkupPct: 3.5,
    tags: ['premium'],
    bestFor: ['Milestone value (₹2L–₹12L)'],
    notes: ['No base points; value comes from spend milestones (₹2K at ₹2L up to ₹27K at ₹12L).']
  }
]
