import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { CalcLine, Evidence } from '../../shared/types'

/**
 * SQLite schema. All money columns are INTEGER minor units. Dates are ISO strings
 * ("YYYY-MM-DD"); timestamps are ISO-8601 strings.
 * After editing, run `npm run db:generate` to create a new SQL migration.
 */

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['bank', 'credit_card', 'cash', 'investment_placeholder'] }).notNull(),
  currency: text('currency').notNull(),
  currentBalanceMinor: integer('current_balance_minor'),
  balanceAsOf: text('balance_as_of'),
  balanceSource: text('balance_source', { enum: ['manual', 'statement'] }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const importSources = sqliteTable(
  'import_sources',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    importedAt: text('imported_at').notNull(),
    rowCount: integer('row_count').notNull(),
    importedCount: integer('imported_count').notNull(),
    duplicateCount: integer('duplicate_count').notNull(),
    sourceHash: text('source_hash').notNull(),
    dateRangeStart: text('date_range_start'),
    dateRangeEnd: text('date_range_end'),
    isSample: integer('is_sample', { mode: 'boolean' }).notNull().default(false)
  },
  (t) => [index('import_sources_account_idx').on(t.accountId)]
)

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['income', 'expense', 'savings', 'transfer'] }).notNull(),
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull()
})

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    importSourceId: text('import_source_id').references(() => importSources.id, {
      onDelete: 'cascade'
    }),
    transactionDate: text('transaction_date').notNull(),
    descriptionOriginal: text('description_original').notNull(),
    descriptionKey: text('description_key').notNull(),
    merchantNormalised: text('merchant_normalised').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    direction: text('direction', { enum: ['income', 'expense', 'transfer', 'unknown'] }).notNull(),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    categoryConfidence: real('category_confidence').notNull(),
    categorySource: text('category_source', {
      enum: ['user_rule', 'keyword', 'ai', 'fallback', 'manual']
    }).notNull(),
    isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
    isTransfer: integer('is_transfer', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    index('transactions_date_idx').on(t.transactionDate),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_source_idx').on(t.importSourceId),
    index('transactions_dedupe_idx').on(t.accountId, t.transactionDate, t.amountMinor)
  ]
)

/**
 * Which statements contain each transaction. Overlapping statements share rows, so a
 * transaction is only deleted when the last statement that contains it is removed.
 */
export const transactionSources = sqliteTable(
  'transaction_sources',
  {
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    importSourceId: text('import_source_id')
      .notNull()
      .references(() => importSources.id, { onDelete: 'cascade' })
  },
  (t) => [
    uniqueIndex('transaction_sources_pk').on(t.transactionId, t.importSourceId),
    index('transaction_sources_source_idx').on(t.importSourceId)
  ]
)

export const merchantRules = sqliteTable('merchant_rules', {
  id: text('id').primaryKey(),
  matchType: text('match_type', { enum: ['contains', 'exact', 'regex'] }).notNull(),
  matchValue: text('match_value').notNull(),
  merchantNormalised: text('merchant_normalised'),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull().default(100),
  createdAt: text('created_at').notNull()
})

export const recurringCommitments = sqliteTable(
  'recurring_commitments',
  {
    id: text('id').primaryKey(),
    merchantKey: text('merchant_key').notNull(),
    merchantName: text('merchant_name').notNull(),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    typicalAmountMinor: integer('typical_amount_minor').notNull(),
    cadence: text('cadence', { enum: ['monthly', 'quarterly', 'yearly', 'custom'] }).notNull(),
    nextExpectedDate: text('next_expected_date'),
    lastSeenDate: text('last_seen_date'),
    confidence: real('confidence').notNull(),
    status: text('status', { enum: ['active', 'review', 'ignored'] }).notNull(),
    userConfirmed: integer('user_confirmed', { mode: 'boolean' }).notNull().default(false),
    userEdited: integer('user_edited', { mode: 'boolean' }).notNull().default(false),
    linkedTransactionIds: text('linked_transaction_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (t) => [uniqueIndex('recurring_merchant_key_idx').on(t.merchantKey)]
)

export const savingsGoals = sqliteTable('savings_goals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  targetAmountMinor: integer('target_amount_minor').notNull(),
  currentAmountMinor: integer('current_amount_minor').notNull(),
  targetDate: text('target_date').notNull(),
  monthlyContributionMinor: integer('monthly_contribution_minor'),
  priority: integer('priority').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey(),
  primaryCurrency: text('primary_currency').notNull(),
  nextIncomeDate: text('next_income_date'),
  expectedIncomeMinor: integer('expected_income_minor'),
  emergencyBufferMinor: integer('emergency_buffer_minor').notNull().default(0),
  monthlySavingsTargetMinor: integer('monthly_savings_target_minor'),
  planningStartDay: integer('planning_start_day').notNull().default(1),
  recurringTolerancePct: integer('recurring_tolerance_pct').notNull().default(15),
  onboardingComplete: integer('onboarding_complete', { mode: 'boolean' }).notNull().default(false),
  aiProvider: text('ai_provider', {
    enum: ['none', 'claude_code', 'ollama', 'apple', 'gemini', 'anthropic', 'openai']
  })
    .notNull()
    .default('none'),
  aiModel: text('ai_model'),
  ollamaUrl: text('ollama_url').notNull().default('http://127.0.0.1:11434'),
  cloudConsent: integer('cloud_consent', { mode: 'boolean' }).notNull().default(false),
  goalText: text('goal_text'),
  // Financial independence assumptions (all user-editable estimates).
  fiCorpusMinor: integer('fi_corpus_minor'),
  fiReturnPct: real('fi_return_pct').notNull().default(5),
  fiWithdrawalPct: real('fi_withdrawal_pct').notNull().default(4),
  fiTargetSpendMinor: integer('fi_target_spend_minor')
})

/** Cached AI outputs (weekly briefing) keyed by the data they were generated from. */
export const aiNotes = sqliteTable('ai_notes', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  contextHash: text('context_hash').notNull(),
  provider: text('provider'),
  model: text('model'),
  createdAt: text('created_at').notNull()
})

/** Categories Sanchay decided per merchant, reused on future imports. */
export const aiCategories = sqliteTable('ai_categories', {
  key: text('key').primaryKey(),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  merchant: text('merchant').notNull(),
  createdAt: text('created_at').notNull()
})

/** Salary slips the user uploaded (parsed on this Mac). */
export const payslips = sqliteTable('payslips', {
  id: text('id').primaryKey(),
  period: text('period'),
  employer: text('employer'),
  grossMinor: integer('gross_minor').notNull(),
  netMinor: integer('net_minor').notNull(),
  deductionsMinor: integer('deductions_minor').notNull(),
  basicMinor: integer('basic_minor'),
  hraMinor: integer('hra_minor'),
  pfMinor: integer('pf_minor'),
  vpfMinor: integer('vpf_minor'),
  npsMinor: integer('nps_minor'),
  taxMinor: integer('tax_minor'),
  professionalTaxMinor: integer('professional_tax_minor'),
  earnings: text('earnings').notNull(),
  deductions: text('deductions').notNull(),
  fileHash: text('file_hash').notNull().unique(),
  filename: text('filename').notNull(),
  createdAt: text('created_at').notNull()
})

/** Live offers found by web search for the user's merchants. */
export const offers = sqliteTable('offers', {
  id: text('id').primaryKey(),
  merchant: text('merchant').notNull(),
  title: text('title').notNull(),
  details: text('details').notNull(),
  code: text('code'),
  validTill: text('valid_till'),
  sourceUrl: text('source_url').notNull(),
  foundAt: text('found_at').notNull()
})

/** API keys for optional cloud AI providers, encrypted with the macOS Keychain (safeStorage). */
export const secrets = sqliteTable('secrets', {
  name: text('name').primaryKey(),
  encrypted: text('encrypted').notNull(),
  updatedAt: text('updated_at').notNull()
})

/** Latest read-only portfolio data pulled from INDmoney's MCP server, one row per tool. */
export const indmoneySnapshots = sqliteTable('indmoney_snapshots', {
  tool: text('tool').primaryKey(),
  content: text('content').notNull(),
  syncedAt: text('synced_at').notNull()
})

/**
 * Imported Consolidated Account Statements (NSDL/CDSL demat CAS, CAMS/KFintech MF CAS): every
 * stock, ETF, bond and fund the user holds across brokers, without any sign-in. The parsed
 * statement is kept as JSON; the latest one of each kind is used.
 */
export const casImports = sqliteTable('cas_imports', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['nsdl', 'cdsl', 'cams', 'kfintech'] }).notNull(),
  filename: text('filename').notNull(),
  fileHash: text('file_hash').notNull().unique(),
  statementDate: text('statement_date'),
  totalValueMinor: integer('total_value_minor').notNull(),
  content: text('content').notNull(),
  importedAt: text('imported_at').notNull()
})

/** MCP servers the AI CFO can read from: INDmoney, Tapetide and any the user adds. */
export const dataSources = sqliteTable('data_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  auth: text('auth', { enum: ['oauth', 'token', 'none', 'session'] }).notNull(),
  /** How this app authenticates at the OAuth token endpoint ("none" = public client + PKCE). */
  tokenAuthMethod: text('token_auth_method', {
    enum: ['none', 'client_secret_post', 'client_secret_basic']
  })
    .notNull()
    .default('none'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull()
})

/** What the AI CFO knows about the user beyond statements: setup answers and facts from chat. */
export const cfoProfile = sqliteTable('cfo_profile', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  source: text('source', { enum: ['questionnaire', 'chat'] }).notNull(),
  updatedAt: text('updated_at').notNull()
})

/** A chat thread with the AI CFO; messages belong to one. */
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const chatMessages = sqliteTable('chat_messages', {
  conversationId: text('conversation_id').references(() => conversations.id, {
    onDelete: 'cascade'
  }),
  id: text('id').primaryKey(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  provider: text('provider'),
  model: text('model'),
  createdAt: text('created_at').notNull()
})

export const insights = sqliteTable(
  'insights',
  {
    id: text('id').primaryKey(),
    month: text('month').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    estimatedImpactMinor: integer('estimated_impact_minor'),
    confidence: real('confidence'),
    severity: text('severity', { enum: ['info', 'attention', 'high'] }).notNull(),
    evidenceJson: text('evidence_json', { mode: 'json' })
      .$type<Evidence | { calculation: CalcLine[] }>()
      .notNull(),
    createdAt: text('created_at').notNull(),
    dismissedAt: text('dismissed_at'),
    completedAt: text('completed_at')
  },
  (t) => [index('insights_month_idx').on(t.month)]
)
