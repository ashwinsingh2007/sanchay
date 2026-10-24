import type { Category, CategoryKind } from './types'

export const NEEDS_REVIEW_THRESHOLD = 0.5

export const CATEGORY_IDS = {
  income: 'income',
  housing: 'housing',
  groceries: 'groceries',
  dining: 'dining',
  transport: 'transport',
  shopping: 'shopping',
  travel: 'travel',
  health: 'health',
  insurance: 'insurance',
  education: 'education',
  entertainment: 'entertainment',
  utilities: 'utilities',
  subscriptions: 'subscriptions',
  software: 'software',
  emi: 'emi',
  investments: 'investments',
  transfers: 'transfers',
  cash: 'cash',
  fees: 'fees',
  other: 'other'
} as const

export type SeedCategoryId = (typeof CATEGORY_IDS)[keyof typeof CATEGORY_IDS]

// Muted, distinguishable hues. Order matters for charts.
export const SEED_CATEGORIES: Category[] = [
  { id: 'income', name: 'Salary & Income', kind: 'income', color: '#0b735e', sortOrder: 0 },
  { id: 'housing', name: 'Housing', kind: 'expense', color: '#6d5bd0', sortOrder: 1 },
  { id: 'groceries', name: 'Groceries', kind: 'expense', color: '#6b8e3a', sortOrder: 2 },
  { id: 'dining', name: 'Dining & Delivery', kind: 'expense', color: '#c4532d', sortOrder: 3 },
  { id: 'transport', name: 'Transport', kind: 'expense', color: '#5c9bc7', sortOrder: 4 },
  { id: 'shopping', name: 'Shopping', kind: 'expense', color: '#e3a72f', sortOrder: 5 },
  { id: 'travel', name: 'Travel', kind: 'expense', color: '#86bee0', sortOrder: 6 },
  { id: 'health', name: 'Health', kind: 'expense', color: '#2c9c8c', sortOrder: 7 },
  { id: 'insurance', name: 'Insurance', kind: 'expense', color: '#3e8c9e', sortOrder: 8 },
  { id: 'education', name: 'Education', kind: 'expense', color: '#4c74b5', sortOrder: 9 },
  { id: 'entertainment', name: 'Entertainment', kind: 'expense', color: '#b5609f', sortOrder: 10 },
  { id: 'utilities', name: 'Utilities', kind: 'expense', color: '#2f5f9e', sortOrder: 11 },
  { id: 'subscriptions', name: 'Subscriptions', kind: 'expense', color: '#c77db5', sortOrder: 12 },
  { id: 'software', name: 'Software & SaaS', kind: 'expense', color: '#9a6fb0', sortOrder: 13 },
  { id: 'emi', name: 'EMI & Debt', kind: 'expense', color: '#8f80e0', sortOrder: 14 },
  {
    id: 'investments',
    name: 'Investments & Savings',
    kind: 'savings',
    color: '#3d4fb0',
    sortOrder: 15
  },
  { id: 'transfers', name: 'Transfers', kind: 'transfer', color: '#9a9087', sortOrder: 16 },
  { id: 'cash', name: 'Cash Withdrawal', kind: 'expense', color: '#a8998a', sortOrder: 17 },
  { id: 'fees', name: 'Fees & Charges', kind: 'expense', color: '#a21f2e', sortOrder: 18 },
  { id: 'other', name: 'Other', kind: 'expense', color: '#bdb3a8', sortOrder: 19 }
]

export function categoryKind(
  categories: readonly Category[],
  id: string | null
): CategoryKind | null {
  if (!id) return null
  return categories.find((c) => c.id === id)?.kind ?? null
}
