/**
 * Government small-savings (post office) rates. They are reset every quarter by the Ministry of
 * Finance, so each table carries its quarter and source. Bank FD rates change too often to keep
 * here; the AI CFO searches the web for those.
 */
export const SMALL_SAVINGS_QUARTER = '1 Oct – 31 Dec 2026'
export const SMALL_SAVINGS_SOURCE =
  'DEA office memorandum of 30 Sep 2026 (rates unchanged since 1 Jan 2024) — https://www.indiapost.gov.in/banking-services/interest-rates'

export interface SavingsRate {
  scheme: string
  ratePct: number
  notes: string
}

export const SMALL_SAVINGS_RATES: SavingsRate[] = [
  {
    scheme: 'Post Office Savings Account',
    ratePct: 4.0,
    notes: 'Interest up to ₹10k/yr deductible (80TTA, old regime).'
  },
  { scheme: '1-year Time Deposit', ratePct: 6.9, notes: 'Paid annually, compounded quarterly.' },
  { scheme: '2-year Time Deposit', ratePct: 7.0, notes: 'Paid annually, compounded quarterly.' },
  { scheme: '3-year Time Deposit', ratePct: 7.1, notes: 'Paid annually, compounded quarterly.' },
  {
    scheme: '5-year Time Deposit',
    ratePct: 7.5,
    notes: '80C eligible (old regime). Interest taxable.'
  },
  {
    scheme: '5-year Recurring Deposit',
    ratePct: 6.7,
    notes: 'Monthly deposits, compounded quarterly.'
  },
  {
    scheme: 'Monthly Income Scheme (MIS)',
    ratePct: 7.4,
    notes: 'Paid monthly; max ₹9L single / ₹15L joint; 5 years.'
  },
  {
    scheme: 'Senior Citizens Savings Scheme (SCSS)',
    ratePct: 8.2,
    notes: '60+; paid quarterly; max ₹30L; 5 years; rate locked at purchase.'
  },
  {
    scheme: 'National Savings Certificate (NSC)',
    ratePct: 7.7,
    notes: '5 years, compounded annually, paid at maturity; 80C; rate locked.'
  },
  { scheme: 'Kisan Vikas Patra (KVP)', ratePct: 7.5, notes: 'Doubles in 115 months; rate locked.' },
  {
    scheme: 'Public Provident Fund (PPF)',
    ratePct: 7.1,
    notes: '15 years; ₹500–₹1.5L/yr; EEE tax-free; rate can change each quarter.'
  },
  {
    scheme: 'Sukanya Samriddhi (SSY)',
    ratePct: 8.2,
    notes: 'Girl child under 10; up to ₹1.5L/yr; tax-free; rate can change each quarter.'
  }
]

export function savingsRatesDigest(): string {
  return [
    `Post office / small-savings rates for ${SMALL_SAVINGS_QUARTER} (source: ${SMALL_SAVINGS_SOURCE}):`,
    ...SMALL_SAVINGS_RATES.map((r) => `- ${r.scheme}: ${r.ratePct}% — ${r.notes}`),
    'Bank FD, RBI floating-rate bond and insurance product terms change often: search the web for current rates and link the source.'
  ].join('\n')
}
