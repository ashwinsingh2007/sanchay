import type { DateOrder, ISODate, MonthKey } from './dates'

export type AccountType = 'bank' | 'credit_card' | 'cash' | 'investment_placeholder'
export type Direction = 'income' | 'expense' | 'transfer' | 'unknown'
export type CategoryKind = 'income' | 'expense' | 'savings' | 'transfer'
export type CategorySource = 'user_rule' | 'keyword' | 'ai' | 'fallback' | 'manual'
export type MatchType = 'contains' | 'exact' | 'regex'
export type Cadence = 'monthly' | 'quarterly' | 'yearly' | 'custom'
export type CommitmentStatus = 'active' | 'review' | 'ignored'
export type Severity = 'info' | 'attention' | 'high'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  color: string
  sortOrder: number
}

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  currentBalanceMinor: number | null
  balanceAsOf: ISODate | null
  balanceSource: 'manual' | 'statement' | null
  createdAt: string
  updatedAt: string
}

export interface AccountWithStats extends Account {
  transactionCount: number
  firstDate: ISODate | null
  lastDate: ISODate | null
}

export interface ImportSource {
  id: string
  accountId: string
  filename: string
  importedAt: string
  rowCount: number
  importedCount: number
  duplicateCount: number
  sourceHash: string
  dateRangeStart: ISODate | null
  dateRangeEnd: ISODate | null
  isSample: boolean
}

export interface ImportSourceWithAccount extends ImportSource {
  accountName: string
  transactionCount: number
  /** Rows this statement contains, including ones shared with overlapping statements. */
  containedCount: number
  /** Rows no other statement contains — what deleting this statement removes. */
  onlyHereCount: number
}

export interface Transaction {
  id: string
  accountId: string
  importSourceId: string | null
  transactionDate: ISODate
  descriptionOriginal: string
  descriptionKey: string
  merchantNormalised: string
  amountMinor: number
  currency: string
  direction: Direction
  categoryId: string | null
  categoryConfidence: number
  categorySource: CategorySource
  isRecurring: boolean
  isTransfer: boolean
  notes: string | null
  createdAt: string
}

export interface TransactionView extends Transaction {
  accountName: string
  accountType: AccountType
  needsReview: boolean
}

export interface MerchantRule {
  id: string
  matchType: MatchType
  matchValue: string
  merchantNormalised: string | null
  categoryId: string
  priority: number
  createdAt: string
}

export interface RecurringCommitment {
  id: string
  merchantKey: string
  merchantName: string
  categoryId: string | null
  typicalAmountMinor: number
  cadence: Cadence
  nextExpectedDate: ISODate | null
  lastSeenDate: ISODate | null
  confidence: number
  status: CommitmentStatus
  userConfirmed: boolean
  userEdited: boolean
  linkedTransactionIds: string[]
  createdAt: string
  updatedAt: string
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmountMinor: number
  currentAmountMinor: number
  targetDate: ISODate
  monthlyContributionMinor: number | null
  priority: number
  createdAt: string
  updatedAt: string
}

export interface UserFinancialSettings {
  primaryCurrency: string
  nextIncomeDate: ISODate | null
  expectedIncomeMinor: number | null
  emergencyBufferMinor: number
  monthlySavingsTargetMinor: number | null
  /** Stored for future custom planning periods. v1 uses calendar months. */
  planningStartDay: number
  recurringTolerancePct: number
  onboardingComplete: boolean
  aiProvider: AiProviderId
  aiModel: string | null
  ollamaUrl: string
  cloudConsent: boolean
  /** Free-text goals the user told the AI CFO during onboarding. */
  goalText: string | null
  /** Current savings + investments the user counts toward financial independence. */
  fiCorpusMinor: number | null
  /** Assumed annual return after inflation, % (user-editable estimate). */
  fiReturnPct: number
  /** Safe withdrawal rate, % (FI number = annual spending ÷ this). */
  fiWithdrawalPct: number
  /** Monthly spending in financial independence; defaults to current average. */
  fiTargetSpendMinor: number | null
}

export interface FiLever {
  id: string
  label: string
  monthlyMinor: number
  monthsSooner: number | null
}

export interface FiProjection {
  currency: string
  monthsOfData: number
  avgMonthlyIncomeMinor: number
  avgMonthlySpendMinor: number
  monthlySavingsMinor: number
  savingRate: number | null
  targetMonthlySpendMinor: number
  fiNumberMinor: number
  corpusMinor: number
  corpusIsSet: boolean
  progressPct: number
  monthsToFi: number | null
  fiDate: ISODate | null
  series: { year: number; corpusMinor: number; fiNumberMinor: number }[]
  levers: FiLever[]
  assumptions: string[]
}

export interface Offer {
  id: string
  merchant: string
  title: string
  details: string
  code: string | null
  validTill: string | null
  sourceUrl: string
  foundAt: string
}

export interface OffersResult {
  offers: Offer[]
  supported: boolean
  reason: string | null
  merchants: string[]
  foundAt: string | null
}

export interface Briefing {
  content: string
  createdAt: string
  provider: string | null
  model: string | null
  byAi: boolean
}

// ---------- AI ----------

export type AiProviderId =
  'none' | 'claude_code' | 'ollama' | 'apple' | 'gemini' | 'anthropic' | 'openai'

export interface AiProviderInfo {
  id: Exclude<AiProviderId, 'none'>
  name: string
  kind: 'local' | 'cloud'
  available: boolean
  /** Why it isn't usable yet, e.g. "Ollama is not running". */
  reason: string | null
  hasKey: boolean
  /** Cloud providers that sign in some other way (Claude Code) need no API key. */
  usesApiKey: boolean
  models: string[]
  defaultModel: string
}

export interface AiStatus {
  provider: AiProviderId
  model: string | null
  ready: boolean
  isCloud: boolean
  providers: AiProviderInfo[]
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  conversationId?: string | null
  role: 'user' | 'assistant'
  content: string
  provider: string | null
  model: string | null
  createdAt: string
}

export type AiEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done'; message: ChatMessage }
  | { requestId: string; type: 'error'; error: string }
  /** The AI is calling a data-source tool (e.g. INDmoney holdings). */
  | { requestId: string; type: 'tool'; label: string }
  | {
      requestId: string
      type: 'pull'
      status: string
      completed: number | null
      total: number | null
    }

// ---------- Import ----------

export interface ParsedCsv {
  filename: string
  fileHash: string
  rows: string[][]
  suggestedHeaderRow: number
  format?: 'csv' | 'pdf'
}

export type StatementReadResult =
  | { status: 'ok'; csv: ParsedCsv; transactionLines: number }
  | { status: 'password_required'; token: string; filename: string; incorrect: boolean }
  | { status: 'not_statement'; reason: string; filename: string }
  | { status: 'payslip'; payslip: Payslip; duplicate: boolean }
  | { status: 'cas'; cas: CasImportInfo; duplicate: boolean }
  | { status: 'unreadable'; reason: string }

export interface ColumnMapping {
  headerRow: number
  dateColumn: number
  descriptionColumn: number
  amountMode: 'signed' | 'debit_credit'
  amountColumn: number | null
  /** For signed amounts: are positive numbers money in (bank) or money out (most card exports)? */
  positiveMeans: 'inflow' | 'outflow'
  debitColumn: number | null
  creditColumn: number | null
  balanceColumn: number | null
  dateOrder: DateOrder
}

export interface ImportAccountChoice {
  existingAccountId: string | null
  name: string
  type: AccountType
}

export interface ImportCommitInput {
  filename: string
  fileHash: string
  rows: string[][]
  mapping: ColumnMapping
  account: ImportAccountChoice
  isSample?: boolean
}

export type QuickImportResult =
  | { status: 'imported'; summary: ImportSummary; mapping: ColumnMapping; mappedBy: 'auto' | 'ai' }
  | {
      status: 'needs_review'
      mapping: ColumnMapping
      reasons: string[]
      accountType: AccountType
      accountName: string
    }

export interface ImportAnalysis {
  totalRows: number
  newRows: number
  duplicateRows: number
  /** Set when this exact file was imported before. */
  sameFile: { importedAt: string; accountName: string } | null
  /** Existing account this statement appears to belong to. */
  suggestedAccountId: string | null
  suggestedAccountName: string | null
}

export interface ImportSummary {
  importSourceId: string | null
  accountId: string
  accountName: string
  totalRows: number
  importedCount: number
  duplicateCount: number
  invalidCount: number
  needsReviewCount: number
  dateRangeStart: ISODate | null
  dateRangeEnd: ISODate | null
  latestMonth: MonthKey | null
  balanceUpdated: boolean
  /** True when the statement was routed to an existing account automatically. */
  autoMatchedAccount: boolean
  /** Duplicate rows removed by the post-import clean-up across all imports. */
  cleanedUp: number
}

// ---------- Reports ----------

export interface EvidenceTx {
  id: string
  date: ISODate
  merchant: string
  description: string
  amountMinor: number
  categoryId: string | null
}

export interface CalcLine {
  label: string
  amountMinor?: number
  text?: string
  op?: '+' | '−' | '='
}

export interface Evidence {
  calculation: CalcLine[]
  transactions: EvidenceTx[]
  notes: string[]
}

export interface Insight {
  id: string
  month: MonthKey
  type: string
  title: string
  summary: string
  action: string
  why: string
  estimatedImpactMinor: number | null
  impactLabel: string | null
  confidence: number | null
  severity: Severity
  isEstimate: boolean
  evidence: Evidence
  completed?: boolean
}

export interface CategoryTotal {
  categoryId: string
  spendMinor: number
  count: number
}

export interface MonthSummary {
  month: MonthKey
  incomeMinor: number
  spendingMinor: number
  investedMinor: number
  netCashFlowMinor: number
  savingRate: number | null
  transactionCount: number
  transferCount: number
  byCategory: CategoryTotal[]
  coverageStart: ISODate | null
  coverageEnd: ISODate | null
}

export interface ChangeDriver {
  kind: 'category' | 'one_off' | 'previous_one_off'
  label: string
  categoryId: string | null
  diffMinor: number
  currentMinor: number
  previousMinor: number
  note: string
  transactions: EvidenceTx[]
}

export interface MonthComparison {
  previousMonth: MonthKey
  hasPrevious: boolean
  spendingDiffMinor: number
  incomeDiffMinor: number
  netDiffMinor: number
  headline: string
  drivers: ChangeDriver[]
}

export interface CommitmentOccurrence {
  commitmentId: string
  merchantName: string
  date: ISODate
  amountMinor: number
  status: CommitmentStatus
}

export type SafeToSpend =
  | {
      status: 'ok'
      valueMinor: number
      shortfallMinor: number
      availableCashMinor: number
      commitmentsMinor: number
      bufferMinor: number
      nextIncomeDate: ISODate
      daysUntilIncome: number
      dailyAllowanceMinor: number
      accounts: { id: string; name: string; balanceMinor: number; balanceAsOf: ISODate | null }[]
      commitments: CommitmentOccurrence[]
    }
  | { status: 'needs_setup'; missing: ('balance' | 'next_income_date')[] }

export interface GoalProjection {
  goalId: string
  name: string
  targetAmountMinor: number
  currentAmountMinor: number
  remainingMinor: number
  progressPct: number
  targetDate: ISODate
  monthsRemaining: number
  requiredMonthlyMinor: number
  monthlyContributionMinor: number | null
  projectedCompletionDate: ISODate | null
  onTrack: boolean | null
  gapMonthlyMinor: number
  isComplete: boolean
  assumptions: string[]
}

export interface TrendPoint {
  month: MonthKey
  incomeMinor: number
  spendingMinor: number
  byCategory: CategoryTotal[]
}

export interface MonthlyCloseReport {
  month: MonthKey
  currency: string
  today: ISODate
  hasData: boolean
  isPartialMonth: boolean
  current: MonthSummary
  previous: MonthSummary | null
  comparison: MonthComparison
  oneOffs: EvidenceTx[]
  safeToSpend: SafeToSpend
  upcoming: { items: CommitmentOccurrence[]; totalMinor: number; untilDate: ISODate }
  goals: GoalProjection[]
  insights: Insight[]
  narrative: string[]
  trend: TrendPoint[]
  needsReviewCount: number
  daily: DayPoint[]
  topMerchants: MerchantTotal[]
}

export interface DayPoint {
  day: number
  date: ISODate
  spendMinor: number
  incomeMinor: number
  count: number
  cumulativeMinor: number
  /** Previous month's cumulative spend on the same day number (null if no data / shorter month). */
  prevCumulativeMinor: number | null
}

export interface MerchantTotal {
  merchant: string
  categoryId: string | null
  spendMinor: number
  count: number
}

// ---------- Potential savings ----------

export type SavingsKind =
  'subscription' | 'fees' | 'category' | 'card_rewards' | 'duplicate' | 'alternative'

export interface SavingsOpportunity {
  id: string
  kind: SavingsKind
  title: string
  detail: string
  monthlyMinor: number
  /** Category the saving comes from, used to avoid double counting. */
  categoryId?: string | null
  effort: 'easy' | 'medium'
  confidence: number
  evidence: Evidence
}

export interface CardEstimate {
  cardId: string
  name: string
  issuer: string
  annualFeeMinor: number
  monthlyRewardMinor: number
  netMonthlyGainMinor: number
  bestFor: string[]
}

export interface SavingsReport {
  month: MonthKey
  currency: string
  totalMonthlyMinor: number
  opportunities: SavingsOpportunity[]
  cards: CardEstimate[]
  cardsNote: string | null
  assumptions: string[]
}

export interface MonthInfo {
  month: MonthKey
  transactionCount: number
  firstDate: ISODate
  lastDate: ISODate
}

export interface IndmoneyStatus {
  connected: boolean
  lastSyncedAt: string | null
}

/** Raw output of one INDmoney MCP tool (`__tools` holds the server's tool list). */
export interface IndmoneySnapshot {
  tool: string
  content: string
  syncedAt: string
}

/** `session`: the server hands out a login link per connection (Zerodha Kite, FYERS). */
export type DataSourceAuth = 'oauth' | 'token' | 'none' | 'session'
export type DataSourceGroup = 'money' | 'broker' | 'market' | 'custom'

export interface DataSourceTool {
  name: string
  description: string
  /** Tools that could change something (save, add, trade…) are never offered to the AI. */
  blocked: boolean
}

/** An MCP server the AI CFO can read from. */
export interface DataSourceInfo {
  id: string
  name: string
  url: string
  auth: DataSourceAuth
  group: DataSourceGroup
  enabled: boolean
  builtin: boolean
  connected: boolean
  about: string | null
  /** Null until the server has been reached. */
  tools: DataSourceTool[] | null
  error: string | null
}

export interface ProfileEntry {
  key: string
  value: string
  source: 'questionnaire' | 'chat'
  updatedAt: string
}

/** A Consolidated Account Statement (holdings across brokers / fund houses) that was imported. */
export interface CasImportInfo {
  id: string
  kind: 'nsdl' | 'cdsl' | 'cams' | 'kfintech'
  filename: string
  statementDate: string | null
  totalValueMinor: number
  /** Account labels (e.g. "CDSL demat – Groww"); no identifiers. */
  accounts: string[]
  holdingCount: number
  importedAt: string
}

export interface AppInfo {
  version: string
  dataDirectory: string
  databaseFile: string
}

export interface TransactionFilter {
  from?: ISODate | null
  to?: ISODate | null
  accountId?: string | null
  categoryId?: string | null
  direction?: Direction | null
  search?: string | null
  needsReview?: boolean
  limit?: number
}

export interface AiCategoriseResult {
  /** Transactions re-filed by the improved rules / remembered AI answers. */
  reapplied: number
  /** Distinct merchants sent to the AI. */
  asked: number
  /** Transactions the AI re-categorised. */
  updated: number
  aiUsed: boolean
}

// ---------- Money in & out ----------

export interface TxSuggestion {
  /** free = a free alternative; cheaper = cheaper service/plan; habit = change how you buy; avoid = avoidable charge */
  kind: 'free' | 'cheaper' | 'habit' | 'avoid'
  title: string
  detail: string
  alternatives: string[]
  /** Estimated monthly saving in minor units. */
  monthlySavingMinor: number
  /** How the estimate was sized, in plain words. */
  basis: string
  source: 'catalogue' | 'ai'
}

export interface FlowTx {
  id: string
  date: ISODate
  description: string
  amountMinor: number
  accountName: string
  autoDebit: boolean
}

export interface FlowMerchant {
  key: string
  merchant: string
  categoryId: string | null
  /** Total in the selected month (positive). */
  totalMinor: number
  /** Average per month over the last 3 months with data (positive). */
  monthlyMinor: number
  count: number
  recurring: boolean
  autoDebit: boolean
  suggestion: TxSuggestion | null
  /** Better way to pay here (card / UPI app), if any. */
  payTip: PayTip | null
  transactions: FlowTx[]
}

export interface FlowCategory {
  categoryId: string
  kind: CategoryKind
  totalMinor: number
  sharePct: number
  /** Average of the previous 3 months, for "vs usual". Null when there is no history. */
  usualMinor: number | null
  count: number
  merchants: FlowMerchant[]
}

export interface FlowSubscription {
  key: string
  merchant: string
  categoryId: string | null
  amountMinor: number
  cadence: Cadence
  monthlyMinor: number
  nextExpectedDate: ISODate | null
  lastSeenDate: ISODate | null
  autoDebit: boolean
  overlapGroup: string | null
  priceRisePct: number | null
  suggestion: TxSuggestion | null
}

export interface HiddenCost {
  id: string
  kind: 'fee' | 'overlap' | 'price_rise' | 'duplicate' | 'small_recurring'
  title: string
  detail: string
  /** Money involved this month (or per month for recurring items). */
  amountMinor: number
  transactions: FlowTx[]
}

export interface IncomingGroup {
  id: 'income' | 'refunds' | 'own_money'
  label: string
  description: string
  totalMinor: number
  merchants: FlowMerchant[]
}

export interface MoneyFlow {
  month: string
  incoming: { totalMinor: number; groups: IncomingGroup[] }
  outgoing: {
    totalMinor: number
    spendingMinor: number
    investingMinor: number
    debtMinor: number
    movedMinor: number
    categories: FlowCategory[]
    subscriptions: FlowSubscription[]
    hidden: HiddenCost[]
    /** Best monthly-saving suggestions across all merchants, largest first. */
    suggestions: (TxSuggestion & {
      merchant: string
      merchantKey: string
      categoryId: string | null
    })[]
    potentialMonthlyMinor: number
    /** Best way to pay at each merchant, largest extra reward first. */
    payTips: (PayTip & { merchant: string; merchantKey: string; monthlyMinor: number })[]
    /** Extra rewards per month if everything was paid the best way. */
    rewardsLeftMinor: number
  }
  netMinor: number
  /** Merchants the AI hasn't been asked about yet (for background suggestions). */
  pendingAiMerchants: number
}

// ---------- Paying smarter (cards, UPI apps) ----------

export type PayChannel = 'upi' | 'card' | 'bank' | 'autodebit' | 'cash' | 'other'

export interface PayRouteView {
  kind: 'card' | 'upi' | 'route'
  label: string
  rate: number
  how: string
}

export interface PayTip {
  playbookId: string
  /** e.g. "Swiggy, Instamart & Dineout" */
  label: string
  /** How it's paid today, e.g. "UPI from your bank account (no rewards)". */
  current: string
  best: PayRouteView
  others: PayRouteView[]
  /** Estimated extra rewards per month vs how it's paid today. */
  monthlyGainMinor: number
  stack?: string
  avoid?: string
}

export interface CardRecommendation {
  cardId: string
  name: string
  issuer: string
  network: string
  annualFeeMinor: number
  /** Fee after the usual spend-based waiver, on this spending. */
  effectiveFeeMinor: number
  annualRewardMinor: number
  /** Extra per year vs today's estimated rewards, after the fee. */
  netAnnualGainMinor: number
  forexSavingMinor: number
  upi: boolean
  lounges: { domestic: number; international: number } | null
  tags: string[]
  bestFor: string[]
  /** Top contributors, e.g. "₹6,000/yr on Swiggy at 10%". */
  why: string[]
  notes: string[]
}

export interface PaymentAdvice {
  asOf: string
  months: number
  /** Annualised reward-eligible spend. */
  annualSpendMinor: number
  /** Estimated rewards earned today (≈1% on cards, nothing on bank UPI). */
  todayAnnualRewardMinor: number
  upiSharePct: number
  foreignAnnualMinor: number
  /** Annualised spend by category (largest first). */
  byCategory: { categoryId: string; annualMinor: number }[]
  cards: CardRecommendation[]
  combo: {
    cardIds: [string, string]
    names: [string, string]
    netAnnualGainMinor: number
    split: string[]
  } | null
  notes: string[]
}

// ---------- Investments ----------

export type InvestmentType = 'mf' | 'fd' | 'stocks' | 'retirement' | 'gold' | 'other'

export interface InvestmentReport {
  month: MonthKey
  /** Past months with data, then projected months (projected: true). */
  series: {
    month: MonthKey
    totalMinor: number
    byType: Record<InvestmentType, number>
    projected: boolean
  }[]
  types: { id: InvestmentType; name: string; color: string }[]
  thisMonthMinor: number
  averageMonthlyMinor: number
  /** From recurring investments (SIPs, RDs, NPS…) seen in at least 2 of the last 3 months. */
  expectedMonthlyMinor: number
  next12MonthsMinor: number
  totalInvestedMinor: number
  recurring: { type: InvestmentType; name: string; monthlyMinor: number }[]
  monthsWithInvesting: number
}

// ---------- Salary slips ----------

export interface PayslipLine {
  label: string
  amountMinor: number
}

export interface Payslip {
  id: string
  /** Pay month, when it could be read from the slip. */
  period: MonthKey | null
  employer: string | null
  grossMinor: number
  netMinor: number
  deductionsMinor: number
  basicMinor: number | null
  hraMinor: number | null
  pfMinor: number | null
  vpfMinor: number | null
  npsMinor: number | null
  taxMinor: number | null
  professionalTaxMinor: number | null
  earnings: PayslipLine[]
  deductions: PayslipLine[]
  fileHash: string
  filename: string
  createdAt: string
}

export interface SalaryProfile {
  latestPeriod: MonthKey | null
  employer: string | null
  grossMonthlyMinor: number
  netMonthlyMinor: number
  annualGrossMinor: number
  takeHomePct: number
  taxMonthlyMinor: number
  /** Employee PF + VPF + NPS deducted each month (retirement savings). */
  retirementMonthlyMinor: number
  financialYear: string | null
  fyTaxMinor: number
  fyRetirementMinor: number
  fyGrossMinor: number
  payslipsInFy: number
  /** The matching salary credit found in the bank statement, if any. */
  creditedMinor: number | null
  creditMatches: boolean
  trend: { period: MonthKey; grossMinor: number; netMinor: number }[]
}
