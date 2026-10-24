import type { ProfileEntry } from '../types'

/**
 * The CFO profile: what the AI CFO needs to know that statements and INDmoney can't show.
 * Every question can be skipped and answered later, in the profile page or while chatting.
 */
export interface ProfileQuestion {
  key: string
  section: 'You' | 'Debt' | 'Protection' | 'Assets' | 'Plans'
  question: string
  hint: string
  options?: string[]
}

export const SKIPPED = '__skipped__'
/** Free-form facts the AI CFO saved from chat use this key prefix. */
export const NOTE_PREFIX = 'note:'

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  { key: 'age', section: 'You', question: 'How old are you?', hint: 'e.g. 32' },
  {
    key: 'dependents',
    section: 'You',
    question: 'Who depends on your income?',
    hint: 'e.g. spouse and one child (4 yrs); parents partly',
    options: ['Nobody', 'Spouse', 'Spouse and kids', 'Parents', 'Spouse, kids and parents']
  },
  {
    key: 'risk',
    section: 'You',
    question: 'How do you feel about investment ups and downs?',
    hint: 'Your risk appetite',
    options: [
      'Low — protect my money first',
      'Medium — some swings are fine',
      'High — I can sit through big falls'
    ]
  },
  {
    key: 'tax_regime',
    section: 'You',
    question: 'Which income-tax regime do you file under?',
    hint: 'Check your Form 16 or payslip',
    options: ['New regime', 'Old regime', 'Not sure']
  },
  {
    key: 'loans',
    section: 'Debt',
    question: 'Do you have any loans?',
    hint: 'e.g. Home loan ₹40L outstanding at 8.5%, EMI ₹35k, 15 years left. Or "None".'
  },
  {
    key: 'term_insurance',
    section: 'Protection',
    question: 'Do you have term life insurance?',
    hint: 'e.g. ₹1 Cr cover, ₹12k/year, till age 60. Or "None".'
  },
  {
    key: 'health_insurance',
    section: 'Protection',
    question: 'What health insurance do you have?',
    hint: 'e.g. Employer ₹5L family floater + personal ₹10L super top-up'
  },
  {
    key: 'policies',
    section: 'Protection',
    question: 'Any LIC, endowment, money-back or ULIP policies?',
    hint: 'e.g. LIC Jeevan Anand, ₹30k/year premium, started 2018, matures 2038'
  },
  {
    key: 'other_assets',
    section: 'Assets',
    question: 'What do you own outside INDmoney?',
    hint: 'e.g. Flat worth ₹80L, EPF ₹6L, PPF ₹3L, bank FDs ₹5L, physical gold 50 g'
  },
  {
    key: 'emergency_fund',
    section: 'Assets',
    question: 'How much is set aside for emergencies, and where?',
    hint: 'e.g. ₹3L in a sweep FD'
  },
  {
    key: 'other_income',
    section: 'Plans',
    question: 'Any income besides salary?',
    hint: 'e.g. Rent ₹18k/month, freelance ~₹50k/quarter'
  },
  {
    key: 'big_expenses',
    section: 'Plans',
    question: 'Big expenses coming in the next 1–5 years?',
    hint: "e.g. Car in 2027 (₹12L), child's school fees from 2028, wedding"
  }
]

export function isAnswered(entry: ProfileEntry | undefined): boolean {
  return !!entry && entry.value.trim() !== '' && entry.value !== SKIPPED
}

/** Profile text for the AI CFO, plus the questions it should still ask about. */
export function profileDigest(entries: ProfileEntry[]): string {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const answered = PROFILE_QUESTIONS.filter((q) => isAnswered(byKey.get(q.key)))
  const missing = PROFILE_QUESTIONS.filter((q) => !isAnswered(byKey.get(q.key)))
  const notes = entries.filter((e) => e.key.startsWith(NOTE_PREFIX))
  const lines: string[] = []
  for (const q of answered) lines.push(`- ${q.question} ${byKey.get(q.key)!.value}`)
  for (const n of notes) lines.push(`- (from chat, ${n.updatedAt.slice(0, 10)}) ${n.value}`)
  if (lines.length === 0) lines.push('- Nothing shared yet.')
  if (missing.length > 0) {
    lines.push(
      '',
      `Not known yet (key: question) — ask only what matters for the current question, then save the answer with save_profile_fact:`,
      ...missing.map(
        (q) =>
          `- ${q.key}: ${q.question}${byKey.get(q.key)?.value === SKIPPED ? ' (user skipped)' : ''}`
      )
    )
  }
  return lines.join('\n')
}
