import type { IndmoneySnapshot, IndmoneyStatus } from '../shared/types'
import type { Db } from './db/client'
import * as s from './db/schema'
import {
  callSourceTool,
  getSourceRow,
  isConnected,
  signInSource,
  signOutSource,
  sourceSession
} from './mcp/sources'

/**
 * Pulls a snapshot of the user's INDmoney portfolio into SQLite (read-only), so the Investments
 * page and every AI provider can use it. Live market tools are reached through the tool hub.
 */
const SOURCE = 'indmoney'
/** Pseudo-tool row holding the server's tool list, so we can see what's on offer. */
const TOOLS_ROW = '__tools'

/** Portfolio tools that need no arguments. */
const PLAIN_TOOLS = ['networth_snapshot', 'mf_sips', 'indian_stocks_sips', 'us_stocks_sips']

/** networth_snapshot asset types → the asset_type that networth_holdings accepts. */
const HOLDING_TYPES: Record<string, string> = {
  STOCK: 'IND_STOCK',
  IND_STOCK: 'IND_STOCK',
  MF: 'MF',
  US_STOCK: 'US_STOCK',
  BOND: 'BOND',
  EPF: 'EPF',
  NPS: 'NPS',
  SA: 'SA',
  FD: 'FD',
  CRYPTO: 'CRYPTO',
  INSURANCE: 'INSURANCE',
  VEHICLE: 'VEHICLE',
  RE: 'RE',
  RD: 'RD',
  AIF: 'AIF',
  PMS: 'PMS',
  PPF: 'PPF'
}

function saveRow(db: Db, tool: string, content: string, syncedAt: string): void {
  db.insert(s.indmoneySnapshots)
    .values({ tool, content, syncedAt })
    .onConflictDoUpdate({ target: s.indmoneySnapshots.tool, set: { content, syncedAt } })
    .run()
}

async function pullTool(
  db: Db,
  row: string,
  name: string,
  args: Record<string, unknown>,
  syncedAt: string
): Promise<string | null> {
  try {
    const { text, isError } = await callSourceTool(db, SOURCE, name, args)
    saveRow(db, row, isError ? `Error: ${text}` : text, syncedAt)
    return isError ? null : text
  } catch (e) {
    saveRow(db, row, `Error: ${e instanceof Error ? e.message : String(e)}`, syncedAt)
    return null
  }
}

/** Asset types the user holds, as networth_holdings expects them. */
function holdingTypes(snapshot: string): string[] {
  try {
    const parsed = JSON.parse(snapshot) as { investments?: { asset_type?: string }[] }
    return [
      ...new Set(
        (parsed.investments ?? [])
          .map((i) => HOLDING_TYPES[i.asset_type ?? ''])
          .filter((t): t is string => !!t)
      )
    ]
  } catch {
    return []
  }
}

async function pull(db: Db): Promise<void> {
  const syncedAt = new Date().toISOString()
  const { tools } = await sourceSession(db, SOURCE, { fresh: true })
  // Sector lookups are slow and rarely change: keep the previous ones across syncs.
  const previousSectors = parseObject(
    listIndmoneySnapshots(db).find((r) => r.tool === SECTORS_ROW)?.content
  )
  db.delete(s.indmoneySnapshots).run()
  saveRow(
    db,
    TOOLS_ROW,
    JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description }))),
    syncedAt
  )

  const available = new Set(tools.map((t) => t.name))
  let snapshot: string | null = null
  for (const name of PLAIN_TOOLS) {
    if (!available.has(name)) continue
    const text = await pullTool(db, name, name, {}, syncedAt)
    if (name === 'networth_snapshot') snapshot = text
  }

  // Holdings for every asset type the user actually has.
  if (snapshot && available.has('networth_holdings')) {
    const types = holdingTypes(snapshot)
    await Promise.all(
      types.map((t) =>
        pullTool(db, `networth_holdings:${t}`, 'networth_holdings', { asset_type: t }, syncedAt)
      )
    )
  }
  await enrich(db, syncedAt, previousSectors, available)
}

const SECTORS_ROW = 'stock_sectors'
const FUNDS_ROW = 'mf_details'

function parseObject(text: string | undefined): Record<string, unknown> {
  if (!text) return {}
  try {
    const v = JSON.parse(text) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function holdingsOf(db: Db, type: string): Record<string, unknown>[] {
  const row = listIndmoneySnapshots(db).find((r) => r.tool === `networth_holdings:${type}`)
  const list = parseObject(row?.content)['holdings']
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!)
    })
  )
}

/**
 * Facts the CFO review needs that INDmoney's portfolio tools don't carry: each stock's sector
 * (from Tapetide, when connected) and each fund's category, plan and expense ratio.
 */
async function enrich(
  db: Db,
  syncedAt: string,
  previousSectors: Record<string, unknown>,
  indmoneyTools: Set<string>
): Promise<void> {
  const sectors: Record<string, unknown> = { ...previousSectors }
  const tapetide = getSourceRow(db, 'tapetide')
  if (tapetide.enabled && isConnected(db, tapetide)) {
    const missing = holdingsOf(db, 'IND_STOCK').filter(
      (h) => typeof h['investment_code'] === 'string' && !sectors[h['investment_code'] as string]
    )
    await pool(missing, 4, async (h) => {
      try {
        const { text, isError } = await callSourceTool(db, 'tapetide', 'search_stocks', {
          query: String(h['investment'] ?? ''),
          limit: 1
        })
        const hit = (parseObject(isError ? '' : text)['data'] as Record<string, unknown>[])?.[0]
        if (hit)
          sectors[h['investment_code'] as string] = {
            symbol: hit['symbol'],
            sector: hit['sector'],
            industry: hit['industry'],
            macroSector: hit['macro_sector']
          }
      } catch {
        /* leave unclassified */
      }
    })
  }
  if (Object.keys(sectors).length > 0) saveRow(db, SECTORS_ROW, JSON.stringify(sectors), syncedAt)

  if (indmoneyTools.has('get_mf_funds_details')) {
    const ids = holdingsOf(db, 'MF')
      .map((h) => h['investment_code'])
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10))
    const results: unknown[] = []
    for (const chunk of chunks) {
      try {
        const { text, isError } = await callSourceTool(db, SOURCE, 'get_mf_funds_details', {
          fund_ids: chunk.join(',')
        })
        if (!isError) results.push(JSON.parse(text))
      } catch {
        /* skip this batch */
      }
    }
    if (results.length > 0) saveRow(db, FUNDS_ROW, JSON.stringify(results), syncedAt)
  }
}

export function getIndmoneyStatus(db: Db): IndmoneyStatus {
  const rows = listIndmoneySnapshots(db)
  return {
    connected: isConnected(db, getSourceRow(db, SOURCE)),
    lastSyncedAt: rows.reduce<string | null>(
      (latest, r) => (!latest || r.syncedAt > latest ? r.syncedAt : latest),
      null
    )
  }
}

export function listIndmoneySnapshots(db: Db): IndmoneySnapshot[] {
  return db.select().from(s.indmoneySnapshots).all()
}

/** Opens INDmoney sign-in in the browser, then pulls the first snapshot. */
export async function connectIndmoney(db: Db): Promise<IndmoneyStatus> {
  await signInSource(db, SOURCE)
  await pull(db)
  return getIndmoneyStatus(db)
}

/** Refreshes the snapshot with saved tokens (refreshed automatically when they expire). */
export async function syncIndmoney(db: Db): Promise<IndmoneyStatus> {
  await pull(db)
  return getIndmoneyStatus(db)
}

/** Forgets the INDmoney sign-in and all pulled portfolio data. */
export async function disconnectIndmoney(db: Db): Promise<IndmoneyStatus> {
  await signOutSource(db, SOURCE)
  db.delete(s.indmoneySnapshots).run()
  return getIndmoneyStatus(db)
}

/** Portfolio digest for the AI CFO's context, capped so local models keep room to think. */
export function indmoneyDigest(db: Db, maxChars: number): string | null {
  const rows = listIndmoneySnapshots(db).filter(
    (r) =>
      r.tool !== TOOLS_ROW &&
      r.tool !== SECTORS_ROW &&
      r.tool !== FUNDS_ROW &&
      !r.content.startsWith('Error:')
  )
  if (rows.length === 0) return null
  // Net worth first: it is the summary everything else details.
  rows.sort((a, b) =>
    a.tool === 'networth_snapshot' ? -1 : b.tool === 'networth_snapshot' ? 1 : 0
  )
  const perTool = Math.floor(maxChars / rows.length)
  const synced = rows[0]!.syncedAt.slice(0, 10)
  return [
    `Synced from INDmoney on ${synced} (read-only). Prefer these live holdings over investments inferred from bank statements. Amounts in INR unless marked USD.`,
    ...rows.map((r) => `### ${r.tool}\n${r.content.slice(0, perTool)}`)
  ].join('\n\n')
}

/** Net worth from the latest INDmoney sync, in minor units (null when not connected). */
export function indmoneyNetWorthMinor(db: Db): number | null {
  const row = listIndmoneySnapshots(db).find((r) => r.tool === 'networth_snapshot')
  if (!row || row.content.startsWith('Error:')) return null
  try {
    let value = JSON.parse(row.content) as Record<string, unknown>
    if (typeof value['result'] === 'string') value = JSON.parse(value['result']) as typeof value
    const rupees = Number(value['total_networth'])
    return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : null
  } catch {
    return null
  }
}
