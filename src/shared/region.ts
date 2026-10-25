/**
 * Where the user lives. The country sets the currency, and India-only features (UPI, INDmoney,
 * Indian brokers, the Indian card and savings-rate knowledge) only show for India.
 * The country is stored as the primary currency, so there is one setting, not two.
 */
export interface Country {
  code: string
  name: string
  currency: string
  /** What one unit of the currency is called in a sentence ("every dollar saved"). */
  unit: string
  /** The name as it reads mid-sentence ("lives in the United States"). */
  place: string
}

export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India', currency: 'INR', unit: 'rupee', place: 'India' },
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    unit: 'dollar',
    place: 'the United States'
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    unit: 'pound',
    place: 'the United Kingdom'
  },
  { code: 'EU', name: 'Eurozone', currency: 'EUR', unit: 'euro', place: 'the Eurozone' },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    currency: 'AED',
    unit: 'dirham',
    place: 'the United Arab Emirates'
  },
  { code: 'SG', name: 'Singapore', currency: 'SGD', unit: 'dollar', place: 'Singapore' },
  { code: 'AU', name: 'Australia', currency: 'AUD', unit: 'dollar', place: 'Australia' },
  { code: 'CA', name: 'Canada', currency: 'CAD', unit: 'dollar', place: 'Canada' },
  { code: 'JP', name: 'Japan', currency: 'JPY', unit: 'yen', place: 'Japan' }
]

export function countryFor(currency: string): Country {
  return (
    COUNTRIES.find((c) => c.currency === currency) ?? {
      code: '',
      name: 'your country',
      currency,
      unit: 'unit',
      place: 'your country'
    }
  )
}

export const isIndia = (currency: string): boolean => currency === 'INR'
