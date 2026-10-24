import type { MonthKey } from '../dates'
import type { CalcLine, EvidenceTx, MonthlyCloseReport } from '../types'

/**
 * Seam for a future on-device assistant (e.g. node-llama-cpp or a llama.cpp sidecar running a
 * user-downloaded GGUF model). Nothing here talks to a network. v1 ships only the deterministic
 * implementation below; the AI area in Settings is disabled.
 */

/** Only aggregates and merchant names — never raw descriptions, account names or balances. */
export interface SanitisedMonthlyCloseInput {
  month: MonthKey
  currency: string
  incomeMinor: number
  spendingMinor: number
  netCashFlowMinor: number
  savingRate: number | null
  drivers: { label: string; diffMinor: number; kind: string }[]
  insightTitles: string[]
}

export interface PersonalCFOQuestionInput {
  question: string
  context: SanitisedMonthlyCloseInput
}

export interface PersonalCFOAnswer {
  answer: string
  /** Answers must cite local evidence so users can verify them in the app. */
  citations: { transactions: EvidenceTx[]; calculations: CalcLine[] }
  grounded: boolean
}

export interface PersonalCFOAssistant {
  isAvailable(): Promise<boolean>
  summariseMonthlyClose(input: SanitisedMonthlyCloseInput): Promise<string>
  answerQuestion(input: PersonalCFOQuestionInput): Promise<PersonalCFOAnswer>
}

export function sanitiseReport(report: MonthlyCloseReport): SanitisedMonthlyCloseInput {
  return {
    month: report.month,
    currency: report.currency,
    incomeMinor: report.current.incomeMinor,
    spendingMinor: report.current.spendingMinor,
    netCashFlowMinor: report.current.netCashFlowMinor,
    savingRate: report.current.savingRate,
    drivers: report.comparison.drivers.map((d) => ({
      label: d.label,
      diffMinor: d.diffMinor,
      kind: d.kind
    })),
    insightTitles: report.insights.map((i) => i.title)
  }
}

/** v1 assistant: no model. Summaries come from the deterministic narrative generator. */
export class DeterministicAssistant implements PersonalCFOAssistant {
  constructor(private readonly narrative: (input: SanitisedMonthlyCloseInput) => string) {}

  async isAvailable(): Promise<boolean> {
    return false
  }

  async summariseMonthlyClose(input: SanitisedMonthlyCloseInput): Promise<string> {
    return this.narrative(input)
  }

  async answerQuestion(_input: PersonalCFOQuestionInput): Promise<PersonalCFOAnswer> {
    return {
      answer:
        'Questions are not available yet. Private, on-device AI is planned for a future version.',
      citations: { transactions: [], calculations: [] },
      grounded: false
    }
  }
}
