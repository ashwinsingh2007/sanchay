import type { CategorySource, MerchantRule } from '../types'
import type { SeedCategoryId } from '../categories'
import { cleanMerchantName, merchantKey, normaliseForMatch } from './merchant'

export interface CategorisationInput {
  description: string
  amountMinor: number
}

export interface CategorisationResult {
  categoryId: string
  merchantNormalised: string
  confidence: number
  source: CategorySource
  ruleId?: string
}

/**
 * A pluggable categoriser. Providers are tried in order; the first non-null result wins.
 * A future on-device model can implement this interface and be inserted before the fallback.
 */
export interface CategorisationProvider {
  readonly name: string
  categorise(input: CategorisationInput): CategorisationResult | null
}

function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false
  return ` ${haystack} `.includes(` ${needle} `)
}

// ---------- User rules ----------

export class UserRuleProvider implements CategorisationProvider {
  readonly name = 'user-rules'
  private readonly rules: { rule: MerchantRule; regex: RegExp | null; value: string }[]

  constructor(rules: readonly MerchantRule[]) {
    this.rules = [...rules]
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))
      .map((rule) => {
        let regex: RegExp | null = null
        if (rule.matchType === 'regex') {
          try {
            regex = new RegExp(rule.matchValue, 'i')
          } catch {
            regex = null
          }
        }
        return { rule, regex, value: normaliseForMatch(rule.matchValue) }
      })
  }

  categorise(input: CategorisationInput): CategorisationResult | null {
    const desc = normaliseForMatch(input.description)
    const cleaned = cleanMerchantName(input.description)
    const merchant = normaliseForMatch(cleaned)
    for (const { rule, regex, value } of this.rules) {
      if (matchesRule(rule.matchType, value, regex, input.description, desc, cleaned, merchant)) {
        return {
          categoryId: rule.categoryId,
          merchantNormalised: rule.merchantNormalised || cleaned,
          confidence: 1,
          source: 'user_rule',
          ruleId: rule.id
        }
      }
    }
    return null
  }
}

function matchesRule(
  matchType: MerchantRule['matchType'],
  value: string,
  regex: RegExp | null,
  rawDescription: string,
  normDescription: string,
  rawMerchant: string,
  normMerchant: string
): boolean {
  switch (matchType) {
    case 'exact':
      return value !== '' && (normMerchant === value || normDescription === value)
    case 'contains':
      return value !== '' && (normDescription.includes(value) || normMerchant.includes(value))
    case 'regex':
      return !!regex && (regex.test(rawDescription) || regex.test(rawMerchant))
  }
}

export function ruleMatchesDescription(rule: MerchantRule, description: string): boolean {
  return new UserRuleProvider([rule]).categorise({ description, amountMinor: 0 }) !== null
}

// ---------- Seeded keyword rules ----------

interface KeywordRule {
  category: SeedCategoryId
  patterns: string[]
  /** Display name to use when matched. Omitted for generic words like "RENT". */
  merchant?: string
  direction?: 'inflow' | 'outflow'
  confidence?: number
}

const brand = (category: SeedCategoryId, merchant: string, ...patterns: string[]): KeywordRule => ({
  category,
  merchant,
  patterns: patterns.length ? patterns : [normaliseForMatch(merchant)]
})

const generic = (
  category: SeedCategoryId,
  patterns: string[],
  extra: Partial<KeywordRule> = {}
): KeywordRule => ({ category, patterns, confidence: 0.7, ...extra })

// Order matters: more specific rules come first.
export const KEYWORD_RULES: KeywordRule[] = [
  // Transfers between your own accounts / card bill payments
  generic(
    'transfers',
    [
      'CC BILL',
      'CREDIT CARD PAYMENT',
      'CREDIT CARD BILL',
      'CARD BILL PAYMENT',
      'PAYMENT RECEIVED',
      'PAYMENT THANK YOU',
      'SELF TRANSFER',
      'OWN ACCOUNT',
      'TO SELF',
      'SWEEP',
      'CCBILL',
      'AUTOPAY CC'
    ],
    { confidence: 0.85 }
  ),
  // Income
  generic('income', ['SALARY', 'SAL CREDIT', 'PAYROLL', 'SALARY CREDIT'], {
    direction: 'inflow',
    confidence: 0.9
  }),
  generic('income', ['INT PD', 'INTEREST CREDIT', 'INTEREST PAID', 'SB INT', 'CREDIT INTEREST'], {
    direction: 'inflow',
    merchant: 'Bank interest',
    confidence: 0.85
  }),
  generic('income', ['DIVIDEND', 'CASHBACK', 'REWARD'], { direction: 'inflow' }),
  // Money coming back from your own FDs / investments is not income.
  generic(
    'transfers',
    [
      'FD CLOSURE',
      'FD MATURITY',
      'FD PREMAT',
      'FD PREMATURE',
      'MATURITY PROCEEDS',
      'TD CLOSURE',
      'TD MATURITY',
      'RD MATURITY',
      'RD CLOSURE',
      'REDEMPTION',
      'MF REDEMPTION',
      'SIP REDEMPTION',
      'DEPOSIT CLOSURE',
      'LIQUIDATION'
    ],
    { direction: 'inflow', merchant: 'Investment proceeds', confidence: 0.8 }
  ),
  // Lenders: repayments are EMI & debt, not shopping or "other".
  brand('emi', 'L&T Finance', 'L T FINANCE', 'LTFS', 'L AND T FINANCE', 'L T FIN', 'LNT FINANCE'),
  brand('emi', 'Bajaj Finance', 'BAJAJ FINANCE', 'BAJAJ FINSERV', 'BAJAJ FIN', 'BFL'),
  brand('emi', 'Tata Capital', 'TATA CAPITAL'),
  brand('emi', 'Home Credit', 'HOME CREDIT'),
  brand('emi', 'HDB Financial', 'HDB FINANCIAL', 'HDBFS'),
  brand('emi', 'Muthoot Finance', 'MUTHOOT'),
  brand('emi', 'Aditya Birla Finance', 'ADITYA BIRLA FINANCE', 'ABFL'),
  brand('emi', 'Piramal Finance', 'PIRAMAL'),
  brand('emi', 'LIC Housing Finance', 'LIC HOUSING', 'LICHFL'),
  brand('emi', 'PNB Housing', 'PNB HOUSING'),
  brand('emi', 'Mahindra Finance', 'MAHINDRA FINANCE', 'MMFSL'),
  brand('emi', 'Shriram Finance', 'SHRIRAM FINANCE', 'SHRIRAM TRANSPORT'),
  brand('emi', 'Hero FinCorp', 'HERO FINCORP'),
  brand('emi', 'Cholamandalam', 'CHOLAMANDALAM', 'CHOLA'),
  brand('emi', 'Poonawalla Fincorp', 'POONAWALLA'),
  brand('emi', 'Kotak Prime', 'KOTAK PRIME', 'KOTAK MAHINDRA PRIME'),
  brand('emi', 'Fullerton', 'FULLERTON', 'SMFG INDIA CREDIT'),
  brand('emi', 'IIFL Finance', 'IIFL'),
  brand('emi', 'Aavas', 'AAVAS'),
  brand('emi', 'Credila', 'CREDILA', 'AVANSE'),
  brand('emi', 'Navi', 'NAVI'),
  brand('emi', 'KreditBee', 'KREDITBEE'),
  brand('emi', 'MoneyView', 'MONEYVIEW', 'MONEY VIEW'),
  brand('emi', 'CASHe', 'CASHE'),
  brand('emi', 'Fibe', 'FIBE', 'EARLYSALARY'),
  brand('emi', 'slice', 'SLICE'),
  brand('emi', 'LazyPay', 'LAZYPAY'),
  brand('emi', 'Simpl', 'SIMPL'),
  brand('emi', 'ZestMoney', 'ZESTMONEY'),
  generic(
    'emi',
    [
      'TERM LOAN',
      'HOME LOAN',
      'CAR LOAN',
      'AUTO LOAN',
      'PERSONAL LOAN',
      'GOLD LOAN',
      'EDUCATION LOAN',
      'LOAN EMI',
      'LOAN REPAYMENT',
      'EMI'
    ],
    {
      direction: 'outflow',
      confidence: 0.85
    }
  ),
  // Deposits & investments: money you keep, not money you spend.
  generic(
    'investments',
    [
      'FD',
      'FIXED DEPOSIT',
      'TERM DEPOSIT',
      'TD BOOKING',
      'TO FD',
      'FD BOOKING',
      'FD CREATION',
      'NEW FD',
      'RECURRING DEPOSIT',
      'RD INST',
      'RD INSTALMENT',
      'RD INSTALLMENT',
      'TO RD'
    ],
    { direction: 'outflow', merchant: 'Fixed / recurring deposit', confidence: 0.85 }
  ),
  brand('investments', 'Zerodha', 'ZERODHA', 'COIN BY ZERODHA'),
  brand('investments', 'Groww', 'GROWW', 'NEXTBILLION'),
  brand('investments', 'Kuvera', 'KUVERA'),
  brand('investments', 'Paytm Money', 'PAYTM MONEY'),
  brand('investments', 'Upstox', 'UPSTOX', 'RKSV'),
  brand('investments', 'Angel One', 'ANGEL ONE', 'ANGEL BROKING'),
  brand('investments', '5paisa', '5PAISA'),
  brand('investments', 'Dhan', 'DHAN', 'RAISE SECURITIES'),
  brand('investments', 'INDmoney', 'INDMONEY'),
  brand('investments', 'smallcase', 'SMALLCASE'),
  brand('investments', 'ET Money', 'ET MONEY'),
  brand('investments', 'Mutual fund (CAMS)', 'CAMS', 'CAMSONLINE'),
  brand('investments', 'Mutual fund (KFintech)', 'KFINTECH', 'KFIN', 'KARVY'),
  brand('investments', 'BSE StAR MF', 'BSE STAR MF', 'BSE STAR', 'BSE LIMITED'),
  brand('investments', 'NSE / ICCL', 'NSE CLEARING', 'ICCL', 'INDIAN CLEARING', 'NSCCL'),
  brand('investments', 'PPFAS Mutual Fund', 'PPFAS', 'PARAG PARIKH'),
  generic(
    'investments',
    [
      'MUTUAL FUND',
      'MUTUAL FUNDS',
      'SIP',
      'MIRAE',
      'NIPPON INDIA MF',
      'HDFC MF',
      'HDFC MUTUAL',
      'ICICI PRU MF',
      'ICICI PRUDENTIAL MUTUAL',
      'SBI MF',
      'SBI MUTUAL',
      'AXIS MF',
      'AXIS MUTUAL',
      'KOTAK MF',
      'UTI MF',
      'UTI MUTUAL',
      'DSP MF',
      'QUANT MF',
      'MOTILAL OSWAL',
      'TATA MF',
      'TATA MUTUAL',
      'NPS',
      'PROTEAN',
      'NSDL',
      'PPF',
      'SUKANYA',
      'SSY',
      'SGB',
      'SOVEREIGN GOLD',
      'DIGITAL GOLD',
      'SAFEGOLD',
      'AUGMONT',
      'MMTC PAMP'
    ],
    { direction: 'outflow', confidence: 0.85 }
  ),
  // Insurance premiums.
  generic(
    'insurance',
    [
      'HDFC LIFE',
      'ICICI PRU LIFE',
      'ICICI PRUDENTIAL LIFE',
      'SBI LIFE',
      'MAX LIFE',
      'TATA AIA',
      'BAJAJ ALLIANZ',
      'CARE HEALTH',
      'STAR HEALTH',
      'NIVA BUPA',
      'MANIPAL CIGNA',
      'ADITYA BIRLA HEALTH',
      'KOTAK LIFE',
      'PNB METLIFE',
      'RELIANCE GENERAL',
      'NEW INDIA ASSURANCE',
      'UNITED INDIA',
      'ORIENTAL INSURANCE',
      'GO DIGIT',
      'DIGIT INSURANCE',
      'ACKO',
      'POLICYBAZAAR',
      'LIC',
      'LIC OF INDIA',
      'TERM PLAN'
    ],
    { direction: 'outflow', confidence: 0.85 }
  ),
  // Software & SaaS.
  brand('software', 'AWS', 'AWS', 'AMAZON WEB SERVICES'),
  brand('software', 'Google Cloud', 'GOOGLE CLOUD', 'GCP'),
  brand('software', 'Google Workspace', 'GOOGLE WORKSPACE', 'GSUITE', 'G SUITE'),
  brand('software', 'Zoom', 'ZOOM'),
  brand('software', 'Slack', 'SLACK'),
  brand('software', 'Atlassian', 'ATLASSIAN', 'JIRA'),
  brand('software', 'JetBrains', 'JETBRAINS'),
  brand('software', 'Vercel', 'VERCEL'),
  brand('software', 'Netlify', 'NETLIFY'),
  brand('software', 'DigitalOcean', 'DIGITALOCEAN'),
  brand('software', 'Heroku', 'HEROKU'),
  brand('software', 'Cloudflare', 'CLOUDFLARE'),
  brand('software', 'GoDaddy', 'GODADDY'),
  brand('software', 'Namecheap', 'NAMECHEAP'),
  brand('software', 'Hostinger', 'HOSTINGER'),
  brand('software', 'Linear', 'LINEAR APP'),
  brand('software', 'Cursor', 'CURSOR'),
  brand('software', 'Grammarly', 'GRAMMARLY'),
  brand('software', '1Password', '1PASSWORD'),
  brand('software', 'NordVPN', 'NORDVPN'),
  brand('software', 'ExpressVPN', 'EXPRESSVPN'),
  brand('software', 'Zoho', 'ZOHO'),
  brand('software', 'Freshworks', 'FRESHWORKS', 'FRESHDESK'),
  // Fees before anything else that could contain "CARD"
  generic(
    'fees',
    [
      'ANNUAL FEE',
      'LATE PAYMENT',
      'GST ON',
      'SMS ALERT',
      'SMS CHARGES',
      'FINANCE CHARGE',
      'INTEREST CHARGED',
      'PENALTY',
      'MIN BAL',
      'CHARGES',
      'CHRG',
      'FEE',
      'FEES',
      'FOREX MARKUP'
    ],
    { direction: 'outflow' }
  ),
  // Subscriptions (before shopping so "AMAZON PRIME" wins over "AMAZON")
  brand('subscriptions', 'Netflix'),
  brand('subscriptions', 'Spotify'),
  brand('subscriptions', 'YouTube Premium', 'YOUTUBE', 'YOUTUBE PREMIUM', 'GOOGLE YOUTUBE'),
  brand('subscriptions', 'Google One', 'GOOGLE ONE', 'GOOGLE STORAGE'),
  brand('subscriptions', 'Apple iCloud', 'ICLOUD', 'APPLE COM BILL'),
  brand('subscriptions', 'Disney+ Hotstar', 'HOTSTAR', 'DISNEY'),
  brand('subscriptions', 'Amazon Prime', 'AMAZON PRIME', 'PRIME VIDEO', 'PRIME MEMBERSHIP'),
  brand('subscriptions', 'SonyLIV', 'SONYLIV'),
  brand('subscriptions', 'ZEE5', 'ZEE5'),
  brand('subscriptions', 'JioCinema', 'JIOCINEMA', 'JIOHOTSTAR'),
  brand('subscriptions', 'Audible'),
  brand('software', 'Notion'),
  brand('software', 'ChatGPT', 'CHATGPT', 'OPENAI'),
  brand('software', 'Claude', 'CLAUDE AI', 'ANTHROPIC'),
  brand('software', 'Adobe'),
  brand('software', 'Microsoft 365', 'MICROSOFT 365', 'MICROSOFT'),
  brand('software', 'Dropbox'),
  brand('subscriptions', 'LinkedIn Premium', 'LINKEDIN'),
  brand('software', 'Canva'),
  brand('software', 'GitHub', 'GITHUB'),
  brand('software', 'Figma'),
  // Groceries (before dining so "SWIGGY INSTAMART" is groceries)
  brand('groceries', 'Swiggy Instamart', 'INSTAMART', 'SWIGGY INSTAMART'),
  brand('groceries', 'BigBasket', 'BIGBASKET', 'BIG BASKET', 'BBNOW'),
  brand('groceries', 'Blinkit', 'BLINKIT', 'GROFERS'),
  brand('groceries', 'Zepto'),
  brand('groceries', 'DMart', 'DMART', 'D MART', 'AVENUE SUPERMARTS'),
  brand('groceries', 'JioMart', 'JIOMART'),
  brand('groceries', 'Reliance Fresh', 'RELIANCE FRESH', 'RELIANCE SMART'),
  brand('groceries', "Nature's Basket", 'NATURES BASKET', 'NATURE S BASKET'),
  brand('groceries', 'Whole Foods', 'WHOLE FOODS'),
  brand('groceries', 'Tesco'),
  brand('groceries', "Sainsbury's", 'SAINSBURY', 'SAINSBURYS'),
  brand('groceries', 'Costco'),
  brand('groceries', "Trader Joe's", 'TRADER JOE', 'TRADER JOES'),
  generic('groceries', ['SUPERMARKET', 'GROCERY', 'GROCERIES', 'KIRANA', 'PROVISION STORE']),
  // Dining & delivery
  brand('dining', 'Uber Eats', 'UBER EATS', 'UBEREATS'),
  brand('dining', 'Pizza Hut', 'PIZZA HUT'),
  brand('dining', 'Burger King', 'BURGER KING'),
  brand('dining', 'Subway', 'SUBWAY'),
  brand('dining', "Haldiram's", 'HALDIRAM', 'HALDIRAMS'),
  brand('dining', 'Barbeque Nation', 'BARBEQUE NATION'),
  brand('dining', 'EatFit', 'EATFIT'),
  brand('dining', 'Box8', 'BOX8'),
  brand('dining', 'Rebel Foods', 'REBEL FOODS', 'FAASOS', 'BEHROUZ', 'OVENSTORY'),
  brand('dining', 'Wow! Momo', 'WOW MOMO'),
  brand('dining', 'Chai Point', 'CHAI POINT'),
  brand('dining', 'Magicpin', 'MAGICPIN'),
  brand('dining', 'Swiggy'),
  brand('dining', 'Zomato'),
  brand('dining', 'EatSure', 'EATSURE'),
  brand('dining', 'DoorDash', 'DOORDASH'),
  brand('dining', 'Deliveroo'),
  brand('dining', 'Starbucks'),
  brand('dining', "Domino's", 'DOMINOS', 'DOMINO S'),
  brand('dining', "McDonald's", 'MCDONALDS', 'MCDONALD S', 'MCDONALD'),
  brand('dining', 'KFC'),
  brand('dining', 'Chaayos'),
  brand('dining', 'Third Wave Coffee', 'THIRD WAVE'),
  brand('dining', 'Blue Tokai', 'BLUE TOKAI'),
  generic('dining', [
    'RESTAURANT',
    'CAFE',
    'COFFEE',
    'PIZZA',
    'BURGER',
    'BAKERY',
    'DHABA',
    'KITCHEN'
  ]),
  // Travel (before transport: IRCTC is rail travel)
  brand('travel', 'MakeMyTrip', 'MAKEMYTRIP', 'MMT'),
  brand('travel', 'Goibibo'),
  brand('travel', 'Yatra', 'YATRA'),
  brand('travel', 'EaseMyTrip', 'EASEMYTRIP', 'EASE MY TRIP'),
  brand('travel', 'ixigo', 'IXIGO'),
  brand('travel', 'redBus', 'REDBUS'),
  brand('travel', 'SpiceJet', 'SPICEJET'),
  brand('travel', 'Agoda', 'AGODA'),
  brand('travel', 'Cleartrip'),
  brand('travel', 'IRCTC'),
  brand('travel', 'IndiGo', 'INDIGO', 'INTERGLOBE'),
  brand('travel', 'Air India', 'AIR INDIA'),
  brand('travel', 'Akasa Air', 'AKASA'),
  brand('travel', 'Airbnb'),
  brand('travel', 'Booking.com', 'BOOKING COM'),
  brand('travel', 'OYO', 'OYO'),
  brand('travel', 'Expedia'),
  generic('travel', ['HOTEL', 'HOTELS', 'AIRLINES', 'AIRWAYS', 'RESORT']),
  // Transport
  brand('transport', 'Uber'),
  brand('transport', 'Ola', 'OLA', 'OLACABS', 'ANI TECHNOLOGIES'),
  brand('transport', 'Rapido'),
  brand('transport', 'Namma Yatri', 'NAMMA YATRI'),
  brand('transport', 'BluSmart', 'BLUSMART'),
  generic('transport', ['DMRC', 'BMRCL', 'METRO RAIL', 'MUMBAI METRO']),
  brand('transport', 'Lyft'),
  brand('transport', 'FASTag', 'FASTAG'),
  generic('transport', [
    'PETROL',
    'FUEL',
    'HPCL',
    'BPCL',
    'IOCL',
    'INDIAN OIL',
    'SHELL',
    'METRO',
    'PARKING',
    'TOLL',
    'CAB',
    'TAXI'
  ]),
  // Shopping
  brand('shopping', 'Amazon', 'AMAZON', 'AMZN', 'AMAZON PAY'),
  brand('shopping', 'Flipkart'),
  brand('shopping', 'Lenskart', 'LENSKART'),
  brand('shopping', 'FirstCry', 'FIRSTCRY'),
  brand('shopping', 'Pepperfry', 'PEPPERFRY'),
  brand('shopping', 'Urban Ladder', 'URBAN LADDER'),
  brand('shopping', 'Tanishq', 'TANISHQ', 'TITAN'),
  brand('shopping', 'Apple Store', 'APPLE STORE', 'APPLE INDIA'),
  brand('shopping', 'Samsung', 'SAMSUNG'),
  brand('shopping', 'Westside', 'WESTSIDE', 'TRENT'),
  brand('shopping', 'Lifestyle', 'LIFESTYLE'),
  brand('shopping', 'Shoppers Stop', 'SHOPPERS STOP'),
  brand('shopping', 'Purplle', 'PURPLLE'),
  brand('shopping', 'boAt', 'BOAT'),
  brand('shopping', 'Myntra'),
  brand('shopping', 'Ajio'),
  brand('shopping', 'Nykaa'),
  brand('shopping', 'IKEA'),
  brand('shopping', 'Decathlon'),
  brand('shopping', 'Croma'),
  brand('shopping', 'Reliance Digital', 'RELIANCE DIGITAL'),
  brand('shopping', 'Tata CLiQ', 'TATA CLIQ', 'TATACLIQ'),
  brand('shopping', 'Meesho'),
  brand('shopping', 'Uniqlo'),
  brand('shopping', 'Zara'),
  // Health & fitness
  brand('health', 'Apollo Pharmacy', 'APOLLO PHARMACY', 'APOLLO'),
  brand('health', 'PharmEasy', 'PHARMEASY'),
  brand('health', 'Tata 1mg', '1MG', 'TATA 1MG'),
  brand('health', 'Netmeds'),
  brand('health', 'MedPlus', 'MEDPLUS'),
  brand('health', 'Practo'),
  brand('health', 'HealthifyMe', 'HEALTHIFYME'),
  brand('health', 'Thyrocare', 'THYROCARE'),
  brand('health', 'Dr Lal PathLabs', 'DR LAL', 'LAL PATHLABS'),
  brand('health', 'Metropolis', 'METROPOLIS'),
  generic('health', ['FORTIS', 'MAX HEALTHCARE', 'MANIPAL HOSPITAL', 'NARAYANA', 'AIIMS']),
  brand('health', 'Cult.fit', 'CULTFIT', 'CULT FIT', 'CUREFIT'),
  generic('health', [
    'PHARMACY',
    'CHEMIST',
    'HOSPITAL',
    'CLINIC',
    'DIAGNOSTIC',
    'DIAGNOSTICS',
    'DENTAL',
    'GYM',
    'FITNESS'
  ]),
  // Insurance
  generic(
    'insurance',
    [
      'INSURANCE',
      'LOMBARD',
      'HDFC ERGO',
      'STAR HEALTH',
      'NIVA BUPA',
      'POLICYBAZAAR',
      'ACKO',
      'DIGIT INSURANCE',
      'MAX LIFE',
      'TATA AIA',
      'LIC',
      'PREMIUM',
      'POLICY'
    ],
    { direction: 'outflow', confidence: 0.75 }
  ),
  // Education
  generic('education', [
    'UPGRAD',
    'SIMPLILEARN',
    'SCALER',
    'GREAT LEARNING',
    'PHYSICS WALLAH',
    'VEDANTU',
    'DUOLINGO',
    'MASTERCLASS',
    'SKILLSHARE'
  ]),
  generic('education', [
    'UDEMY',
    'COURSERA',
    'SCHOOL',
    'COLLEGE',
    'UNIVERSITY',
    'TUITION',
    'UNACADEMY',
    'BYJUS',
    'EDUCATION'
  ]),
  // Entertainment
  brand('entertainment', 'BookMyShow', 'BOOKMYSHOW', 'BMS'),
  brand('entertainment', 'Cinepolis', 'CINEPOLIS'),
  brand('entertainment', 'Paytm Movies', 'PAYTM MOVIES', 'PAYTM INSIDER', 'INSIDER'),
  brand('entertainment', 'Xbox', 'XBOX'),
  brand('entertainment', 'Nintendo', 'NINTENDO'),
  brand('entertainment', 'Epic Games', 'EPIC GAMES'),
  brand('entertainment', 'Dream11', 'DREAM11'),
  brand('entertainment', 'Wonderla', 'WONDERLA'),
  brand('entertainment', 'Timezone', 'TIMEZONE'),
  brand('entertainment', 'PVR', 'PVR', 'PVR INOX', 'INOX'),
  brand('entertainment', 'Steam', 'STEAM', 'STEAMGAMES'),
  brand('entertainment', 'PlayStation', 'PLAYSTATION', 'SONY PLAYSTATION'),
  brand('entertainment', 'District', 'DISTRICT'),
  // Utilities
  brand('utilities', 'Airtel', 'AIRTEL'),
  brand('utilities', 'Jio', 'JIO', 'RELIANCE JIO'),
  brand('utilities', 'Vi', 'VODAFONE', 'VODAFONE IDEA'),
  brand('utilities', 'BSNL'),
  brand('utilities', 'ACT Fibernet', 'ACT FIBERNET'),
  brand('utilities', 'Tata Play', 'TATA PLAY', 'TATASKY'),
  generic('utilities', [
    'ELECTRICITY',
    'BESCOM',
    'TATA POWER',
    'ADANI ELECTRICITY',
    'MSEDCL',
    'BSES',
    'WATER',
    'GAS',
    'IGL',
    'MAHANAGAR GAS',
    'BROADBAND',
    'RECHARGE',
    'DTH',
    'POSTPAID',
    'PREPAID'
  ]),
  // Debt
  generic(
    'emi',
    ['EMI', 'LOAN', 'HOME LOAN', 'CAR LOAN', 'PERSONAL LOAN', 'BAJAJ FINANCE', 'BAJAJ FIN'],
    {
      direction: 'outflow',
      confidence: 0.8
    }
  ),
  // Investments & savings
  generic(
    'investments',
    [
      'SIP',
      'MUTUAL FUND',
      'MUTUAL FUNDS',
      'BSE STAR MF',
      'ZERODHA',
      'GROWW',
      'KUVERA',
      'INDMONEY',
      'PPF',
      'NPS',
      'RECURRING DEPOSIT',
      'FIXED DEPOSIT',
      'FD BOOKING',
      'SMALLCASE',
      'UPSTOX'
    ],
    { direction: 'outflow', confidence: 0.8 }
  ),
  // Cash
  generic('cash', ['ATM', 'CASH WITHDRAWAL', 'CASH WDL', 'ATW', 'NWD', 'ATM WDL'], {
    direction: 'outflow',
    merchant: 'ATM withdrawal',
    confidence: 0.9
  }),
  // Housing
  generic('housing', ['RENT', 'HOUSE RENT', 'MAINTENANCE', 'SOCIETY', 'NOBROKER', 'APARTMENT'], {
    direction: 'outflow'
  })
]

export class KeywordProvider implements CategorisationProvider {
  readonly name = 'keyword-rules'
  constructor(private readonly rules: readonly KeywordRule[] = KEYWORD_RULES) {}

  categorise(input: CategorisationInput): CategorisationResult | null {
    const text = normaliseForMatch(input.description)
    const inflow = input.amountMinor > 0
    for (const rule of this.rules) {
      if (rule.direction === 'inflow' && !inflow) continue
      if (rule.direction === 'outflow' && inflow) continue
      if (!rule.patterns.some((p) => containsWords(text, p))) continue
      let confidence = rule.confidence ?? 0.85
      // An inflow matched to a spending category is usually a refund: categorise but ask for review.
      if (inflow && rule.category !== 'income' && rule.category !== 'transfers') {
        confidence = Math.min(confidence, 0.55)
      }
      return {
        categoryId: rule.category,
        merchantNormalised: rule.merchant ?? cleanMerchantName(input.description),
        confidence,
        source: 'keyword'
      }
    }
    return null
  }
}

/** Always returns a result, with low confidence so the transaction lands in "Needs review". */
export class FallbackProvider implements CategorisationProvider {
  readonly name = 'fallback'
  categorise(input: CategorisationInput): CategorisationResult {
    return {
      categoryId: input.amountMinor > 0 ? 'income' : 'other',
      merchantNormalised: cleanMerchantName(input.description),
      confidence: input.amountMinor > 0 ? 0.3 : 0.2,
      source: 'fallback'
    }
  }
}

// ---------- Auto-debits & AI memory ----------

const AUTO_DEBIT_PATTERNS = [
  'NACH',
  'ACH',
  'ACH D',
  'ECS',
  'SI',
  'STANDING INSTRUCTION',
  'MANDATE',
  'AUTOPAY',
  'AUTO DEBIT',
  'AUTODEBIT',
  'E MANDATE',
  'EMANDATE',
  'UPI MANDATE',
  'UPI AUTOPAY',
  'RECURRING MANDATE',
  'NACH DR'
]

/**
 * True when the bank pulled the money on a standing mandate (NACH/ECS/ACH/SI/autopay).
 * These usually go to a loan EMI, a SIP/RD, insurance or a subscription — never a one-off shop.
 */
export function isAutoDebit(description: string): boolean {
  const text = normaliseForMatch(description)
  return AUTO_DEBIT_PATTERNS.some((p) => containsWords(text, p))
}

/** Key the AI's answer for a merchant is remembered under (direction matters: refunds vs spends). */
export function aiMemoryKey(description: string, amountMinor: number): string {
  return `${amountMinor > 0 ? 'in' : 'out'}:${merchantKey(cleanMerchantName(description))}`
}

export const AI_CATEGORY_CONFIDENCE = 0.75

/** Re-applies categories the AI already decided for a merchant, so future imports don't ask again. */
export class AiMemoryProvider implements CategorisationProvider {
  readonly name = 'ai-memory'
  constructor(private readonly memory: ReadonlyMap<string, string>) {}

  categorise(input: CategorisationInput): CategorisationResult | null {
    const categoryId = this.memory.get(aiMemoryKey(input.description, input.amountMinor))
    if (!categoryId) return null
    return {
      categoryId,
      merchantNormalised: cleanMerchantName(input.description),
      confidence: AI_CATEGORY_CONFIDENCE,
      source: 'ai'
    }
  }
}

export class Categoriser {
  private readonly providers: CategorisationProvider[]
  private readonly fallback = new FallbackProvider()

  constructor(userRules: readonly MerchantRule[], extraProviders: CategorisationProvider[] = []) {
    this.providers = [new UserRuleProvider(userRules), new KeywordProvider(), ...extraProviders]
  }

  categorise(input: CategorisationInput): CategorisationResult {
    for (const provider of this.providers) {
      const result = provider.categorise(input)
      if (result) return result
    }
    return this.fallback.categorise(input)
  }
}
