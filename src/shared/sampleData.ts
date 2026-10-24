/**
 * Deterministic, fully synthetic sample statements for "explore with sample data" and the
 * development fixture. No real people, accounts or reference numbers.
 *
 * Self-contained on purpose (type-only imports) so `scripts/generate-fixture.ts` can run it with
 * plain Node type stripping.
 */
import type { AccountType } from './types'

export interface SampleStatement {
  filename: string
  accountName: string
  accountType: AccountType
  positiveMeans: 'inflow' | 'outflow'
  csv: string
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')
const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Rupees with paise as integer paise. */
const rupees = (r: number): number => Math.round(r * 100)

function money(paise: number, commas = true): string {
  const abs = Math.abs(paise)
  const int = Math.floor(abs / 100)
  const frac = pad(abs % 100)
  const intStr = commas ? int.toLocaleString('en-IN') : String(int)
  return `${intStr}.${frac}`
}

function csvLine(cells: string[]): string {
  return cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')
}

interface Event {
  date: string // YYYY-MM-DD
  description: string
  amount: number // paise, +in / -out
}

export function generateSampleStatements(endDate: string, seed = 42): SampleStatement[] {
  const rand = mulberry32(seed)
  const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1))
  const ref = (len = 12): string => Array.from({ length: len }, () => between(0, 9)).join('')

  const [ey, em, ed] = endDate.split('-').map(Number) as [number, number, number]
  const endIsMonthEnd = ed === daysIn(ey, em)
  const months: { y: number; m: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const total = ey * 12 + (em - 1) - i
    months.push({ y: Math.floor(total / 12), m: (total % 12) + 1 })
  }
  // The "story" month is the last complete month: dining spike, annual insurance, a fee.
  const storyIndex = endIsMonthEnd ? 5 : 4

  const bank: Event[] = []
  const card: Event[] = []
  const d = (y: number, m: number, day: number): string =>
    `${y}-${pad(m)}-${pad(Math.min(day, daysIn(y, m)))}`

  let previousCardTotal = 0
  months.forEach(({ y, m }, idx) => {
    const story = idx === storyIndex
    const mon = MON[m - 1]!.toUpperCase()

    // ----- Bank account -----
    bank.push({
      date: d(y, m, 1),
      description: `NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY ${mon}`,
      amount: rupees(185000)
    })
    bank.push({
      date: d(y, m, 3),
      description: `UPI/${ref()}/HOUSE RENT/landlord.rent@okbank/Rent ${mon}`,
      amount: -rupees(42000)
    })
    bank.push({
      date: d(y, m, 5),
      description: `NACH DR-CAR LOAN EMI-${ref(8)}`,
      amount: -rupees(12400)
    })
    bank.push({
      date: d(y, m, 7),
      description: `ACH D- BSE STAR MF SIP-${ref(9)}`,
      amount: -rupees(15000)
    })
    bank.push({
      date: d(y, m, 10),
      description: `BBPS/ELECTRICITY/TATA POWER/${ref(10)}`,
      amount: -rupees(between(1950, 2450))
    })
    bank.push({
      date: d(y, m, 12),
      description: `UPI/${ref()}/AIRTEL BROADBAND/airtel.bb@okbank/Bill`,
      amount: -rupees(999)
    })
    for (const day of [6, 13, 20, 27]) {
      const shop = rand() < 0.7 ? 'BIGBASKET' : 'DMART'
      bank.push({
        date: d(y, m, day),
        description: `UPI/${ref()}/${shop}/${shop.toLowerCase()}@okbank/Groceries`,
        amount: -rupees(between(1800, 3600))
      })
    }
    bank.push({
      date: d(y, m, 15),
      description: `ATM WDL-ATM ${ref(4)} MG ROAD`,
      amount: -rupees(5000)
    })
    if (previousCardTotal > 0) {
      bank.push({
        date: d(y, m, 18),
        description: 'CC BILL PAYMENT - CARD XX9921',
        amount: -previousCardTotal
      })
    }
    if (m % 3 === 0) {
      bank.push({
        date: d(y, m, 28),
        description: `INT.PD:${pad(1)}-${pad(m - 2)}-${y} TO ${daysIn(y, m)}-${pad(m)}-${y}`,
        amount: rupees(between(1100, 1400))
      })
      bank.push({ date: d(y, m, 28), description: 'SMS ALERT CHARGES QTR', amount: -rupees(17.7) })
    }
    if (idx === storyIndex - 2) {
      bank.push({
        date: d(y, m, 22),
        description: `UPI/${ref()}/RAVI K/ravik@okbank/Shared trip`,
        amount: -rupees(6000)
      })
    }
    if (idx === storyIndex - 1) {
      bank.push({
        date: d(y, m, 24),
        description: `IMPS-P2A-${ref(10)}-CLIENT DESIGN PROJECT`,
        amount: rupees(25000)
      })
    }
    if (story) {
      bank.push({
        date: d(y, m, 9),
        description: 'DEBIT CARD ANNUAL FEE+GST',
        amount: -rupees(708)
      })
    }

    // ----- Credit card -----
    const cardEvents: Event[] = []
    const subs: [number, string, number][] = [
      [2, 'APPLE.COM/BILL ICLOUD 50GB', 75],
      [4, 'CULTFIT BANGALORE', 1999],
      [8, 'NETFLIX.COM MUMBAI', 649],
      [14, 'SPOTIFY INDIA', 119],
      [17, 'GOOGLE YOUTUBE PREMIUM', 129],
      [21, 'DISNEY HOTSTAR', 299]
    ]
    for (const [day, desc, amt] of subs)
      cardEvents.push({ date: d(y, m, day), description: desc, amount: -rupees(amt) })
    if (idx === 1)
      cardEvents.push({
        date: d(y, m, 11),
        description: 'AMAZON PRIME MEMBERSHIP',
        amount: -rupees(1499)
      })

    const orders = story ? 17 : between(8, 10)
    for (let i = 0; i < orders; i++) {
      const brand = rand() < 0.55 ? 'SWIGGY' : 'ZOMATO'
      const amt = story ? between(320, 950) : between(240, 780)
      cardEvents.push({
        date: d(y, m, between(1, 28)),
        description: `${brand} BANGALORE IN`,
        amount: -rupees(amt)
      })
    }
    for (let i = 0; i < between(2, 3); i++) {
      cardEvents.push({
        date: d(y, m, between(1, 28)),
        description: 'STARBUCKS COFFEE INDIRANAGAR',
        amount: -rupees(between(320, 640))
      })
    }
    for (let i = 0; i < between(8, 12); i++) {
      const brand = rand() < 0.7 ? 'UBER INDIA SYSTEMS' : 'OLA CABS'
      cardEvents.push({
        date: d(y, m, between(1, 28)),
        description: brand,
        amount: -rupees(between(160, 520))
      })
    }
    for (let i = 0; i < (story ? 4 : between(1, 3)); i++) {
      cardEvents.push({
        date: d(y, m, between(1, 28)),
        description: `AMAZON PAY INDIA PVT LTD ${ref(6)}`,
        amount: -rupees(between(499, 3299))
      })
    }
    if (rand() < 0.6 || story) {
      cardEvents.push({
        date: d(y, m, between(1, 28)),
        description: 'MYNTRA DESIGNS BANGALORE',
        amount: -rupees(between(1299, 2999))
      })
    }
    cardEvents.push({
      date: d(y, m, between(1, 28)),
      description: 'APOLLO PHARMACY KORAMANGALA',
      amount: -rupees(between(280, 1200))
    })
    if (idx === storyIndex - 3) {
      cardEvents.push({
        date: d(y, m, 16),
        description: `MAKEMYTRIP FLIGHT ${ref(8)}`,
        amount: -rupees(14800)
      })
    }
    if (story) {
      cardEvents.push({
        date: d(y, m, 19),
        description: `STAR HEALTH INSURANCE PREMIUM POLICY ${ref(6)}`,
        amount: -rupees(18500)
      })
      cardEvents.push({
        date: d(y, m, 23),
        description: 'BOOKMYSHOW MUMBAI',
        amount: -rupees(1150)
      })
    }
    if (previousCardTotal > 0) {
      cardEvents.push({
        date: d(y, m, 18),
        description: 'PAYMENT RECEIVED - THANK YOU',
        amount: previousCardTotal
      })
    }
    const spend = cardEvents.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0)
    previousCardTotal = spend
    card.push(...cardEvents)
  })

  const inRange = (e: Event): boolean => e.date <= endDate
  const byDate = (a: Event, b: Event): number => a.date.localeCompare(b.date)
  const bankRows = bank.filter(inRange).sort(byDate)
  const cardRows = card.filter(inRange).sort(byDate)

  let balance = rupees(140000)
  const toDMY = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  const bankLines = [
    csvLine(['Statement of account', 'Everyday Savings (sample) XXXX4521']),
    csvLine(['Period', `${toDMY(bankRows[0]!.date)} to ${toDMY(endDate)}`]),
    '',
    csvLine(['Date', 'Narration', 'Ref No', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance']),
    ...bankRows.map((e) => {
      balance += e.amount
      return csvLine([
        toDMY(e.date),
        e.description,
        ref(10),
        e.amount < 0 ? money(-e.amount) : '',
        e.amount > 0 ? money(e.amount) : '',
        money(balance)
      ])
    })
  ]

  const toDMonY = (iso: string): string =>
    `${iso.slice(8, 10)} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
  const cardLines = [
    csvLine(['Transaction Date', 'Description', 'Amount']),
    ...cardRows.map((e) =>
      csvLine([
        toDMonY(e.date),
        e.description,
        e.amount > 0 ? `${money(e.amount)} Cr` : money(-e.amount)
      ])
    )
  ]

  return [
    {
      filename: 'sample-everyday-savings.csv',
      accountName: 'Everyday Savings (sample)',
      accountType: 'bank',
      positiveMeans: 'inflow',
      csv: bankLines.join('\n') + '\n'
    },
    {
      filename: 'sample-rewards-card.csv',
      accountName: 'Rewards Credit Card (sample)',
      accountType: 'credit_card',
      positiveMeans: 'outflow',
      csv: cardLines.join('\n') + '\n'
    }
  ]
}
