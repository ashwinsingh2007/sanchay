import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { CasHolding, CasStatement } from '../shared/domain/cas'
import type { CasImportInfo, IndmoneySnapshot } from '../shared/types'
import type { Db } from './db/client'
import * as s from './db/schema'
import { listIndmoneySnapshots } from './indmoney'
import { listAccounts } from './repository'

/**
 * The portfolio every screen and the CFO review read: the INDmoney sync when there is one,
 * otherwise the latest CAS statements (NSDL/CDSL demat + CAMS/KFintech funds) plus bank balances
 * from imported statements. CAS data is shaped like INDmoney's so the same views work for both.
 */

// ---------- Storing CAS imports ----------

export function saveCas(
  db: Db,
  cas: CasStatement,
  filename: string,
  fileHash: string
): { info: CasImportInfo; duplicate: boolean } {
  const existing = db.select().from(s.casImports).where(eq(s.casImports.fileHash, fileHash)).get()
  if (existing) return { info: toInfo(existing), duplicate: true }
  const row = {
    id: randomUUID(),
    kind: cas.kind,
    filename,
    fileHash,
    statementDate: cas.statementDate,
    totalValueMinor: Math.round(cas.totalValue * 100),
    content: JSON.stringify(cas),
    importedAt: new Date().toISOString()
  }
  db.insert(s.casImports).values(row).run()
  return { info: toInfo(row), duplicate: false }
}

function toInfo(row: typeof s.casImports.$inferSelect): CasImportInfo {
  const cas = JSON.parse(row.content) as CasStatement
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    statementDate: row.statementDate,
    totalValueMinor: row.totalValueMinor,
    accounts: cas.accounts.map((a) => a.label),
    holdingCount: cas.accounts.reduce((n, a) => n + a.holdings.length, 0),
    importedAt: row.importedAt
  }
}

export function listCasImports(db: Db): CasImportInfo[] {
  return db.select().from(s.casImports).orderBy(desc(s.casImports.importedAt)).all().map(toInfo)
}

export function deleteCasImport(db: Db, id: string): void {
  db.delete(s.casImports).where(eq(s.casImports.id, id)).run()
}

/** Latest statement of each kind (by statement date, then import time). */
function latestCas(db: Db): CasStatement[] {
  const rows = db.select().from(s.casImports).all()
  const best = new Map<string, typeof s.casImports.$inferSelect>()
  for (const r of rows) {
    const cur = best.get(r.kind)
    const key = (x: typeof r): string => `${x.statementDate ?? ''}|${x.importedAt}`
    if (!cur || key(r) > key(cur)) best.set(r.kind, r)
  }
  return [...best.values()].map((r) => JSON.parse(r.content) as CasStatement)
}

// ---------- One portfolio for every screen ----------

type HoldingType = 'IND_STOCK' | 'MF' | 'BOND'

const typeOf = (h: CasHolding): HoldingType | null =>
  h.kind === 'equity' || h.kind === 'etf'
    ? 'IND_STOCK'
    : h.kind === 'mutual_fund'
      ? 'MF'
      : h.kind === 'bond'
        ? 'BOND'
        : null

/** Rough asset class from a fund's name (CAS has no category). */
function fundClass(name: string): string {
  if (/liquid|overnight|money market/i.test(name)) return 'Liquid'
  if (/debt|bond|gilt|corporate|duration|credit risk|banking & psu|treasury|income/i.test(name))
    return 'Debt'
  if (/hybrid|balanced|asset allocation|multi asset|arbitrage|savings fund/i.test(name))
    return 'Others'
  if (/gold|silver/i.test(name)) return 'Gold'
  return 'Equity'
}

function casRows(db: Db): IndmoneySnapshot[] {
  const statements = latestCas(db)
  if (statements.length === 0) return []
  // CAMS/KFintech fund statements carry cost; when present they replace the fund folios a demat
  // CAS also lists, so funds are never counted twice.
  const hasFundCas = statements.some((c) => c.kind === 'cams' || c.kind === 'kfintech')
  const holdings: Record<HoldingType, Record<string, unknown>[]> = {
    IND_STOCK: [],
    MF: [],
    BOND: []
  }
  const assets = new Map<string, { invested: number; current: number }>()
  const addAsset = (cls: string, invested: number, current: number): void => {
    const a = assets.get(cls) ?? { invested: 0, current: 0 }
    assets.set(cls, { invested: a.invested + invested, current: a.current + current })
  }
  let latestDate = ''
  for (const cas of statements) {
    if ((cas.statementDate ?? '') > latestDate) latestDate = cas.statementDate ?? ''
    const isDemat = cas.kind === 'nsdl' || cas.kind === 'cdsl'
    for (const account of cas.accounts) {
      if (isDemat && hasFundCas && account.type === 'mf_folios') continue
      for (const h of account.holdings) {
        const type = typeOf(h)
        if (!type) continue
        holdings[type].push({
          investment: h.name,
          investment_code: h.isin ?? h.folio ?? h.name,
          market_value: h.value,
          invested_amount: h.cost ?? h.value,
          total_pnl: h.cost != null ? h.value - h.cost : 0,
          pnl_per: h.cost ? ((h.value - h.cost) / h.cost) * 100 : 0,
          total_units: h.units,
          unit_price: h.price,
          broker: account.label
        })
        const cls = type === 'MF' ? fundClass(h.name) : type === 'BOND' ? 'Debt' : 'Equity'
        addAsset(cls, h.cost ?? h.value, h.value)
      }
    }
  }

  // Cash: bank balances from imported statements (a CAS has no bank accounts).
  const bankRupees =
    listAccounts(db)
      .filter((a) => a.type === 'bank' || a.type === 'cash')
      .reduce((t, a) => t + (a.currentBalanceMinor ?? 0), 0) / 100
  const bankHoldings = listAccounts(db)
    .filter((a) => (a.type === 'bank' || a.type === 'cash') && a.currentBalanceMinor)
    .map((a) => ({
      investment: a.name,
      investment_code: a.id,
      market_value: a.currentBalanceMinor! / 100,
      invested_amount: a.currentBalanceMinor! / 100,
      total_pnl: 0,
      pnl_per: 0
    }))
  if (bankRupees > 0) addAsset('Liquid', bankRupees, bankRupees)

  const sum = (list: Record<string, unknown>[], key: string): number =>
    list.reduce((t, h) => t + (Number(h[key]) || 0), 0)
  const total = [...assets.values()].reduce((t, a) => t + a.current, 0)
  const investedTotal = [...assets.values()].reduce((t, a) => t + a.invested, 0)
  const investment = (
    asset_type: string,
    list: Record<string, unknown>[]
  ): Record<string, unknown> => {
    const current = sum(list, 'market_value')
    const invested = sum(list, 'invested_amount')
    return {
      asset_type,
      invested_value: invested,
      current_value: current,
      return: current - invested,
      return_percentage: invested ? ((current - invested) / invested) * 100 : 0,
      progress_value_percentage: total ? (current / total) * 100 : 0
    }
  }
  const investments = [
    investment('STOCK', holdings.IND_STOCK),
    investment('MF', holdings.MF),
    investment('BOND', holdings.BOND),
    investment('SA', bankHoldings)
  ].filter((i) => Number(i['current_value']) > 0)

  const syncedAt = latestDate ? `${latestDate}T00:00:00.000Z` : new Date().toISOString()
  const row = (tool: string, content: unknown): IndmoneySnapshot => ({
    tool,
    content: JSON.stringify(content),
    syncedAt
  })
  const rows: IndmoneySnapshot[] = [
    row('networth_snapshot', {
      source: 'cas',
      total_invested: investedTotal,
      total_current_value: total,
      total_networth: total,
      investments,
      assets: [...assets.entries()].map(([cls, a]) => ({
        assetclass_l2: cls,
        invested_value: a.invested,
        current_value: a.current,
        return: a.current - a.invested,
        return_percentage: a.invested ? ((a.current - a.invested) / a.invested) * 100 : 0,
        progress_value_percentage: total ? (a.current / total) * 100 : 0
      })),
      liabilities: { total: 0, loans: [], credit_cards: [] },
      data_notes: {
        source: `From your CAS statement${statements.length > 1 ? 's' : ''}${latestDate ? ` dated ${latestDate}` : ''} and bank statements. Loans and card dues aren't in a CAS.`
      }
    })
  ]
  for (const [type, list] of Object.entries(holdings))
    if (list.length > 0) rows.push(row(`networth_holdings:${type}`, { holdings: list }))
  if (bankHoldings.length > 0) rows.push(row('networth_holdings:SA', { holdings: bankHoldings }))
  return rows
}

/** INDmoney when synced, otherwise CAS + bank balances. */
export function portfolioRows(db: Db): IndmoneySnapshot[] {
  const indmoney = listIndmoneySnapshots(db)
  if (indmoney.some((r) => r.tool === 'networth_snapshot')) return indmoney
  return casRows(db)
}
