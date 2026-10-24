import { PROFILE_QUESTIONS, profileDigest } from '../../shared/domain/profile'
import { savingsRatesDigest } from '../../shared/knowledge/savingsRates'
import { cfoReviewDigest } from '../../shared/domain/cfoReview'
import { getCfoReview } from '../cfo'
import { formatMoney } from '../../shared/money'
import type { Db } from '../db/client'
import { getMonthlyClose, getMonths } from '../analysis'
import { addProfileNote, listProfile, setProfileAnswer } from '../profile'
import {
  getSettings,
  listCategories,
  listCommitments,
  listGoals,
  listTransactions
} from '../repository'

/**
 * The app's own data as tools, so the AI CFO can look things up mid-conversation and remember
 * what the user tells it. Everything runs locally against SQLite.
 */
export interface LocalTool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  run: (db: Db, args: Record<string, unknown>) => string
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export const LOCAL_TOOLS: LocalTool[] = [
  {
    name: 'cfo_review',
    description:
      "The CFO review: the agreed, computed numbers for the user's whole picture — net worth, cash, typical monthly spend, emergency-fund target, investable surplus, allocation now vs target, top stocks and sector exposure, mutual funds by category (ELSS count, costly and lagging funds), protection gaps, and prioritised findings. Call this first for any question about investing, allocation or 'what should I do with my money', and quote its numbers.",
    inputSchema: { type: 'object', properties: {} },
    run: (db) => {
      const review = getCfoReview(db)
      return review
        ? cfoReviewDigest(review)
        : 'No INDmoney portfolio synced yet — connect INDmoney in Data sources.'
    }
  },
  {
    name: 'get_profile',
    description:
      "The user's CFO profile: age, dependents, risk appetite, tax regime, loans, insurance, LIC/ULIP policies, assets outside INDmoney, emergency fund, other income, big upcoming expenses, plus facts saved from earlier chats. Lists what is still unknown.",
    inputSchema: { type: 'object', properties: {} },
    run: (db) => profileDigest(listProfile(db))
  },
  {
    name: 'save_profile_fact',
    description: `Save something the user just told you about their finances so you remember it next time. Use \`key\` when it answers one of these profile questions: ${PROFILE_QUESTIONS.map((q) => q.key).join(', ')} (replaces the old answer). Otherwise leave key out and it is stored as a note. Write the fact in one plain sentence with amounts, e.g. "Home loan ₹38L outstanding at 8.4%, EMI ₹34k, ends 2041."`,
    inputSchema: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The fact, in one sentence.' },
        key: { type: 'string', enum: PROFILE_QUESTIONS.map((q) => q.key) }
      },
      required: ['fact']
    },
    run: (db, args) => {
      const fact = str(args['fact'])
      if (!fact) return 'Nothing to save.'
      const key = str(args['key'])
      if (key) setProfileAnswer(db, key, fact, 'chat')
      else addProfileNote(db, fact)
      return 'Saved to the CFO profile.'
    }
  },
  {
    name: 'search_transactions',
    description:
      "Search the user's bank and card transactions (from imported statements). Filter by text (merchant/description), date range and direction. Amounts are signed: negative = money out.",
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Merchant or description text' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        direction: { type: 'string', enum: ['income', 'expense', 'transfer'] },
        limit: { type: 'integer', description: 'Max rows (default 50, max 300)' }
      }
    },
    run: (db, args) => {
      const currency = getSettings(db).primaryCurrency
      const categories = listCategories(db)
      const direction = str(args['direction']) as 'income' | 'expense' | 'transfer' | null
      const limit = Math.min(300, Math.max(1, Number(args['limit']) || 50))
      const rows = listTransactions(db, {
        search: str(args['search']),
        from: str(args['from']),
        to: str(args['to']),
        direction,
        limit
      })
      if (rows.length === 0) return 'No matching transactions.'
      const total = rows.reduce((t, r) => t + r.amountMinor, 0)
      return [
        `${rows.length} transactions, net ${formatMoney(total, currency)}:`,
        ...rows.map(
          (r) =>
            `${r.transactionDate} | ${r.merchantNormalised} | ${formatMoney(r.amountMinor, currency)} | ${categories.find((c) => c.id === r.categoryId)?.name ?? 'Other'} | ${r.accountName}`
        )
      ].join('\n')
    }
  },
  {
    name: 'get_month_summary',
    description:
      'Income, spending, investing and spending by category for one month (from bank statements), plus the last 12 months trend. Defaults to the latest month.',
    inputSchema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'YYYY-MM' } }
    },
    run: (db, args) => {
      const { months, defaultMonth } = getMonths(db)
      if (months.length === 0) return 'No statements imported yet.'
      const month = str(args['month']) ?? defaultMonth
      const currency = getSettings(db).primaryCurrency
      const fmt = (m: number): string => formatMoney(m, currency)
      const r = getMonthlyClose(db, month)
      const c = r.current
      const categories = listCategories(db)
      return [
        `${month}: income ${fmt(c.incomeMinor)}, spending ${fmt(c.spendingMinor)}, invested ${fmt(c.investedMinor)}, net ${fmt(c.netCashFlowMinor)}, saving rate ${c.savingRate == null ? 'n/a' : `${Math.round(c.savingRate * 100)}%`}.`,
        'By category:',
        ...c.byCategory.map(
          (b) =>
            `- ${categories.find((x) => x.id === b.categoryId)?.name ?? 'Other'}: ${fmt(b.spendMinor)}`
        ),
        'Trend (month: income / spending):',
        ...r.trend.map((t) => `- ${t.month}: ${fmt(t.incomeMinor)} / ${fmt(t.spendingMinor)}`),
        r.safeToSpend.status === 'ok'
          ? `Safe to spend until ${r.safeToSpend.nextIncomeDate}: ${fmt(r.safeToSpend.valueMinor)}.`
          : 'Safe to spend: needs account balance and next income date.'
      ].join('\n')
    }
  },
  {
    name: 'get_commitments_and_goals',
    description: 'Recurring commitments (EMIs, SIPs, subscriptions, premiums) and savings goals.',
    inputSchema: { type: 'object', properties: {} },
    run: (db) => {
      const currency = getSettings(db).primaryCurrency
      const fmt = (m: number): string => formatMoney(m, currency)
      const commitments = listCommitments(db).filter((c) => c.status !== 'ignored')
      const goals = listGoals(db)
      return [
        'Recurring commitments:',
        ...(commitments.length
          ? commitments.map(
              (c) =>
                `- ${c.merchantName}: ${fmt(c.typicalAmountMinor)} ${c.cadence}, next ${c.nextExpectedDate ?? 'unknown'}`
            )
          : ['- none detected']),
        'Goals:',
        ...(goals.length
          ? goals.map(
              (g) =>
                `- ${g.name}: ${fmt(g.currentAmountMinor)} of ${fmt(g.targetAmountMinor)} by ${g.targetDate}`
            )
          : ['- none set'])
      ].join('\n')
    }
  },
  {
    name: 'get_savings_scheme_rates',
    description:
      'Current post office / government small-savings rates (PPF, SSY, SCSS, NSC, KVP, MIS, time and recurring deposits) for this quarter, with source.',
    inputSchema: { type: 'object', properties: {} },
    run: () => savingsRatesDigest()
  }
]
