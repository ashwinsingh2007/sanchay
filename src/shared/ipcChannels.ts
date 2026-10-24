import type { ApiMethod } from './ipc'

/**
 * Dependency-free list of IPC methods, used by the sandboxed preload script (which cannot load
 * npm packages). The type assertion below fails to compile if this list drifts from `CfoApi`.
 */
export const API_METHODS = [
  'getAppInfo',
  'getSettings',
  'updateSettings',
  'listCategories',
  'listAccounts',
  'createAccount',
  'updateAccount',
  'pickStatement',
  'readStatementFile',
  'quickImport',
  'analyzeImport',
  'commitImport',
  'loadSampleData',
  'listImportSources',
  'deleteImportSource',
  'listTransactions',
  'updateTransaction',
  'bulkUpdateCategory',
  'listRules',
  'createRule',
  'deleteRule',
  'listCommitments',
  'updateCommitment',
  'redetectCommitments',
  'listGoals',
  'createGoal',
  'updateGoal',
  'deleteGoal',
  'listMonths',
  'getMonthlyClose',
  'dismissInsight',
  'exportData',
  'deleteAllData',
  'clearImportedData',
  'recategorise',
  'getMoneyFlow',
  'getPaymentAdvice',
  'getInvestments',
  'listPayslips',
  'deletePayslip',
  'getSalaryProfile',
  'suggestAlternatives',
  'getAiStatus',
  'configureAi',
  'testAi',
  'pullOllamaModel',
  'listConversations',
  'listChat',
  'sendChat',
  'cancelChat',
  'deleteConversation',
  'getPotentialSavings',
  'setInsightDone',
  'getFiProjection',
  'getBriefing',
  'listOffers',
  'findOffers',
  'getIndmoneyStatus',
  'connectIndmoney',
  'syncIndmoney',
  'disconnectIndmoney',
  'listIndmoneySnapshots',
  'listDataSources',
  'connectDataSource',
  'disconnectDataSource',
  'addDataSource',
  'removeDataSource',
  'setDataSourceEnabled',
  'listProfile',
  'saveProfileAnswer',
  'deleteProfileEntry',
  'requestMicrophone',
  'transcribeAudio',
  'getCfoReview',
  'listCasImports',
  'deleteCasImport'
] as const satisfies readonly ApiMethod[]

type Missing = Exclude<ApiMethod, (typeof API_METHODS)[number]>
// If this errors, a CfoApi method is missing from API_METHODS.
const _exhaustive: Missing extends never ? true : Missing = true
void _exhaustive

export const IPC_PREFIX = 'cfo:'
/** Main → renderer push channel for streaming AI output and model downloads. */
export const AI_EVENT_CHANNEL = 'cfo:ai-event'
