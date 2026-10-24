import { useMemo, useState } from 'react'
import { CreditCard, Repeat, TrendingDown, TrendingUp } from 'lucide-react'
import { formatMoney } from '@shared/money'
import type { IndmoneySnapshot } from '@shared/types'
import { Badge, Card, CardHeader, Segmented } from './ui'
import { useCountUp } from '../lib/hooks'
import { cn } from '../lib/utils'

/**
 * The user's INDmoney portfolio drawn from the synced snapshot: net worth, allocation, holdings,
 * SIPs and card dues. Field names follow INDmoney's MCP responses; anything unrecognised falls
 * back to a plain table so new fields still show up.
 */
type Row = Record<string, unknown>

interface Investment {
  asset_type: string
  invested_value: number
  current_value: number
  return: number
  return_percentage: number
  progress_value_percentage: number
}

interface Snapshot {
  total_invested?: number
  total_current_value?: number
  total_networth?: number
  investments?: Investment[]
  assets?: (Omit<Investment, 'asset_type'> & { assetclass_l2: string })[]
  market_cap?: { market_cap: string; current_value: number; progress_value_percentage: number }[]
  liabilities?: {
    total?: number
    total_loan_balance?: number
    total_credit_card_due?: number
    loans?: Row[]
    credit_cards?: { name: string; total_due: number; due_date?: string }[]
  }
  data_notes?: Record<string, string>
}

export const ASSET_LABELS: Record<string, string> = {
  STOCK: 'Indian stocks',
  IND_STOCK: 'Indian stocks',
  SA: 'Savings accounts',
  MF: 'Mutual funds',
  US_STOCK: 'US stocks',
  US_STOCK_WALLET: 'US wallet',
  NPS: 'NPS',
  EPF: 'EPF',
  PPF: 'PPF',
  FD: 'Fixed deposits',
  RD: 'Recurring deposits',
  BOND: 'Bonds',
  CRYPTO: 'Crypto',
  RE: 'Real estate',
  INSURANCE: 'Insurance',
  VEHICLE: 'Vehicles',
  AIF: 'AIF',
  PMS: 'PMS',
  GOLD: 'Gold'
}

/** Restrained greyscale ramp: allocation reads by shade, not by colour. */
const SHADES = [1, 0.72, 0.52, 0.38, 0.27, 0.19, 0.13, 0.09]

const rupees = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const inr = (
  v: unknown,
  opts?: { compact?: boolean; signed?: boolean; precise?: boolean }
): string => formatMoney(Math.round(rupees(v) * 100), 'INR', opts)

function parse<T>(rows: IndmoneySnapshot[], tool: string): T | null {
  const row = rows.find((r) => r.tool === tool)
  if (!row || row.content.startsWith('Error:')) return null
  try {
    const value = JSON.parse(row.content) as unknown
    // Older syncs stored INDmoney's `{ "result": "<json>" }` wrapper as-is.
    if (value && typeof value === 'object' && typeof (value as Row)['result'] === 'string')
      return JSON.parse((value as Row)['result'] as string) as T
    return value as T
  } catch {
    return null
  }
}

/** Finds the list of rows inside a holdings response, whatever it is called. */
function rowsOf(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter((v): v is Row => !!v && typeof v === 'object')
  if (value && typeof value === 'object') {
    for (const key of ['holdings', 'rows', 'data', 'items']) {
      const inner = (value as Row)[key]
      if (Array.isArray(inner)) return rowsOf(inner)
    }
    for (const inner of Object.values(value as Row)) if (Array.isArray(inner)) return rowsOf(inner)
  }
  return []
}

const pick = (r: Row, keys: string[]): unknown => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k]
  return undefined
}
const NAME = [
  'investment',
  'name',
  'instrument_name',
  'scheme_name',
  'fund_name',
  'stock_name',
  'account_name',
  'bank_name',
  'title',
  'symbol'
]
const VALUE = ['market_value', 'current_value', 'currentValueVal', 'value', 'balance', 'current']
const INVESTED = ['invested_amount', 'invested_value', 'investedAmountVal', 'invested', 'buy_value']
const PNL = ['total_pnl', 'pnl', 'return', 'currentGainVal', 'gain', 'unrealised_pnl']
const PNL_PCT = [
  'pnl_per',
  'pnl_percent',
  'pnl_percentage',
  'return_percentage',
  'gainPercentageVal',
  'gain_percent'
]
const DAY = ['one_day_change', 'oneDayChangeVal', 'day_change']
const DAY_PCT = ['one_day_change_percentage', 'oneDayChangePercVal']
const UNITS = ['total_units', 'units', 'quantity', 'qty', 'shares']
const PRICE = ['unit_price', 'ltp', 'nav', 'price']
const WEIGHT = ['holding_percent', 'weight', 'allocation_percent']
const BROKER = ['broker', 'broker_name', 'platform']
const CAP = ['market_cap']

function Gain({ value, pct }: { value: unknown; pct?: unknown }): React.JSX.Element | null {
  if (value === undefined && pct === undefined) return null
  const v = rupees(value ?? pct)
  return (
    <span className={cn('num', v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : 'text-ink-3')}>
      {value !== undefined && inr(value, { signed: true })}
      {pct !== undefined && (
        <span className="ml-1 text-[11.5px]">
          ({rupees(pct) > 0 ? '+' : ''}
          {rupees(pct).toFixed(1)}%)
        </span>
      )}
    </span>
  )
}

/** Net worth header: the one number, then invested / gain / dues. */
export function NetWorthCard({ rows }: { rows: IndmoneySnapshot[] }): React.JSX.Element | null {
  const snap = parse<Snapshot>(rows, 'networth_snapshot')
  const netWorth = useCountUp(rupees(snap?.total_networth))
  if (!snap) return null
  // Gain only where the buying price is known: INDmoney reports invested = current for cash and
  // for stocks held with other brokers, which would drag the percentage towards zero.
  const known = (snap.investments ?? []).filter(
    (i) => i.asset_type !== 'SA' && Math.abs(i.current_value - i.invested_value) >= 1
  )
  const knownInvested = known.reduce((t, i) => t + i.invested_value, 0)
  const gain = known.reduce((t, i) => t + i.current_value - i.invested_value, 0)
  const gainPct = knownInvested ? (gain / knownInvested) * 100 : 0
  const partial =
    known.length < (snap.investments ?? []).filter((i) => i.asset_type !== 'SA').length
  const investments = [...(snap.investments ?? [])].sort(
    (a, b) => b.current_value - a.current_value
  )
  return (
    <Card className="gloss overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-6 px-6 pt-6">
        <div>
          <p className="eyebrow text-ink-3">Net worth · INDmoney</p>
          <p className="num hero-number mt-2 text-[44px] font-medium leading-none tracking-[-0.025em]">
            {inr(Math.round(netWorth))}
          </p>
        </div>
        <div className="flex gap-8 text-right">
          <div>
            <p className="text-[11.5px] text-ink-3">Invested</p>
            <p className="num text-[17px] font-semibold">{inr(snap.total_invested)}</p>
          </div>
          <div>
            <p
              className="text-[11.5px] text-ink-3"
              title={
                partial
                  ? 'Only holdings with a known buying price (INDmoney lacks it for stocks bought elsewhere).'
                  : undefined
              }
            >
              {partial ? 'Gain · where cost known' : 'Gain'}
            </p>
            <p
              className={cn(
                'num flex items-center justify-end gap-1 text-[17px] font-semibold',
                gain >= 0 ? 'text-positive' : 'text-negative'
              )}
            >
              {gain >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {inr(gain, { signed: true })}
              <span className="text-[12px]">({gainPct.toFixed(1)}%)</span>
            </p>
          </div>
          {!!snap.liabilities?.total && (
            <div>
              <p className="text-[11.5px] text-ink-3">You owe</p>
              <p className="num text-[17px] font-semibold text-negative">
                {inr(snap.liabilities.total)}
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Allocation bar */}
      <div className="px-6 pb-6 pt-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-ink/[0.06]">
          {investments.map((inv, i) => (
            <div
              key={inv.asset_type}
              title={`${ASSET_LABELS[inv.asset_type] ?? inv.asset_type}: ${inv.progress_value_percentage.toFixed(1)}%`}
              style={{
                width: `${inv.progress_value_percentage}%`,
                background: `rgb(from var(--color-cold) r g b / ${SHADES[i] ?? 0.08})`
              }}
            />
          ))}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 md:grid-cols-4">
          {investments.map((inv, i) => (
            <li key={inv.asset_type} className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[12px] text-ink-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: `rgb(from var(--color-cold) r g b / ${SHADES[i] ?? 0.08})` }}
                />
                {ASSET_LABELS[inv.asset_type] ?? inv.asset_type}
                <span className="text-ink-3">{inv.progress_value_percentage.toFixed(1)}%</span>
              </p>
              <p className="num text-[14px] font-semibold">{inr(inv.current_value)}</p>
              {inv.return !== 0 && (
                <p className="text-[11.5px]">
                  <Gain value={inv.return} pct={inv.return_percentage} />
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function DuesCard({ snap }: { snap: Snapshot }): React.JSX.Element | null {
  const cards = snap.liabilities?.credit_cards ?? []
  const loans = snap.liabilities?.loans ?? []
  if (cards.length === 0 && loans.length === 0) return null
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CreditCard className="size-4" /> Dues and loans
          </span>
        }
        description="From INDmoney — pay credit cards in full before the due date."
      />
      <ul className="divide-y divide-line px-5 pb-3">
        {cards.map((c) => (
          <li key={c.name} className="flex items-center gap-3 py-2.5 text-[13px]">
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {c.due_date && <Badge tone="attention">Due {c.due_date}</Badge>}
            <span className="num font-semibold">{inr(c.total_due)}</span>
          </li>
        ))}
        {loans.map((l, i) => (
          <li key={i} className="flex items-center gap-3 py-2.5 text-[13px]">
            <span className="min-w-0 flex-1 truncate">{String(pick(l, NAME) ?? 'Loan')}</span>
            <span className="num font-semibold">
              {inr(pick(l, ['outstanding', 'balance', 'total_due', 'amount']))}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function SipsCard({ rows }: { rows: IndmoneySnapshot[] }): React.JSX.Element | null {
  const mf = rowsOf(parse<unknown>(rows, 'mf_sips'))
  const stock = rowsOf(parse<unknown>(rows, 'indian_stocks_sips'))
  const us = rowsOf(parse<unknown>(rows, 'us_stocks_sips'))
  const list = [
    ...mf.flatMap((f) =>
      rowsOf(f['active_sips']).map((s) => ({
        name: String(f['name'] ?? 'Fund'),
        amount: s['amount'],
        frequency: s['sip_frequency'],
        since: s['sip_start_date'],
        value: f['currentValueVal'],
        pct: f['gainPercentageVal']
      }))
    ),
    ...[...stock, ...us].map((s) => ({
      name: String(pick(s, NAME) ?? 'SIP'),
      amount: pick(s, ['amount', 'sip_amount']),
      frequency: pick(s, ['frequency', 'sip_frequency']),
      since: pick(s, ['start_date', 'sip_start_date']),
      value: pick(s, VALUE),
      pct: pick(s, PNL_PCT)
    }))
  ]
  if (list.length === 0) return null
  const monthly = list
    .filter((s) => String(s.frequency ?? 'MONTHLY').toUpperCase() === 'MONTHLY')
    .reduce((t, s) => t + rupees(s.amount), 0)
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Repeat className="size-4" /> Active SIPs
          </span>
        }
        description={`${inr(monthly)} a month across ${list.length} SIP${list.length === 1 ? '' : 's'}`}
      />
      <ul className="divide-y divide-line px-5 pb-3">
        {list.map((s, i) => (
          <li key={i} className="flex items-center gap-3 py-2.5 text-[13px]">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{s.name}</span>
              <span className="text-[11.5px] text-ink-3">
                {String(s.frequency ?? '').toLowerCase()}
                {s.since ? ` · since ${String(s.since)}` : ''}
                {s.value !== undefined ? ` · worth ${inr(s.value)}` : ''}
              </span>
            </span>
            {s.pct !== undefined && <Gain value={undefined} pct={s.pct} />}
            <span className="num font-semibold">{inr(s.amount)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Order of the holdings tabs: what people check most first. */
const HOLDING_ORDER = [
  'IND_STOCK',
  'MF',
  'US_STOCK',
  'SA',
  'FD',
  'EPF',
  'PPF',
  'NPS',
  'BOND',
  'CRYPTO'
]

type SortKey = 'name' | 'invested' | 'value' | 'pnl' | 'pnlPct' | 'day' | 'weight'

interface Holding {
  name: string
  code: string | null
  broker: string | null
  cap: string | null
  units: number | null
  price: number | null
  invested: number | null
  value: number
  pnl: number | null
  pnlPct: number | null
  day: number | null
  dayPct: number | null
  weight: number | null
}

const num = (v: unknown): number | null =>
  v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v)

function toHolding(r: Row): Holding {
  const code = pick(r, ['investment_code', 'symbol', 'isin'])
  return {
    name: String(pick(r, NAME) ?? '—'),
    code: code === undefined ? null : String(code),
    broker: (pick(r, BROKER) as string | undefined) ?? null,
    cap: (pick(r, CAP) as string | undefined) ?? null,
    units: num(pick(r, UNITS)),
    price: num(pick(r, PRICE)),
    invested: num(pick(r, INVESTED)),
    value: rupees(pick(r, VALUE)),
    pnl: num(pick(r, PNL)),
    pnlPct: num(pick(r, PNL_PCT)),
    day: num(pick(r, DAY)),
    dayPct: num(pick(r, DAY_PCT)),
    weight: num(pick(r, WEIGHT))
  }
}

function Signed({ value, pct }: { value: number | null; pct?: number | null }): React.JSX.Element {
  if (value === null && (pct === null || pct === undefined))
    return <span className="text-ink-3">—</span>
  const v = value ?? pct ?? 0
  return (
    <span className={cn('num', v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : 'text-ink-3')}>
      {value !== null && inr(value, { signed: true })}
      {pct !== null && pct !== undefined && (
        <span className="block text-[11px] opacity-80">
          {pct > 0 ? '+' : ''}
          {pct.toFixed(2)}%
        </span>
      )}
    </span>
  )
}

/** Every holding, per asset type: search, sort by any column, nothing hidden. */
function HoldingsCard({ rows }: { rows: IndmoneySnapshot[] }): React.JSX.Element | null {
  const types = useMemo(
    () =>
      rows
        .filter((r) => r.tool.startsWith('networth_holdings:'))
        .map((r) => {
          const data = parse<Row>(rows, r.tool)
          return {
            type: r.tool.split(':')[1]!,
            holdings: rowsOf(data).map(toHolding),
            summary: (data?.['asset_summary'] ?? null) as Row | null,
            failed: r.content.startsWith('Error:')
          }
        })
        .filter((t) => t.failed || t.holdings.length > 0)
        .sort((a, b) => {
          const ia = HOLDING_ORDER.indexOf(a.type)
          const ib = HOLDING_ORDER.indexOf(b.type)
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
        }),
    [rows]
  )
  const [picked, setPicked] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'value', desc: true })

  if (types.length === 0) return null
  const current = types.find((t) => t.type === picked) ?? types[0]!
  const q = query.trim().toLowerCase()
  const list = current.holdings
    .filter((h) => !q || h.name.toLowerCase().includes(q) || h.code?.toLowerCase().includes(q))
    .sort((a, b) => {
      const dir = sort.desc ? -1 : 1
      if (sort.key === 'name') return dir * a.name.localeCompare(b.name) * -1
      const av = a[sort.key] ?? -Infinity
      const bv = b[sort.key] ?? -Infinity
      return dir * (av - bv)
    })
  const hasUnits = current.holdings.some((h) => h.units !== null)
  const hasPrice = current.holdings.some((h) => h.price !== null)
  const hasPnl = current.holdings.some((h) => (h.pnl ?? 0) !== 0)
  const hasDay = current.holdings.some((h) => (h.day ?? 0) !== 0)
  const isAccount = current.type === 'SA'
  const s = current.summary

  const Th = ({
    k,
    children,
    left
  }: {
    k: SortKey
    children: React.ReactNode
    left?: boolean
  }): React.JSX.Element => (
    <th className={cn('py-2 pr-4 font-medium', !left && 'text-right')}>
      <button
        onClick={() =>
          setSort((cur) => ({ key: k, desc: cur.key === k ? !cur.desc : k !== 'name' }))
        }
        className={cn('hover:text-ink', sort.key === k && 'text-ink')}
      >
        {children}
        {sort.key === k && (sort.desc ? ' ↓' : ' ↑')}
      </button>
    </th>
  )

  return (
    <Card>
      <CardHeader
        title="Your holdings"
        description="Every stock, fund and account INDmoney sees. Click a column to sort."
        action={
          <Segmented
            label="Asset type"
            value={current.type}
            onChange={(t) => {
              setPicked(t)
              setQuery('')
            }}
            options={types.map((t) => ({
              value: t.type,
              label: (
                <>
                  {ASSET_LABELS[t.type] ?? t.type}
                  <span className="num text-[11px] text-ink-3">{t.holdings.length}</span>
                </>
              )
            }))}
          />
        }
      />
      {s && (
        <div className="mx-5 mt-4 flex flex-wrap items-end gap-x-8 gap-y-2 rounded-lg bg-sunken px-4 py-3">
          <div>
            <p className="text-[11.5px] text-ink-3">Current value</p>
            <p className="num text-[18px] font-semibold text-cold">{inr(s['total_value'])}</p>
          </div>
          {!isAccount && (
            <div>
              <p className="text-[11.5px] text-ink-3">Invested</p>
              <p className="num text-[15px] font-medium">{inr(s['invested'])}</p>
            </div>
          )}
          {!isAccount && Math.abs(rupees(s['total_value']) - rupees(s['invested'])) >= 1 && (
            <div>
              <p className="text-[11.5px] text-ink-3">Gain</p>
              <p className="text-[15px] font-medium">
                <Signed
                  value={rupees(s['total_value']) - rupees(s['invested'])}
                  pct={
                    rupees(s['invested'])
                      ? ((rupees(s['total_value']) - rupees(s['invested'])) /
                          rupees(s['invested'])) *
                        100
                      : null
                  }
                />
              </p>
            </div>
          )}
          {rupees(s['one_day_change']) !== 0 && (
            <div>
              <p className="text-[11.5px] text-ink-3">Today</p>
              <p className="text-[15px] font-medium">
                <Signed
                  value={rupees(s['one_day_change'])}
                  pct={num(s['one_day_change_percentage'])}
                />
              </p>
            </div>
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${current.holdings.length} ${ASSET_LABELS[current.type]?.toLowerCase() ?? 'holdings'}…`}
            className="ml-auto h-8 w-60 rounded-lg border border-line bg-surface px-3 text-[12.5px] outline-none placeholder:text-ink-3 focus:border-accent"
          />
        </div>
      )}
      <div className="overflow-x-auto px-5 pb-4 pt-2">
        {current.failed ? (
          <p className="py-3 text-[13px] text-negative">
            Couldn't load these holdings. Sync again.
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] text-ink-3">
                <Th k="name" left>
                  Name
                </Th>
                {hasUnits && <th className="py-2 pr-4 text-right font-medium">Qty</th>}
                {hasPrice && <th className="py-2 pr-4 text-right font-medium">Price</th>}
                {!isAccount && <Th k="invested">Invested</Th>}
                <Th k="value">{isAccount ? 'Balance' : 'Value'}</Th>
                {hasPnl && <Th k="pnl">P&amp;L</Th>}
                {hasDay && <Th k="day">Today</Th>}
                <Th k="weight">Weight</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((h, i) => (
                <tr key={`${h.code ?? h.name}-${i}`} className="hover:bg-sunken/60">
                  <td className="max-w-[320px] py-2.5 pr-4">
                    <span className="block truncate font-medium text-ink" title={h.name}>
                      {h.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-3">
                      {[h.code, h.broker, h.cap && `${h.cap} cap`].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  {hasUnits && (
                    <td className="num py-2.5 pr-4 text-right text-ink-2">
                      {h.units === null
                        ? '—'
                        : h.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                    </td>
                  )}
                  {hasPrice && (
                    <td className="num py-2.5 pr-4 text-right text-ink-2">
                      {h.price === null ? '—' : inr(h.price, { precise: h.price < 10_000 })}
                    </td>
                  )}
                  {!isAccount && (
                    <td className="num py-2.5 pr-4 text-right text-ink-2">
                      {h.invested === null ? '—' : inr(h.invested)}
                    </td>
                  )}
                  <td className="num py-2.5 pr-4 text-right font-semibold">{inr(h.value)}</td>
                  {hasPnl && (
                    <td className="py-2.5 pr-4 text-right">
                      <Signed value={h.pnl} pct={h.pnlPct} />
                    </td>
                  )}
                  {hasDay && (
                    <td className="py-2.5 pr-4 text-right">
                      <Signed value={h.day} pct={h.dayPct} />
                    </td>
                  )}
                  <td className="py-2.5 text-right">
                    <span className="num text-ink-2">
                      {h.weight === null ? '—' : `${h.weight.toFixed(1)}%`}
                    </span>
                    {h.weight !== null && (
                      <span className="mt-1 ml-auto block h-1 w-14 overflow-hidden rounded-full bg-sunken">
                        <span
                          className="block h-full rounded-full bg-cold"
                          style={{ width: `${Math.min(100, h.weight)}%` }}
                        />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-ink-3">
                    Nothing matches “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {current.type === 'IND_STOCK' && !hasPnl && (
          <p className="pt-3 text-[11.5px] text-ink-3">
            INDmoney only knows the buying price for stocks bought through INDmoney, so P&amp;L for
            stocks held with other brokers isn&apos;t shown.
          </p>
        )}
      </div>
    </Card>
  )
}

function SplitCard({ snap }: { snap: Snapshot }): React.JSX.Element | null {
  const assets = snap.assets ?? []
  const caps = snap.market_cap ?? []
  if (assets.length === 0) return null
  return (
    <Card>
      <CardHeader title="Asset classes" description="Equity, debt, cash, gold and more." />
      <ul className="space-y-2.5 px-5 pb-4 pt-3">
        {[...assets]
          .sort((a, b) => b.current_value - a.current_value)
          .map((a) => (
            <li key={a.assetclass_l2} className="text-[12.5px]">
              <div className="flex justify-between">
                <span>{a.assetclass_l2}</span>
                <span className="num text-ink-2">
                  {inr(a.current_value, { compact: true })} ·{' '}
                  {a.progress_value_percentage.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className="h-full rounded-full bg-cold"
                  style={{ width: `${a.progress_value_percentage}%` }}
                />
              </div>
            </li>
          ))}
      </ul>
      {caps.length > 0 && (
        <p className="px-5 pb-4 text-[12px] text-ink-3">
          Stocks by size:{' '}
          {caps
            .map((c) => `${c.market_cap} ${c.progress_value_percentage.toFixed(0)}%`)
            .join(' · ')}
        </p>
      )}
    </Card>
  )
}

/** The full portfolio view for the Investments page. */
export function IndmoneyPortfolio({ rows }: { rows: IndmoneySnapshot[] }): React.JSX.Element {
  const snap = parse<Snapshot>(rows, 'networth_snapshot')
  return (
    <div className="space-y-4">
      <NetWorthCard rows={rows} />
      <HoldingsCard rows={rows} />
      <div className="grid gap-4 md:grid-cols-2">
        {snap && <SplitCard snap={snap} />}
        <div className="space-y-4">
          <SipsCard rows={rows} />
          {snap && <DuesCard snap={snap} />}
        </div>
      </div>
      {snap?.data_notes && (
        <ul className="space-y-1 text-[11.5px] text-ink-3">
          {Object.values(snap.data_notes).map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Compact version for the Home page. */
export function IndmoneyHomeSummary({ rows }: { rows: IndmoneySnapshot[] }): React.JSX.Element {
  const snap = parse<Snapshot>(rows, 'networth_snapshot')
  return (
    <div className="space-y-4">
      <NetWorthCard rows={rows} />
      <div className="grid gap-4 md:grid-cols-2">
        <SipsCard rows={rows} />
        {snap && <DuesCard snap={snap} />}
      </div>
    </div>
  )
}
