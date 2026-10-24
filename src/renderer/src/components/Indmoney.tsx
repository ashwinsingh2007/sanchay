import { useState } from 'react'
import { Link2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import type { IndmoneySnapshot, IndmoneyStatus } from '@shared/types'
import { Badge, Button, Card, CardHeader, ErrorState, Spinner } from './ui'
import { useMutation, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'
import { IndmoneyPortfolio } from './IndmoneyPortfolio'
import { CfoReviewCard } from './CfoReviewCard'

const TOOLS_ROW = '__tools'
const TOOL_LABELS: Record<string, string> = {
  networth_snapshot: 'Net worth',
  networth_allocation_breakdown: 'Allocation',
  networth_holdings: 'Holdings',
  mf_sips: 'Mutual fund SIPs',
  indian_stocks_sips: 'Stock SIPs',
  user_watchlist: 'Watchlist'
}
const ORDER = Object.keys(TOOL_LABELS)
const order = (tool: string): number => {
  const i = ORDER.indexOf(tool.split(':')[0]!)
  return i < 0 ? ORDER.length : i
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

function parse(content: string): Json | undefined {
  try {
    return JSON.parse(content) as Json
  } catch {
    return undefined
  }
}

const isScalar = (v: Json): v is string | number | boolean | null =>
  v === null || typeof v !== 'object'

const label = (key: string): string => key.replace(/[_-]+/g, ' ')

function Scalar({ value }: { value: string | number | boolean | null }): React.JSX.Element {
  if (value === null) return <span className="text-ink-3">—</span>
  if (typeof value === 'number')
    return (
      <span className="num">{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
    )
  return <span>{String(value)}</span>
}

/**
 * Generic viewer for whatever INDmoney returns: arrays of records become tables, objects become
 * label/value grids. Kept deliberately shape-agnostic until we know the real payloads.
 */
function JsonView({ value, depth = 0 }: { value: Json; depth?: number }): React.JSX.Element {
  if (isScalar(value)) return <Scalar value={value} />
  if (depth > 3)
    return (
      <pre className="text-[11.5px] whitespace-pre-wrap text-ink-2">{JSON.stringify(value)}</pre>
    )

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-3">None</span>
    const records = value.filter(
      (v): v is { [key: string]: Json } => !isScalar(v) && !Array.isArray(v)
    )
    if (records.length !== value.length)
      return (
        <ul className="list-disc space-y-1 pl-5">
          {value.map((v, i) => (
            <li key={i}>
              <JsonView value={v} depth={depth + 1} />
            </li>
          ))}
        </ul>
      )
    const columns = [
      ...new Set(records.flatMap((r) => Object.keys(r).filter((k) => isScalar(r[k]!))))
    ].slice(0, 8)
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-ink-3">
              {columns.map((c) => (
                <th key={c} className="py-1.5 pr-4 font-medium capitalize">
                  {label(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {records.slice(0, 100).map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className="py-1.5 pr-4 text-ink-2">
                    <Scalar value={(r[c] ?? null) as string | number | boolean | null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {records.length > 100 && (
          <p className="pt-2 text-[12px] text-ink-3">+ {records.length - 100} more</p>
        )}
      </div>
    )
  }

  const entries = Object.entries(value)
  const scalars = entries.filter(([, v]) => isScalar(v))
  const nested = entries.filter(([, v]) => !isScalar(v))
  return (
    <div className="space-y-4">
      {scalars.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
          {scalars.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-[11.5px] capitalize text-ink-3">{label(k)}</dt>
              <dd className="truncate text-[13.5px] text-ink">
                <Scalar value={v as string | number | boolean | null} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {nested.map(([k, v]) => (
        <div key={k}>
          <p className="mb-1.5 text-[12px] font-medium capitalize text-ink-2">{label(k)}</p>
          <JsonView value={v} depth={depth + 1} />
        </div>
      ))}
    </div>
  )
}

function SnapshotCard({ row }: { row: IndmoneySnapshot }): React.JSX.Element {
  const json = parse(row.content)
  const failed = row.content.startsWith('Error:')
  return (
    <Card>
      <CardHeader
        title={
          TOOL_LABELS[row.tool.split(':')[0]!]
            ? `${TOOL_LABELS[row.tool.split(':')[0]!]}${row.tool.includes(':') ? ` · ${row.tool.split(':')[1]}` : ''}`
            : label(row.tool)
        }
        description={<code className="text-[11.5px] text-ink-3">{row.tool}</code>}
        action={failed ? <Badge tone="negative">Failed</Badge> : undefined}
      />
      <div className="p-5 pt-3 text-[13px]">
        {failed ? (
          <p className="text-negative">{row.content}</p>
        ) : json !== undefined ? (
          <JsonView value={json} />
        ) : (
          <pre className="max-h-[420px] overflow-auto text-[12px] whitespace-pre-wrap text-ink-2">
            {row.content}
          </pre>
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] text-ink-3">Raw response</summary>
          <pre className="mt-2 max-h-[320px] overflow-auto rounded-lg bg-sunken p-3 text-[11.5px] whitespace-pre-wrap text-ink-2">
            {json !== undefined ? JSON.stringify(json, null, 2) : row.content}
          </pre>
        </details>
      </div>
    </Card>
  )
}

function ToolList({ row }: { row: IndmoneySnapshot }): React.JSX.Element {
  const tools = (parse(row.content) ?? []) as { name: string; description?: string }[]
  return (
    <Card>
      <details className="p-5">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">
          What INDmoney shares ({tools.length} read-only tools)
        </summary>
        <ul className="mt-3 space-y-2 text-[12.5px]">
          {tools.map((t) => (
            <li key={t.name}>
              <code className="text-ink">{t.name}</code>
              {t.description && <p className="text-ink-3">{t.description.split('\n')[0]}</p>}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

function ConnectCard({ onConnected }: { onConnected: () => void }): React.JSX.Element {
  const mutate = useMutation()
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <CardHeader
        title="Connect INDmoney"
        description="See your live net worth, holdings and SIPs across stocks, mutual funds, US stocks, gold and more."
      />
      <div className="space-y-4 p-5 pt-4">
        <ul className="space-y-2 text-[13px] text-ink-2">
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-positive" /> Read-only — it cannot trade, transfer
            or redeem anything.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-positive" /> You sign in on INDmoney's own page in
            your browser; the app never sees your OTP or MPIN.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-positive" /> The sign-in is kept in your Keychain
            and the portfolio is saved only on this Mac.
          </li>
        </ul>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            loading={busy}
            icon={<Link2 className="size-4" />}
            onClick={() => {
              setBusy(true)
              void mutate(() => api.connectIndmoney(), 'INDmoney connected')
                .then((s) => s?.connected && onConnected())
                .finally(() => setBusy(false))
            }}
          >
            {busy ? 'Finish sign-in in your browser…' : 'Connect INDmoney'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Live portfolio pulled from INDmoney's MCP server. */
export function IndmoneyPanel({
  status,
  onChange
}: {
  status: IndmoneyStatus
  onChange: () => void
}): React.JSX.Element {
  const mutate = useMutation()
  const [syncing, setSyncing] = useState(false)
  const snapshots = useQuery(() => api.listIndmoneySnapshots(), [status.connected])

  if (snapshots.error) return <ErrorState message={snapshots.error} onRetry={snapshots.reload} />
  if (!snapshots.data) return <Spinner />
  // Keep showing the last sync when the sign-in has lapsed; just ask to reconnect.
  const hasData = snapshots.data.some((r) => r.tool === 'networth_snapshot')
  if (!status.connected && !hasData) return <ConnectCard onConnected={onChange} />

  const rows = snapshots.data
    .filter((r) => r.tool !== TOOLS_ROW)
    .sort((a, b) => order(a.tool) - order(b.tool))
  const tools = snapshots.data.find((r) => r.tool === TOOLS_ROW)
  const fromCas = snapshots.data.some(
    (r) => r.tool === 'networth_snapshot' && r.content.includes('"source":"cas"')
  )
  if (fromCas)
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-2">
            From your CAS statement
            {snapshots.data[0]?.syncedAt
              ? ` dated ${snapshots.data[0].syncedAt.slice(0, 10)}`
              : ''}{' '}
            and bank statements.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => useUi.getState().openImport()}>
              Upload a newer CAS
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void api.connectIndmoney().then(onChange)}
            >
              Connect INDmoney instead
            </Button>
          </div>
        </div>
        <CfoReviewCard />
        <IndmoneyPortfolio rows={snapshots.data} />
      </div>
    )
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">
          {status.lastSyncedAt
            ? `Synced ${new Date(status.lastSyncedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
            : 'Not synced yet'}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            loading={syncing}
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => {
              setSyncing(true)
              void mutate(
                () => (status.connected ? api.syncIndmoney() : api.connectIndmoney()),
                'Portfolio updated'
              ).finally(() => setSyncing(false))
            }}
          >
            {status.connected ? 'Sync now' : 'Sign in again to refresh'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Unplug className="size-3.5" />}
            onClick={() => void mutate(() => api.disconnectIndmoney(), 'INDmoney disconnected')}
          >
            Disconnect
          </Button>
        </div>
      </div>
      <CfoReviewCard />
      <IndmoneyPortfolio rows={snapshots.data} />
      <details className="pt-2">
        <summary className="cursor-pointer text-[12.5px] text-ink-3">
          Raw INDmoney data ({rows.length} responses)
        </summary>
        <div className="mt-3 space-y-4">
          {rows.map((row) => (
            <SnapshotCard key={row.tool} row={row} />
          ))}
          {tools && <ToolList row={tools} />}
        </div>
      </details>
    </div>
  )
}
