import { writeFileSync } from 'node:fs'
import { dialog, type BrowserWindow } from 'electron'
import { todayISO } from '../shared/dates'
import { currencyInfo, minorToDecimalString } from '../shared/money'
import type { Db } from './db/client'
import * as s from './db/schema'
import { listCategories } from './repository'

function csvCell(value: unknown): string {
  const str = value == null ? '' : String(value)
  // Prefix formula-like values so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(str) && !/^-?\d/.test(str) ? `'${str}` : str
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function buildJson(db: Db): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'Sanchay',
      note: 'All amounts are integer minor units (e.g. paise or cents).',
      settings: db.select().from(s.userSettings).all(),
      accounts: db.select().from(s.accounts).all(),
      importSources: db.select().from(s.importSources).all(),
      categories: db.select().from(s.categories).all(),
      transactions: db.select().from(s.transactions).all(),
      merchantRules: db.select().from(s.merchantRules).all(),
      recurringCommitments: db.select().from(s.recurringCommitments).all(),
      savingsGoals: db.select().from(s.savingsGoals).all(),
      insights: db.select().from(s.insights).all()
    },
    null,
    2
  )
}

function buildCsv(db: Db): string {
  const categories = new Map(listCategories(db).map((c) => [c.id, c.name]))
  const accounts = new Map(
    db
      .select()
      .from(s.accounts)
      .all()
      .map((a) => [a.id, a.name])
  )
  const header = [
    'date',
    'account',
    'description',
    'merchant',
    'amount',
    'currency',
    'direction',
    'category',
    'is_recurring',
    'is_transfer',
    'notes'
  ]
  const lines = db
    .select()
    .from(s.transactions)
    .all()
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
    .map((t) =>
      [
        t.transactionDate,
        accounts.get(t.accountId) ?? '',
        t.descriptionOriginal,
        t.merchantNormalised,
        minorToDecimalString(t.amountMinor, currencyInfo(t.currency).decimals),
        t.currency,
        t.direction,
        categories.get(t.categoryId ?? '') ?? '',
        t.isRecurring ? 'yes' : 'no',
        t.isTransfer ? 'yes' : 'no',
        t.notes ?? ''
      ]
        .map(csvCell)
        .join(',')
    )
  return [header.join(','), ...lines].join('\n') + '\n'
}

export async function exportData(
  db: Db,
  window: BrowserWindow | null,
  format: 'json' | 'csv'
): Promise<{ saved: boolean; path?: string }> {
  const defaultPath = `personal-cfo-${format === 'json' ? 'backup' : 'transactions'}-${todayISO()}.${format}`
  const options = {
    title: format === 'json' ? 'Export all data (JSON)' : 'Export transactions (CSV)',
    defaultPath,
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  }
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { saved: false }
  writeFileSync(result.filePath, format === 'json' ? buildJson(db) : buildCsv(db), 'utf8')
  return { saved: true, path: result.filePath }
}
