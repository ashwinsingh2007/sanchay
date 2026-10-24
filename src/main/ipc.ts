import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { apiInputSchemas, type ApiMethod, type CfoApi, type IpcResult } from '../shared/ipc'
import { IPC_PREFIX } from '../shared/ipcChannels'
import {
  getFiProjection,
  getMonthlyClose,
  getInvestments,
  getMoneyFlow,
  getSalaryProfile,
  getMonths,
  getPaymentAdvice,
  getPotentialSavings,
  refreshCommitments
} from './analysis'
import { aiCategorise } from './ai/categorize'
import { suggestAlternatives } from './ai/suggest'
import { getBriefing } from './ai/briefing'
import { findOffers, listOffers } from './ai/offers'
import { readPickedFile, readStatement } from './statementFile'
import * as ai from './ai/service'
import { exportData } from './dataExport'
import type { Db } from './db/client'
import { importStatement, loadSampleData, quickImport } from './importer'
import { analyzeImport } from './duplicates'
import * as repo from './repository'
import { connectIndmoney, disconnectIndmoney, getIndmoneyStatus, syncIndmoney } from './indmoney'
import * as sources from './mcp/sources'
import { deleteProfileEntry, listProfile, setProfileAnswer } from './profile'
import { requestMicrophone, transcribe } from './voice'
import { getCfoReview } from './cfo'
import { deleteCasImport, listCasImports, portfolioRows } from './portfolio'

type Handler<K extends ApiMethod> = (
  input: z.infer<(typeof apiInputSchemas)[K]>,
  event: IpcMainInvokeEvent
) => Awaited<ReturnType<CfoApi[K]>> | ReturnType<CfoApi[K]>

/** Only our own renderer (dev server or packaged file) may call the API. */
function isTrustedSender(event: IpcMainInvokeEvent, devUrl: string | undefined): boolean {
  const url = event.senderFrame?.url ?? ''
  if (url.startsWith('file://')) return true
  return !!devUrl && url.startsWith(devUrl)
}

export function registerIpc(db: Db, info: { dataDirectory: string; databaseFile: string }): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']

  function handle<K extends ApiMethod>(method: K, handler: Handler<K>): void {
    ipcMain.handle(
      `${IPC_PREFIX}${method}`,
      async (event, raw: unknown): Promise<IpcResult<unknown>> => {
        if (!isTrustedSender(event, devUrl)) return { ok: false, error: 'Untrusted sender' }
        const parsed = apiInputSchemas[method].safeParse(raw)
        if (!parsed.success) {
          return {
            ok: false,
            error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'value'} ${i.message}`).join('; ')}`
          }
        }
        try {
          const data = await handler(parsed.data as z.infer<(typeof apiInputSchemas)[K]>, event)
          return { ok: true, data }
        } catch (err) {
          console.error(`[ipc] ${method} failed`, err)
          return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong' }
        }
      }
    )
  }

  const afterDataChange = (): void => {
    refreshCommitments(db)
  }

  handle('getAppInfo', () => ({ version: app.getVersion(), ...info }))
  handle('getSettings', () => repo.getSettings(db))
  handle('updateSettings', (input) => {
    const before = repo.getSettings(db)
    const settings = repo.updateSettings(db, input)
    if (
      input.recurringTolerancePct != null &&
      input.recurringTolerancePct !== before.recurringTolerancePct
    )
      afterDataChange()
    return settings
  })
  handle('listCategories', () => repo.listCategories(db))

  handle('listAccounts', () => repo.listAccounts(db))
  handle('createAccount', (input) =>
    repo.createAccount(db, input, repo.getSettings(db).primaryCurrency)
  )
  handle('updateAccount', (input) => repo.updateAccount(db, input))

  handle('pickStatement', async (_input, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose a bank or card statement',
      properties: ['openFile' as const],
      filters: [{ name: 'Statements (PDF, CSV)', extensions: ['pdf', 'csv', 'txt'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    return readPickedFile(db, file)
  })
  handle('readStatementFile', (input) => readStatement(db, input))
  handle('quickImport', async (input) => {
    const result = await quickImport(db, input)
    if (result.status === 'imported') afterDataChange()
    return result
  })
  handle('analyzeImport', (input) => analyzeImport(db, input))
  handle('commitImport', (input) => {
    const summary = importStatement(db, input)
    afterDataChange()
    return summary
  })
  handle('loadSampleData', () => loadSampleData(db))
  handle('listImportSources', () => repo.listImportSources(db))
  handle('deleteImportSource', (id) => {
    const deletedTransactions = repo.deleteImportSource(db, id)
    afterDataChange()
    return { deletedTransactions }
  })

  handle('listTransactions', (filter) => repo.listTransactions(db, filter))
  handle('updateTransaction', (input) => {
    repo.updateTransaction(db, input)
    if (
      input.isTransfer !== undefined ||
      input.merchantNormalised !== undefined ||
      input.categoryId !== undefined
    ) {
      afterDataChange()
    }
  })
  handle('bulkUpdateCategory', (input) => {
    const updated = repo.bulkUpdateCategory(db, input.ids, input.categoryId)
    afterDataChange()
    return { updated }
  })

  handle('listRules', () => repo.listRules(db))
  handle('createRule', (input) => {
    const result = repo.createRule(db, input)
    if (result.updatedCount > 0) afterDataChange()
    return result
  })
  handle('deleteRule', (id) => repo.deleteRule(db, id))

  handle('listCommitments', () => repo.listCommitments(db))
  handle('updateCommitment', (input) => repo.updateCommitment(db, input))
  handle('redetectCommitments', () => refreshCommitments(db))

  handle('listGoals', () => repo.listGoals(db))
  handle('createGoal', (input) => repo.createGoal(db, input))
  handle('updateGoal', (input) => repo.updateGoal(db, input))
  handle('deleteGoal', (id) => repo.deleteGoal(db, id))

  handle('listMonths', () => getMonths(db))
  handle('getMonthlyClose', (month) => getMonthlyClose(db, month))
  handle('dismissInsight', (id) => repo.dismissInsight(db, id))

  handle('exportData', (format, event) =>
    exportData(db, BrowserWindow.fromWebContents(event.sender), format)
  )
  handle('deleteAllData', () => repo.deleteAllData(db))
  handle('clearImportedData', () => repo.clearImportedData(db))
  handle('getMoneyFlow', (month) => getMoneyFlow(db, month ?? undefined))
  handle('listPayslips', () => repo.listPayslips(db))
  handle('deletePayslip', (id) => repo.deletePayslip(db, id))
  handle('getSalaryProfile', () => getSalaryProfile(db))
  handle('getInvestments', (month) => getInvestments(db, month ?? undefined))
  handle('getPaymentAdvice', (month) => getPaymentAdvice(db, month ?? undefined))
  handle('suggestAlternatives', (month) => suggestAlternatives(db, getMoneyFlow(db, month)))
  handle('recategorise', async () => {
    const result = await aiCategorise(db)
    if (result.reapplied + result.updated > 0) refreshCommitments(db)
    return result
  })

  handle('getAiStatus', () => ai.getAiStatus(db))
  handle('configureAi', (input) => ai.configureAi(db, input))
  handle('testAi', () => ai.testAi(db))
  handle('pullOllamaModel', (model, event) => ai.pullOllamaModel(db, event.sender, model))
  handle('listConversations', () => ai.listConversations(db))
  handle('listChat', (conversationId) => ai.listChat(db, conversationId))
  handle('sendChat', (input, event) => ai.sendChat(db, event.sender, input))
  handle('cancelChat', (id) => ai.cancelChat(id))
  handle('deleteConversation', (id) => ai.deleteConversation(db, id))
  handle('getPotentialSavings', (month) => getPotentialSavings(db, month))
  handle('setInsightDone', (input) => repo.setInsightDone(db, input.id, input.done))
  handle('getFiProjection', (month) => getFiProjection(db, month ?? undefined))
  handle('getBriefing', (refresh) => getBriefing(db, refresh))
  handle('listOffers', () => listOffers(db))
  handle('findOffers', () => findOffers(db))

  handle('getIndmoneyStatus', () => getIndmoneyStatus(db))
  handle('connectIndmoney', () => connectIndmoney(db))
  handle('syncIndmoney', () => syncIndmoney(db))
  handle('disconnectIndmoney', () => disconnectIndmoney(db))
  // INDmoney when synced, otherwise holdings from imported CAS statements.
  handle('listIndmoneySnapshots', () => portfolioRows(db))

  const describe = (): ReturnType<typeof sources.describeSources> =>
    sources.describeSources(db, false)
  handle('listDataSources', (probe) => sources.describeSources(db, probe))
  handle('connectDataSource', async ({ id, token }) => {
    if (id === 'indmoney') await connectIndmoney(db)
    else await sources.signInSource(db, id, token)
    return describe()
  })
  handle('disconnectDataSource', async (id) => {
    if (id === 'indmoney') await disconnectIndmoney(db)
    else await sources.signOutSource(db, id)
    return describe()
  })
  handle('addDataSource', (input) => {
    sources.addSource(db, input)
    return describe()
  })
  handle('removeDataSource', async (id) => {
    await sources.removeSource(db, id)
    return describe()
  })
  handle('setDataSourceEnabled', ({ id, enabled }) => {
    sources.setSourceEnabled(db, id, enabled)
    return describe()
  })

  handle('listProfile', () => listProfile(db))
  handle('saveProfileAnswer', ({ key, value }) => {
    if (value.trim()) setProfileAnswer(db, key, value, 'questionnaire')
    else deleteProfileEntry(db, key)
    return listProfile(db)
  })
  handle('deleteProfileEntry', (key) => {
    deleteProfileEntry(db, key)
    return listProfile(db)
  })

  handle('requestMicrophone', () => requestMicrophone())
  handle('transcribeAudio', ({ data, mimeType }) => transcribe(db, data, mimeType))
  handle('getCfoReview', () => getCfoReview(db))
  handle('listCasImports', () => listCasImports(db))
  handle('deleteCasImport', (id) => deleteCasImport(db, id))
}
