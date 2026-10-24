/**
 * Knowledge base: the best ways to pay at common Indian merchants and categories — which card,
 * which UPI app, which platform route — and how they stack. Indicative only; offers change often.
 */

export interface PayRoute {
  /** card = pay with this card; upi = pay via this UPI app; route = a buying route (gift cards, portal…). */
  kind: 'card' | 'upi' | 'route'
  /** Card id (cards.ts) or UPI app id (upiApps.ts) when applicable. */
  ref?: string
  label: string
  /** Effective reward/discount as a decimal. */
  rate: number
  how: string
}

export interface PlaybookEntry {
  id: string
  label: string
  /** Lowercase merchant fragments. */
  match?: string[]
  /** Category ids (used when no merchant matches). */
  categories?: string[]
  routes: PayRoute[]
  /** How the routes combine. */
  stack?: string
  avoid?: string
}

export const PLAYBOOK: PlaybookEntry[] = [
  // ---------- Specific merchants ----------
  {
    id: 'swiggy',
    label: 'Swiggy food & Dineout',
    match: ['swiggy', 'dineout'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-swiggy-blck',
        label: 'Swiggy HDFC BLCK',
        rate: 0.1,
        how: 'Pay in the Swiggy app (orders ₹249+). Ornge variant earns 5%.'
      },
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Food delivery/dining category; shared ₹1,200/month cap.'
      },
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Online spend (cap ₹2,000/cycle from Apr 2026).'
      }
    ],
    stack:
      'Swiggy One + bank offers; Swiggy vouchers via SmartBuy (Infinia/DCB, within the voucher cap).',
    avoid: 'Swiggy HDFC orders under ₹249 earn nothing.'
  },
  {
    id: 'instamart',
    label: 'Swiggy Instamart',
    match: ['instamart'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-swiggy-blck',
        label: 'Swiggy HDFC BLCK',
        rate: 0.1,
        how: 'Orders ₹249+; shared cap.'
      },
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Grocery category (shared cap).'
      },
      { kind: 'card', ref: 'sbi-cashback', label: 'SBI Cashback', rate: 0.05, how: 'Online spend.' }
    ]
  },
  {
    id: 'zomato',
    label: 'Zomato & District',
    match: ['zomato', 'district'],
    routes: [
      {
        kind: 'card',
        ref: 'axis-airtel',
        label: 'Airtel Axis',
        rate: 0.1,
        how: '10% as partner credit (₹499+ orders, ₹200/brand/month).'
      },
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Food delivery category; shared ₹1,200/month cap.'
      },
      { kind: 'card', ref: 'sbi-cashback', label: 'SBI Cashback', rate: 0.05, how: 'Online spend.' }
    ],
    stack: 'Zomato Gold + Zomato vouchers via Gyftr/SmartBuy.'
  },
  {
    id: 'blinkit',
    label: 'Blinkit',
    match: ['blinkit'],
    routes: [
      {
        kind: 'card',
        ref: 'axis-airtel',
        label: 'Airtel Axis',
        rate: 0.1,
        how: 'Blinkit is a 10% partner since Apr 2026 (capped).'
      },
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Grocery category.'
      },
      { kind: 'card', ref: 'sbi-cashback', label: 'SBI Cashback', rate: 0.05, how: 'Online spend.' }
    ]
  },
  {
    id: 'zepto',
    label: 'Zepto',
    match: ['zepto'],
    routes: [
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'If it codes as grocery (verify on your statement).'
      },
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Online spend.'
      },
      {
        kind: 'upi',
        ref: 'kiwi',
        label: 'Kiwi RuPay on UPI',
        rate: 0.005,
        how: 'Online UPI only 0.5% (1.5% is for Scan & Pay).'
      }
    ]
  },
  {
    id: 'bigbasket',
    label: 'BigBasket',
    match: ['bigbasket', 'bbnow'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-tata-neu-infinity',
        label: 'Tata Neu Infinity HDFC',
        rate: 0.05,
        how: 'Pay in the Tata Neu/BigBasket app for NeuCoins.'
      },
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Grocery category, if coded that way.'
      },
      { kind: 'card', ref: 'sbi-cashback', label: 'SBI Cashback', rate: 0.05, how: 'Online spend.' }
    ],
    avoid: 'Non-Tata cards no longer earn NeuCoins (2026).'
  },
  {
    id: 'amazon',
    label: 'Amazon',
    match: ['amazon', 'amzn'],
    routes: [
      {
        kind: 'card',
        ref: 'icici-amazon-pay',
        label: 'Amazon Pay ICICI',
        rate: 0.05,
        how: '5% with Prime, 3% without; Amazon flights/hotels excluded from 2026.'
      },
      {
        kind: 'route',
        label: 'Amazon Pay gift card via HDFC SmartBuy (Infinia/DCB)',
        rate: 0.13,
        how: 'Buy the voucher on SmartBuy (5X minus ~3.5% fee), within the 3,000 RP/month voucher cap.'
      },
      { kind: 'card', ref: 'sbi-cashback', label: 'SBI Cashback', rate: 0.05, how: 'Online spend.' }
    ],
    stack: 'Gift-card balance + bank sale offers.',
    avoid: 'Loading Amazon Pay wallet ≥ ₹5K with Amazon Pay ICICI (1% fee).'
  },
  {
    id: 'flipkart',
    label: 'Flipkart',
    match: ['flipkart'],
    routes: [
      {
        kind: 'card',
        ref: 'axis-flipkart',
        label: 'Flipkart Axis',
        rate: 0.05,
        how: 'Capped ₹4,000/quarter.'
      },
      {
        kind: 'card',
        ref: 'sbi-flipkart',
        label: 'Flipkart SBI',
        rate: 0.05,
        how: 'Capped ₹4,000/quarter.'
      },
      { kind: 'card', ref: 'sbi-cashback', label: 'SBI Cashback', rate: 0.05, how: 'Online spend.' }
    ],
    stack: 'Card cashback + Flipkart bank-sale instant discounts.'
  },
  {
    id: 'myntra',
    label: 'Myntra',
    match: ['myntra'],
    routes: [
      {
        kind: 'card',
        ref: 'axis-flipkart',
        label: 'Flipkart Axis',
        rate: 0.075,
        how: 'Capped ₹4,000/quarter.'
      },
      {
        kind: 'card',
        ref: 'jupiter-edge-plus-csb',
        label: 'Jupiter Edge+',
        rate: 0.07,
        how: 'Via Jupiter UPI; needs ₹15K spend/cycle.'
      },
      {
        kind: 'card',
        ref: 'hdfc-regalia-gold',
        label: 'HDFC Regalia Gold',
        rate: 0.06,
        how: '5X partner merchant.'
      }
    ]
  },
  {
    id: 'ajio',
    label: 'AJIO & JioMart',
    match: ['ajio', 'jiomart'],
    routes: [
      {
        kind: 'card',
        ref: 'sbi-reliance-prime',
        label: 'Reliance SBI PRIME',
        rate: 0.05,
        how: 'AJIO/JioMart accelerated.'
      },
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Online spend.'
      },
      {
        kind: 'route',
        label: 'AJIO voucher via Gyftr/SmartBuy',
        rate: 0.08,
        how: 'Voucher discount + card points.'
      }
    ]
  },
  {
    id: 'nykaa',
    label: 'Nykaa',
    match: ['nykaa'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-regalia-gold',
        label: 'HDFC Regalia Gold',
        rate: 0.06,
        how: '5X partner merchant.'
      },
      { kind: 'card', ref: 'sbi-cashback', label: 'SBI Cashback', rate: 0.05, how: 'Online spend.' }
    ]
  },
  {
    id: 'tata-neu',
    label: 'Tata Neu brands (Croma, Westside, 1mg, Tata CLiQ, Zudio)',
    match: ['tata neu', 'croma', 'westside', 'tata 1mg', '1mg', 'tata cliq', 'zudio', 'tata play'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-tata-neu-infinity',
        label: 'Tata Neu Infinity HDFC',
        rate: 0.05,
        how: 'Pay in the Tata Neu app/site for 5% NeuCoins (+ NeuPass).'
      },
      {
        kind: 'route',
        label: 'Croma/Tata vouchers via SmartBuy',
        rate: 0.1,
        how: 'Premium HDFC cards, within the voucher cap.'
      }
    ],
    avoid: 'In-store with a non-Tata card earns no NeuCoins.'
  },
  {
    id: 'reliance',
    label: 'Reliance Digital, Trends & Smart Bazaar',
    match: ['reliance digital', 'reliance trends', 'reliance retail', 'smart bazaar'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-regalia-gold',
        label: 'HDFC Regalia Gold',
        rate: 0.06,
        how: 'Reliance Digital is a 5X partner.'
      },
      {
        kind: 'card',
        ref: 'sbi-reliance-prime',
        label: 'Reliance SBI PRIME',
        rate: 0.025,
        how: 'Reliance Retail accelerated.'
      },
      {
        kind: 'route',
        label: 'Reliance vouchers via SmartBuy/Gyftr',
        rate: 0.08,
        how: 'Buy before an in-store purchase.'
      }
    ]
  },
  {
    id: 'dmart',
    label: 'DMart & supermarkets',
    match: ['dmart', 'avenue supermarts', 'more retail', 'star bazaar', 'spencer'],
    routes: [
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Supermarket/grocery category; shared cap.'
      },
      {
        kind: 'card',
        ref: 'sbi-elite',
        label: 'SBI ELITE / PRIME',
        rate: 0.025,
        how: '5X on grocery/department stores.'
      },
      {
        kind: 'upi',
        ref: 'kiwi',
        label: 'Kiwi Scan & Pay',
        rate: 0.015,
        how: 'RuPay credit on the store QR.'
      }
    ]
  },
  {
    id: 'cabs',
    label: 'Uber, Ola, Rapido & Namma Yatri',
    match: ['uber', 'ola', 'rapido', 'namma yatri'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-millennia',
        label: 'HDFC Millennia',
        rate: 0.05,
        how: 'Uber is a 5% partner (capped).'
      },
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'In-app card payment counts as online.'
      },
      {
        kind: 'upi',
        ref: 'kiwi',
        label: 'Kiwi Scan & Pay',
        rate: 0.015,
        how: 'For autos paid by QR.'
      }
    ]
  },
  {
    id: 'irctc',
    label: 'IRCTC trains',
    match: ['irctc'],
    routes: [
      {
        kind: 'route',
        label: 'IRCTC via UPI (RuPay credit, e.g. Kiwi)',
        rate: 0.005,
        how: 'UPI has the lowest IRCTC convenience fee.'
      },
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Online spend if not excluded as railway — check your statement.'
      }
    ],
    avoid: 'Many cards exclude or cap rail spends; IDFC charges 1% above ₹25K/cycle.'
  },
  {
    id: 'flights',
    label: 'Flights (MakeMyTrip, Cleartrip, airlines)',
    match: [
      'makemytrip',
      'cleartrip',
      'goibibo',
      'ixigo',
      'indigo',
      'air india',
      'akasa',
      'spicejet',
      'easemytrip',
      'yatra'
    ],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-infinia',
        label: 'Infinia / Diners Black via SmartBuy',
        rate: 0.165,
        how: 'Book flights on SmartBuy for 5X.'
      },
      {
        kind: 'card',
        ref: 'axis-atlas',
        label: 'Axis Atlas',
        rate: 0.075,
        how: 'Airline direct / Travel EDGE: 5 EDGE Miles per ₹100.'
      },
      {
        kind: 'card',
        ref: 'hdfc-regalia-gold',
        label: 'HDFC Regalia Gold via SmartBuy',
        rate: 0.0625,
        how: '5X on SmartBuy flights.'
      },
      {
        kind: 'card',
        ref: 'scapia-federal',
        label: 'Scapia',
        rate: 0.04,
        how: 'Book in the Scapia app.'
      }
    ],
    stack: 'OTA card offers + SmartBuy cashback offers.',
    avoid: 'Amazon Pay ICICI on Amazon flights (excluded from 2026).'
  },
  {
    id: 'hotels',
    label: 'Hotels',
    match: ['marriott', 'ihg', 'accor', 'agoda', 'booking com', 'oyo', 'hyatt', 'taj'],
    routes: [
      {
        kind: 'card',
        ref: 'hdfc-infinia',
        label: 'Infinia via SmartBuy hotels',
        rate: 0.33,
        how: '10X on SmartBuy hotels (Diners Black 5X).'
      },
      {
        kind: 'card',
        ref: 'hdfc-marriott-bonvoy',
        label: 'Marriott Bonvoy HDFC',
        rate: 0.032,
        how: 'Marriott properties + elite nights.'
      },
      {
        kind: 'card',
        ref: 'hsbc-travelone',
        label: 'HSBC TravelOne',
        rate: 0.03,
        how: 'Travel 2X, transfer 1:1 to Accor/Marriott.'
      }
    ]
  },
  {
    id: 'movies',
    label: 'BookMyShow & PVR INOX',
    match: ['bookmyshow', 'pvr', 'inox', 'cinepolis'],
    routes: [
      {
        kind: 'route',
        label: 'Card buy-one-get-one offers (Axis, Kotak, SBI ELITE, ICICI)',
        rate: 0.5,
        how: 'BOGO on tickets; ICICI needs ₹25K quarterly spend.'
      },
      {
        kind: 'card',
        ref: 'kotak-pvr-inox',
        label: 'Kotak PVR INOX',
        rate: 0.05,
        how: 'Free tickets per ₹10K spend + 5% off.'
      },
      {
        kind: 'card',
        ref: 'hdfc-millennia',
        label: 'HDFC Millennia',
        rate: 0.05,
        how: 'BookMyShow is a 5% partner.'
      }
    ]
  },
  {
    id: 'airtel',
    label: 'Airtel postpaid, broadband & DTH',
    match: ['airtel'],
    routes: [
      {
        kind: 'card',
        ref: 'axis-airtel',
        label: 'Airtel Axis via Airtel Thanks',
        rate: 0.25,
        how: '25%, capped at 2× your base cashback that month (from Apr 2026).'
      },
      {
        kind: 'card',
        ref: 'icici-amazon-pay',
        label: 'Amazon Pay ICICI',
        rate: 0.02,
        how: 'Via Amazon Pay recharge (partner rate).'
      }
    ]
  },
  {
    id: 'recharges',
    label: 'Jio, Vi & DTH recharges',
    match: ['jio', 'vodafone idea', 'vi recharge', 'dish tv', 'd2h', 'sun direct'],
    routes: [
      {
        kind: 'card',
        ref: 'sbi-phonepe-select-black',
        label: 'PhonePe SBI SELECT BLACK',
        rate: 0.1,
        how: '10% on recharges via PhonePe (capped).'
      },
      {
        kind: 'card',
        ref: 'axis-ace',
        label: 'Axis ACE via Google Pay',
        rate: 0.05,
        how: 'Recharges through Google Pay (shared ₹500 cap).'
      },
      {
        kind: 'card',
        ref: 'icici-amazon-pay',
        label: 'Amazon Pay ICICI',
        rate: 0.02,
        how: 'Recharge in Amazon Pay.'
      }
    ],
    avoid: 'App convenience fees when paying by card.'
  },
  {
    id: 'fuel',
    label: 'Fuel (IndianOil, BPCL, HPCL)',
    match: [
      'indianoil',
      'indian oil',
      'iocl',
      'bharat petroleum',
      'bpcl',
      'hpcl',
      'hindustan petroleum',
      'shell',
      'petrol',
      'filling station'
    ],
    routes: [
      {
        kind: 'card',
        ref: 'rbl-indianoil-xtra',
        label: 'IndianOil RBL XTRA',
        rate: 0.085,
        how: 'Up to 8.5% at IOCL incl. surcharge waiver.'
      },
      {
        kind: 'card',
        ref: 'sbi-bpcl-octane',
        label: 'SBI BPCL Octane',
        rate: 0.0725,
        how: 'Up to 7.25% at BPCL.'
      },
      {
        kind: 'card',
        ref: 'idfc-first-power-plus',
        label: 'IDFC FIRST Power+',
        rate: 0.05,
        how: 'At HPCL (+ groceries/bills 5%).'
      },
      {
        kind: 'card',
        ref: 'hdfc-indianoil',
        label: 'HDFC IndianOil',
        rate: 0.05,
        how: 'At IOCL; fee waived at ₹50K/year.'
      }
    ],
    stack: 'Fuel cards also waive the 1% fuel surcharge.',
    avoid: 'Premium/travel cards earn nothing on fuel and add a 1% surcharge.'
  },
  {
    id: 'insurance',
    label: 'Insurance premiums',
    match: ['lic', 'hdfc life', 'icici prudential', 'star health', 'acko', 'policybazaar'],
    routes: [
      {
        kind: 'card',
        ref: 'idfc-lic-select',
        label: 'IDFC LIC Select',
        rate: 0.02,
        how: 'LIC premiums on licindia.in (first 5 per cycle).'
      },
      {
        kind: 'card',
        ref: 'sc-ultimate',
        label: 'SC Ultimate',
        rate: 0.02,
        how: '3 RP/₹150 on insurance.'
      },
      {
        kind: 'card',
        ref: 'hdfc-infinia',
        label: 'HDFC Infinia / DCB',
        rate: 0.033,
        how: 'Earns, with a monthly insurance cap.'
      }
    ],
    avoid: 'YES Marquee, Scapia and many ICICI cards give nothing on insurance.'
  },
  {
    id: 'education',
    label: 'Education fees',
    match: ['school', 'university', 'college', 'flywire'],
    routes: [
      {
        kind: 'route',
        label: 'Pay directly on the institution’s site/POS',
        rate: 0,
        how: 'Avoids the ~1% fee banks charge via third-party apps (CRED, PayZapp…).'
      },
      {
        kind: 'card',
        ref: 'sc-ultimate',
        label: 'SC Ultimate',
        rate: 0.02,
        how: 'Schools earn 3 RP/₹150.'
      }
    ],
    avoid: 'Third-party education payments on HDFC/SBI/ICICI (1% fee, usually no rewards).'
  },
  {
    id: 'rent',
    label: 'Rent',
    match: ['nobroker', 'redgirraffe', 'rent pay', 'housing com'],
    categories: ['housing'],
    routes: [
      {
        kind: 'route',
        label: 'Bank transfer / UPI from savings',
        rate: 0,
        how: 'No fee — the default.'
      },
      {
        kind: 'card',
        ref: 'hsbc-premier',
        label: 'HSBC Premier via NoBrokerPay',
        rate: 0.015,
        how: 'Reportedly still earns, net of ~0.5–1.2% platform fee.'
      }
    ],
    avoid:
      'Most issuers give zero rewards on rent plus a 1% fee in 2026; only worth it to hit a fee waiver or milestone.'
  },
  {
    id: 'gold',
    label: 'Gold & jewellery',
    match: ['tanishq', 'kalyan', 'malabar', 'caratlane', 'mmtc'],
    routes: [
      {
        kind: 'route',
        label: 'Tanishq/CaratLane vouchers via SmartBuy',
        rate: 0.06,
        how: 'HDFC premium cards, within the voucher cap.'
      },
      {
        kind: 'card',
        ref: 'hdfc-tata-neu-infinity',
        label: 'Tata Neu Infinity',
        rate: 0.015,
        how: 'Tanishq via Tata Neu (partner rate unverified).'
      }
    ],
    avoid: 'Many cards exclude jewellery; never buy digital gold on a credit card.'
  },
  {
    id: 'international',
    label: 'International & foreign-currency spends',
    match: [
      'usd',
      'eur',
      'gbp',
      'aed',
      'sgd',
      'forex',
      'intl',
      'international',
      'cross currency',
      'duty free'
    ],
    routes: [
      {
        kind: 'card',
        ref: 'scapia-federal',
        label: 'Scapia (0% forex)',
        rate: 0.055,
        how: 'Saves the ~3.5% markup + 2% coins.'
      },
      {
        kind: 'card',
        ref: 'hsbc-premier',
        label: 'HSBC Premier (0.99% forex)',
        rate: 0.055,
        how: 'Low markup + 3% points.'
      },
      {
        kind: 'card',
        ref: 'idfc-first-wow',
        label: 'IDFC FIRST WOW! (0% forex)',
        rate: 0.04,
        how: 'Lifetime free, FD-backed; keeps international rewards.'
      },
      {
        kind: 'card',
        ref: 'au-zenith-plus',
        label: 'AU Zenith+ (0.99% forex)',
        rate: 0.035,
        how: 'Low markup + 2 RP/₹100.'
      }
    ],
    avoid:
      'Always decline DCC and pay in local currency; avoid 3.5%-markup cards. Most IDFC cards stop earning on international spends from 26 Oct 2026 (0% forex stays).'
  },
  {
    id: 'app-subscriptions',
    label: 'Apple, Google Play & YouTube subscriptions',
    match: ['apple com', 'itunes', 'google play', 'google one', 'youtube premium'],
    routes: [
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Online spend.'
      },
      { kind: 'card', ref: 'yes-marquee', label: 'YES Marquee', rate: 0.045, how: 'Online spend.' }
    ],
    avoid: 'Mandates above ₹15K need extra authentication (RBI e-mandate rule).'
  },
  {
    id: 'ott-saas',
    label: 'Netflix, Spotify, Hotstar & SaaS',
    match: [
      'netflix',
      'spotify',
      'hotstar',
      'jiohotstar',
      'prime video',
      'chatgpt',
      'openai',
      'notion',
      'adobe',
      'aws',
      'github',
      'figma',
      'canva'
    ],
    routes: [
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'INR-billed online.'
      },
      {
        kind: 'card',
        ref: 'scapia-federal',
        label: 'Scapia for USD-billed SaaS',
        rate: 0.055,
        how: '0% forex on USD bills + 2% coins.'
      }
    ],
    avoid: 'USD-billed SaaS on 3.5%-markup cards.'
  },
  {
    id: 'vouchers',
    label: 'Gift-card & voucher routes',
    match: ['gyftr', 'smartbuy', 'grab deals', 'ishop', 'woohoo'],
    routes: [
      {
        kind: 'route',
        label: 'HDFC SmartBuy (Gyftr) vouchers',
        rate: 0.165,
        how: 'Infinia/DCB 5X; capped 3,000 RP/month from Jul 2026 (~₹22.5K spend).'
      },
      {
        kind: 'route',
        label: 'Axis Grab Deals',
        rate: 0.05,
        how: 'Extra cashback on partner merchants for Axis cards.'
      },
      {
        kind: 'route',
        label: 'ICICI iShop',
        rate: 0.03,
        how: 'Cut from 18% to 3% (Feb 2026); voucher fee 3.5% + GST.'
      }
    ],
    stack: 'Voucher discount + card points + merchant sale/bank offer.',
    avoid: 'Voucher fees above the reward earned; buying beyond the monthly caps.'
  },

  // ---------- Generic categories (when no merchant above matches) ----------
  {
    id: 'dining-out',
    label: 'Restaurants & cafés',
    categories: ['dining'],
    routes: [
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Dining category; shared ₹1,200/month cap.'
      },
      {
        kind: 'route',
        label: 'Swiggy Dineout / District / EazyDiner bill pay',
        rate: 0.15,
        how: 'Platform discount, then pay with Swiggy HDFC BLCK or Airtel Axis.'
      },
      {
        kind: 'card',
        ref: 'yes-paisasave',
        label: 'YES PaisaSave',
        rate: 0.06,
        how: '6% dining (cap ₹3,000/month).'
      }
    ]
  },
  {
    id: 'groceries',
    label: 'Groceries',
    categories: ['groceries'],
    routes: [
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Grocery category (shared cap).'
      },
      {
        kind: 'card',
        ref: 'idfc-first-power-plus',
        label: 'IDFC FIRST Power+',
        rate: 0.05,
        how: 'Groceries 5% (capped).'
      },
      {
        kind: 'upi',
        ref: 'kiwi',
        label: 'Kiwi Scan & Pay',
        rate: 0.015,
        how: 'RuPay credit on the shop QR.'
      }
    ]
  },
  {
    id: 'shopping',
    label: 'Online shopping (other sites)',
    categories: ['shopping'],
    routes: [
      {
        kind: 'card',
        ref: 'hsbc-live-plus',
        label: 'HSBC Live+',
        rate: 0.1,
        how: 'Shopping added to 10% (Jul 2026; shared cap).'
      },
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Any online merchant.'
      },
      {
        kind: 'card',
        ref: 'idfc-hello-cashback',
        label: 'IDFC Hello Cashback',
        rate: 0.03,
        how: '3% online (5% above ₹10K/cycle).'
      }
    ]
  },
  {
    id: 'bills',
    label: 'Electricity, gas, water & broadband',
    categories: ['utilities'],
    routes: [
      {
        kind: 'card',
        ref: 'axis-airtel',
        label: 'Airtel Axis via Airtel Thanks',
        rate: 0.1,
        how: 'Utilities (capped at your base cashback).'
      },
      {
        kind: 'card',
        ref: 'sbi-phonepe-select-black',
        label: 'PhonePe SBI SELECT BLACK',
        rate: 0.1,
        how: 'Bills via PhonePe (capped).'
      },
      {
        kind: 'card',
        ref: 'axis-ace',
        label: 'Axis ACE via Google Pay',
        rate: 0.05,
        how: 'Bills through Google Pay.'
      }
    ],
    avoid: 'Many issuers charge 1% on utility spends above ₹50K/month.'
  },
  {
    id: 'travel',
    label: 'Travel bookings',
    categories: ['travel'],
    routes: [
      {
        kind: 'card',
        ref: 'axis-atlas',
        label: 'Axis Atlas',
        rate: 0.075,
        how: 'Travel 5 EDGE Miles/₹100.'
      },
      {
        kind: 'card',
        ref: 'hdfc-regalia-gold',
        label: 'HDFC Regalia Gold via SmartBuy',
        rate: 0.0625,
        how: '5X on SmartBuy.'
      },
      {
        kind: 'card',
        ref: 'scapia-federal',
        label: 'Scapia',
        rate: 0.04,
        how: 'Book in the Scapia app.'
      }
    ]
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions & software',
    categories: ['subscriptions', 'software'],
    routes: [
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Online spend.'
      },
      { kind: 'card', ref: 'yes-marquee', label: 'YES Marquee', rate: 0.045, how: 'Online spend.' }
    ]
  },
  {
    id: 'entertainment',
    label: 'Movies, events & games',
    categories: ['entertainment'],
    routes: [
      {
        kind: 'card',
        ref: 'bob-eterna-rupay',
        label: 'BOBCARD Eterna',
        rate: 0.0375,
        how: 'Movies/online 3.75% (capped).'
      },
      {
        kind: 'card',
        ref: 'sbi-cashback',
        label: 'SBI Cashback',
        rate: 0.05,
        how: 'Online bookings.'
      }
    ]
  },
  {
    id: 'upi-shops',
    label: 'Small shops paid by UPI QR',
    match: ['kirana', 'bharatpe', 'paytm qr', 'phonepe qr'],
    categories: ['groceries', 'dining', 'shopping', 'transport', 'health', 'other'],
    routes: [
      {
        kind: 'upi',
        ref: 'super-money',
        label: 'super.money + Axis SuperMoney RuPay',
        rate: 0.03,
        how: 'Capped ₹300/month and needs matching 1% spend elsewhere; nothing under ₹100.'
      },
      {
        kind: 'upi',
        ref: 'kiwi',
        label: 'Kiwi RuPay Scan & Pay',
        rate: 0.015,
        how: 'Scan the same QR in Kiwi (Neon tier 2–5%).'
      },
      {
        kind: 'card',
        ref: 'hdfc-tata-neu-infinity',
        label: 'Tata Neu Infinity RuPay via @tataneu',
        rate: 0.015,
        how: 'Capped 500 NeuCoins/month.'
      },
      {
        kind: 'card',
        ref: 'idfc-quantum-plus',
        label: 'IDFC Quantum+ (FD-backed)',
        rate: 0.01,
        how: 'Scan & Pay via IDFC app; credit builder.'
      }
    ],
    avoid:
      'Paying UPI straight from your bank earns nothing; credit-card UPI works only for merchant (not personal) QRs.'
  }
]

export const PLAYBOOK_AS_OF = 'October 2026'

/** General principles the AI should apply when advising how to pay. */
export const PAYMENT_PRINCIPLES = [
  'Paying UPI from a bank account earns nothing; a RuPay credit card on UPI or a cashback UPI app earns 1–2% on the same QR.',
  'Card rewards, merchant coupons and bank-sale instant discounts usually stack; two UPI-app cashbacks do not.',
  'Co-branded cards win at their own brand (Swiggy HDFC on Swiggy, Amazon Pay ICICI on Amazon); a flat 1.5% card wins everywhere else.',
  'Two cards cover most people: one co-branded card for the single biggest merchant + one flat-rate or UPI RuPay card.',
  'Fuel needs a fuel card (surcharge waiver); rent, EMIs, insurance, wallets and government payments rarely earn rewards.',
  'Abroad, use a zero/low-forex card and pay in local currency.',
  'Reward caps matter: past the monthly cap, switch to the next-best card.',
  'Always pay the full statement balance — card interest wipes out any reward.',
  '2026 reality: many cards were devalued (HDFC, SBI, Axis, ICICI, IDFC). Caps matter more than headline rates — e.g. SBI Cashback 5% capped ₹2,000/cycle, Airtel Axis 25% capped at 2× base, SmartBuy vouchers capped 3,000 RP/month.',
  'Decline dynamic currency conversion (DCC) abroad and on foreign websites; DCC fees rose in 2026.',
  'Most IDFC FIRST cards have 0% forex but stop earning on international spends from 26 Oct 2026 (except Ashva, Mayura, Gaj, WOW!, WOW! Black, IndiGo).'
]
