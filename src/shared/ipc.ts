import { z } from 'zod'
import type { CfoReview } from './domain/cfoReview'
import type {
  AiCategoriseResult,
  AiStatus,
  InvestmentReport,
  MoneyFlow,
  Payslip,
  SalaryProfile,
  PaymentAdvice,
  ChatMessage,
  Conversation,
  Briefing,
  FiProjection,
  ImportAnalysis,
  OffersResult,
  StatementReadResult,
  QuickImportResult,
  SavingsReport,
  Account,
  IndmoneySnapshot,
  DataSourceInfo,
  ProfileEntry,
  IndmoneyStatus,
  CasImportInfo,
  AccountWithStats,
  AppInfo,
  Category,
  ImportSourceWithAccount,
  ImportSummary,
  MerchantRule,
  MonthInfo,
  MonthlyCloseReport,
  RecurringCommitment,
  SavingsGoal,
  TransactionView,
  UserFinancialSettings
} from './types'

const id = z.string().min(1).max(64)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
const monthKey = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM')
const minor = z.number().int().refine(Number.isSafeInteger, 'Amount too large')
const nonNegMinor = minor.refine((n) => n >= 0, 'Must not be negative')
const accountType = z.enum(['bank', 'credit_card', 'cash', 'investment_placeholder'])
const direction = z.enum(['income', 'expense', 'transfer', 'unknown'])
const col = z.number().int().min(0).max(500)

export const settingsUpdateSchema = z
  .object({
    primaryCurrency: z.string().regex(/^[A-Z]{3}$/),
    nextIncomeDate: isoDate.nullable(),
    expectedIncomeMinor: nonNegMinor.nullable(),
    emergencyBufferMinor: nonNegMinor,
    monthlySavingsTargetMinor: nonNegMinor.nullable(),
    recurringTolerancePct: z.number().int().min(1).max(50),
    onboardingComplete: z.boolean(),
    goalText: z.string().max(4000).nullable(),
    fiCorpusMinor: nonNegMinor.nullable(),
    fiReturnPct: z.number().min(-5).max(20),
    fiWithdrawalPct: z.number().min(1).max(10),
    fiTargetSpendMinor: nonNegMinor.nullable()
  })
  .partial()
  .strict()

export const columnMappingSchema = z.object({
  headerRow: z.number().int().min(0),
  dateColumn: col,
  descriptionColumn: col,
  amountMode: z.enum(['signed', 'debit_credit']),
  amountColumn: col.nullable(),
  positiveMeans: z.enum(['inflow', 'outflow']),
  debitColumn: col.nullable(),
  creditColumn: col.nullable(),
  balanceColumn: col.nullable(),
  dateOrder: z.enum(['dmy', 'mdy', 'ymd'])
})

export const importCommitSchema = z.object({
  filename: z.string().min(1).max(260),
  fileHash: z.string().min(1).max(128),
  rows: z.array(z.array(z.string().max(2000)).max(200)).max(200_000),
  mapping: columnMappingSchema,
  account: z.object({
    existingAccountId: id.nullable(),
    name: z.string().trim().min(1).max(80),
    type: accountType
  }),
  isSample: z.boolean().optional()
})

export const transactionFilterSchema = z
  .object({
    from: isoDate.nullable().optional(),
    to: isoDate.nullable().optional(),
    accountId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
    direction: direction.nullable().optional(),
    search: z.string().max(200).nullable().optional(),
    needsReview: z.boolean().optional(),
    limit: z.number().int().min(1).max(20_000).optional()
  })
  .strict()

export const transactionUpdateSchema = z
  .object({
    id,
    merchantNormalised: z.string().trim().min(1).max(120).optional(),
    categoryId: id.optional(),
    isTransfer: z.boolean().optional(),
    notes: z.string().max(1000).nullable().optional()
  })
  .strict()

export const ruleCreateSchema = z
  .object({
    matchType: z.enum(['contains', 'exact', 'regex']),
    matchValue: z.string().trim().min(1).max(200),
    merchantNormalised: z.string().trim().max(120).nullable(),
    categoryId: id,
    priority: z.number().int().min(0).max(1000).default(100),
    applyToExisting: z.boolean().default(true)
  })
  .strict()
  .refine(
    (r) => {
      if (r.matchType !== 'regex') return true
      try {
        new RegExp(r.matchValue)
        return true
      } catch {
        return false
      }
    },
    { message: 'Invalid regular expression', path: ['matchValue'] }
  )

export const commitmentUpdateSchema = z
  .object({
    id,
    merchantName: z.string().trim().min(1).max(120).optional(),
    categoryId: id.nullable().optional(),
    typicalAmountMinor: nonNegMinor.optional(),
    cadence: z.enum(['monthly', 'quarterly', 'yearly', 'custom']).optional(),
    nextExpectedDate: isoDate.nullable().optional(),
    status: z.enum(['active', 'review', 'ignored']).optional()
  })
  .strict()

export const goalInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    targetAmountMinor: nonNegMinor.refine((n) => n > 0, 'Target must be above zero'),
    currentAmountMinor: nonNegMinor,
    targetDate: isoDate,
    monthlyContributionMinor: nonNegMinor.nullable(),
    priority: z.number().int().min(0).max(100).default(1)
  })
  .strict()

export const goalUpdateSchema = goalInputSchema.partial().extend({ id }).strict()

export const accountUpdateSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(80).optional(),
    type: accountType.optional(),
    currentBalanceMinor: minor.nullable().optional()
  })
  .strict()

export const accountCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: accountType,
    currentBalanceMinor: minor.nullable()
  })
  .strict()

const aiProvider = z.enum([
  'none',
  'claude_code',
  'ollama',
  'apple',
  'gemini',
  'anthropic',
  'openai'
])

export const configureAiSchema = z
  .object({
    provider: aiProvider,
    model: z.string().trim().min(1).max(120).nullable().optional(),
    apiKey: z.string().trim().max(400).nullable().optional(),
    ollamaUrl: z
      .string()
      .regex(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/, 'Ollama must run on this Mac')
      .optional(),
    cloudConsent: z.boolean().optional()
  })
  .strict()

export const dataSourceCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    url: z
      .string()
      .trim()
      .url()
      .refine(
        (u) => u.startsWith('https://') || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u),
        'Use an https:// URL'
      ),
    auth: z.enum(['oauth', 'token', 'none'])
  })
  .strict()

/** Every method the renderer can call. Inputs are validated in the main process. */
export interface CfoApi {
  getAppInfo(): Promise<AppInfo>
  getSettings(): Promise<UserFinancialSettings>
  updateSettings(input: z.infer<typeof settingsUpdateSchema>): Promise<UserFinancialSettings>
  listCategories(): Promise<Category[]>

  listAccounts(): Promise<AccountWithStats[]>
  createAccount(input: z.infer<typeof accountCreateSchema>): Promise<Account>
  updateAccount(input: z.infer<typeof accountUpdateSchema>): Promise<Account>

  pickStatement(): Promise<StatementReadResult | null>
  readStatementFile(input: {
    filename?: string
    data?: Uint8Array
    token?: string
    password?: string
  }): Promise<StatementReadResult>
  quickImport(input: {
    filename: string
    fileHash: string
    rows: string[][]
  }): Promise<QuickImportResult>
  analyzeImport(input: z.infer<typeof importCommitSchema>): Promise<ImportAnalysis>
  commitImport(input: z.infer<typeof importCommitSchema>): Promise<ImportSummary>
  loadSampleData(): Promise<ImportSummary[]>
  listImportSources(): Promise<ImportSourceWithAccount[]>
  deleteImportSource(id: string): Promise<{ deletedTransactions: number }>

  listTransactions(filter: z.infer<typeof transactionFilterSchema>): Promise<TransactionView[]>
  updateTransaction(input: z.infer<typeof transactionUpdateSchema>): Promise<void>
  bulkUpdateCategory(input: { ids: string[]; categoryId: string }): Promise<{ updated: number }>

  listRules(): Promise<MerchantRule[]>
  createRule(
    input: z.input<typeof ruleCreateSchema>
  ): Promise<{ rule: MerchantRule; updatedCount: number }>
  deleteRule(id: string): Promise<void>

  listCommitments(): Promise<RecurringCommitment[]>
  updateCommitment(input: z.infer<typeof commitmentUpdateSchema>): Promise<RecurringCommitment>
  redetectCommitments(): Promise<RecurringCommitment[]>

  listGoals(): Promise<SavingsGoal[]>
  createGoal(input: z.input<typeof goalInputSchema>): Promise<SavingsGoal>
  updateGoal(input: z.input<typeof goalUpdateSchema>): Promise<SavingsGoal>
  deleteGoal(id: string): Promise<void>

  listMonths(): Promise<{ months: MonthInfo[]; defaultMonth: string }>
  getMonthlyClose(month: string): Promise<MonthlyCloseReport>
  dismissInsight(id: string): Promise<void>

  exportData(format: 'json' | 'csv'): Promise<{ saved: boolean; path?: string }>
  deleteAllData(confirmation: 'DELETE'): Promise<void>
  clearImportedData(confirmation: 'CLEAR'): Promise<void>
  /** Re-runs rules over old imports, then lets the AI CFO categorise what's still unclear. */
  recategorise(): Promise<AiCategoriseResult>
  getMoneyFlow(month: string | null): Promise<MoneyFlow>
  /** Best cards and ways to pay for the user's own spending (indicative). */
  getPaymentAdvice(month: string | null): Promise<PaymentAdvice>
  /** Month-by-month investments by type, with the next months projected. */
  getInvestments(month: string | null): Promise<InvestmentReport>
  listPayslips(): Promise<Payslip[]>
  deletePayslip(id: string): Promise<void>
  /** What the uploaded salary slips say, matched against the bank statements. */
  getSalaryProfile(): Promise<SalaryProfile | null>
  /** Asks the AI CFO for cheaper alternatives for big merchants; returns how many it found. */
  suggestAlternatives(month: string): Promise<number>

  getAiStatus(): Promise<AiStatus>
  configureAi(input: z.infer<typeof configureAiSchema>): Promise<AiStatus>
  testAi(): Promise<{ ok: boolean; message: string }>
  pullOllamaModel(model: string): Promise<AiStatus>
  listConversations(): Promise<Conversation[]>
  listChat(conversationId: string): Promise<ChatMessage[]>
  /** Starts a new conversation when `conversationId` is null. */
  sendChat(input: {
    conversationId: string | null
    text: string
  }): Promise<{ requestId: string; userMessage: ChatMessage; conversationId: string }>
  cancelChat(requestId: string): Promise<void>
  deleteConversation(id: string): Promise<void>
  getPotentialSavings(month: string): Promise<SavingsReport>
  setInsightDone(input: { id: string; done: boolean }): Promise<void>
  getFiProjection(month: string | null): Promise<FiProjection>
  getBriefing(refresh: boolean): Promise<Briefing | null>
  listOffers(): Promise<OffersResult>
  findOffers(): Promise<OffersResult>

  getIndmoneyStatus(): Promise<IndmoneyStatus>
  /** Opens INDmoney sign-in in the browser, then pulls the portfolio. */
  connectIndmoney(): Promise<IndmoneyStatus>
  syncIndmoney(): Promise<IndmoneyStatus>
  disconnectIndmoney(): Promise<IndmoneyStatus>
  listIndmoneySnapshots(): Promise<IndmoneySnapshot[]>

  /** `probe` connects to each source to list its tools. */
  listDataSources(probe: boolean): Promise<DataSourceInfo[]>
  /** Signs in (browser for OAuth, or the pasted token). */
  connectDataSource(input: { id: string; token?: string }): Promise<DataSourceInfo[]>
  disconnectDataSource(id: string): Promise<DataSourceInfo[]>
  addDataSource(input: z.infer<typeof dataSourceCreateSchema>): Promise<DataSourceInfo[]>
  removeDataSource(id: string): Promise<DataSourceInfo[]>
  setDataSourceEnabled(input: { id: string; enabled: boolean }): Promise<DataSourceInfo[]>

  listProfile(): Promise<ProfileEntry[]>
  saveProfileAnswer(input: { key: string; value: string }): Promise<ProfileEntry[]>
  deleteProfileEntry(key: string): Promise<ProfileEntry[]>

  /** Asks macOS for microphone access (for the chat mic button). */
  requestMicrophone(): Promise<boolean>
  transcribeAudio(input: {
    data: Uint8Array
    mimeType: string
  }): Promise<{ text: string; engine: string }>

  /** The CFO's deterministic review of the whole picture (null until INDmoney is synced). */
  getCfoReview(): Promise<CfoReview | null>
  listCasImports(): Promise<CasImportInfo[]>
  deleteCasImport(id: string): Promise<void>
}

export const apiInputSchemas = {
  getAppInfo: z.undefined(),
  getSettings: z.undefined(),
  updateSettings: settingsUpdateSchema,
  listCategories: z.undefined(),
  listAccounts: z.undefined(),
  createAccount: accountCreateSchema,
  updateAccount: accountUpdateSchema,
  pickStatement: z.undefined(),
  readStatementFile: z
    .object({
      filename: z.string().min(1).max(260).optional(),
      data: z
        .instanceof(Uint8Array)
        .refine((d) => d.byteLength <= 25 * 1024 * 1024, 'File too large')
        .optional(),
      token: z.string().max(64).optional(),
      password: z.string().max(200).optional()
    })
    .strict(),
  quickImport: importCommitSchema.pick({ filename: true, fileHash: true, rows: true }).strict(),
  analyzeImport: importCommitSchema,
  commitImport: importCommitSchema,
  loadSampleData: z.undefined(),
  listImportSources: z.undefined(),
  deleteImportSource: id,
  listTransactions: transactionFilterSchema,
  updateTransaction: transactionUpdateSchema,
  bulkUpdateCategory: z.object({ ids: z.array(id).min(1).max(20_000), categoryId: id }).strict(),
  listRules: z.undefined(),
  createRule: ruleCreateSchema,
  deleteRule: id,
  listCommitments: z.undefined(),
  updateCommitment: commitmentUpdateSchema,
  redetectCommitments: z.undefined(),
  listGoals: z.undefined(),
  createGoal: goalInputSchema,
  updateGoal: goalUpdateSchema,
  deleteGoal: id,
  listMonths: z.undefined(),
  getMonthlyClose: monthKey,
  dismissInsight: z.string().min(1).max(200),
  exportData: z.enum(['json', 'csv']),
  deleteAllData: z.literal('DELETE'),
  clearImportedData: z.literal('CLEAR'),
  recategorise: z.undefined(),
  getMoneyFlow: monthKey.nullable(),
  getPaymentAdvice: monthKey.nullable(),
  getInvestments: monthKey.nullable(),
  listPayslips: z.undefined(),
  deletePayslip: id,
  getSalaryProfile: z.undefined(),
  suggestAlternatives: monthKey,
  getAiStatus: z.undefined(),
  configureAi: configureAiSchema,
  testAi: z.undefined(),
  pullOllamaModel: z.string().regex(/^[a-zA-Z0-9._:/-]{1,80}$/, 'Invalid model name'),
  listConversations: z.undefined(),
  listChat: id,
  sendChat: z
    .object({ conversationId: id.nullable(), text: z.string().trim().min(1).max(4000) })
    .strict(),
  cancelChat: z.string().min(1).max(64),
  deleteConversation: id,
  getPotentialSavings: monthKey,
  setInsightDone: z.object({ id: z.string().min(1).max(200), done: z.boolean() }).strict(),
  getFiProjection: monthKey.nullable(),
  getBriefing: z.boolean(),
  listOffers: z.undefined(),
  findOffers: z.undefined(),
  getIndmoneyStatus: z.undefined(),
  connectIndmoney: z.undefined(),
  syncIndmoney: z.undefined(),
  disconnectIndmoney: z.undefined(),
  listIndmoneySnapshots: z.undefined(),
  listDataSources: z.boolean(),
  connectDataSource: z.object({ id, token: z.string().trim().max(4000).optional() }).strict(),
  disconnectDataSource: id,
  addDataSource: dataSourceCreateSchema,
  removeDataSource: id,
  setDataSourceEnabled: z.object({ id, enabled: z.boolean() }).strict(),
  listProfile: z.undefined(),
  saveProfileAnswer: z
    .object({ key: z.string().min(1).max(80), value: z.string().max(2000) })
    .strict(),
  deleteProfileEntry: z.string().min(1).max(80),
  requestMicrophone: z.undefined(),
  transcribeAudio: z
    .object({
      data: z
        .instanceof(Uint8Array)
        .refine((d) => d.byteLength <= 25 * 1024 * 1024, 'Recording too long'),
      mimeType: z.string().regex(/^audio\/[a-z0-9.+-]+(;.*)?$/)
    })
    .strict(),
  getCfoReview: z.undefined(),
  listCasImports: z.undefined(),
  deleteCasImport: id
} satisfies Record<keyof CfoApi, z.ZodType>

export type ApiMethod = keyof CfoApi

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }
