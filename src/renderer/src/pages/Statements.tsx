import { useMemo, useState } from 'react'
import { ArrowLeft, FileText, Trash2, Upload } from 'lucide-react'
import { addMonths, formatDate, monthLabel, toMonthKey } from '@shared/dates'
import type { CasImportInfo, ImportSourceWithAccount } from '@shared/types'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  PageHeader,
  Spinner
} from '../components/ui'
import { useMutation, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { cn, api } from '../lib/utils'

/**
 * Every bank and card statement you've imported, per account: which months each covers, where
 * statements overlap (shared rows are counted once) and where there are gaps.
 */
function months(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to && out.length < 60; m = addMonths(m, 1)) out.push(m)
  return out
}

function Coverage({ list }: { list: ImportSourceWithAccount[] }): React.JSX.Element | null {
  const ranges = list
    .filter((s) => s.dateRangeStart && s.dateRangeEnd)
    .map((s) => [toMonthKey(s.dateRangeStart!), toMonthKey(s.dateRangeEnd!)] as const)
  if (ranges.length === 0) return null
  const all = months(
    ranges.reduce((a, r) => (r[0] < a ? r[0] : a), ranges[0]![0]),
    ranges.reduce((a, r) => (r[1] > a ? r[1] : a), ranges[0]![1])
  )
  const count = (m: string): number => ranges.filter(([a, b]) => m >= a && m <= b).length
  const gaps = all.filter((m) => count(m) === 0)
  const overlaps = all.filter((m) => count(m) > 1)
  return (
    <div className="px-5 pb-1 pt-3">
      <div className="flex gap-1" role="list" aria-label="Months covered">
        {all.map((m) => {
          const c = count(m)
          return (
            <div
              key={m}
              role="listitem"
              title={`${monthLabel(m)}: ${c === 0 ? 'no statement' : c === 1 ? '1 statement' : `${c} statements (overlap — counted once)`}`}
              className={cn(
                'h-7 min-w-0 flex-1 rounded-md',
                c === 0
                  ? 'bg-hot-soft ring-1 ring-hot/30'
                  : c === 1
                    ? 'bg-cool-soft'
                    : 'bg-cold-soft'
              )}
            />
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{monthLabel(all[0]!, 'short')}</span>
        <span>{monthLabel(all[all.length - 1]!, 'short')}</span>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-2">
        {gaps.length > 0 ? (
          <span className="text-hot">
            Missing {gaps.map((m) => monthLabel(m, 'short')).join(', ')} — upload a statement for{' '}
            {gaps.length === 1 ? 'it' : 'them'}.
          </span>
        ) : (
          'No gaps.'
        )}{' '}
        {overlaps.length > 0 &&
          `${overlaps.length} month${overlaps.length === 1 ? '' : 's'} covered by more than one statement — shared transactions are counted once.`}
      </p>
    </div>
  )
}

const CAS_KIND: Record<CasImportInfo['kind'], string> = {
  nsdl: 'NSDL demat',
  cdsl: 'CDSL demat',
  cams: 'CAMS mutual funds',
  kfintech: 'KFintech mutual funds'
}

/** Holdings statements: every stock and fund across brokers, without any sign-in. */
function CasList(): React.JSX.Element {
  const list = useQuery(() => api.listCasImports())
  const mutate = useMutation()
  return (
    <Card>
      <CardHeader
        title="Holdings statements (CAS)"
        description="Your NSDL/CDSL demat CAS (emailed monthly) and CAMS/KFintech fund CAS list every stock and fund across all brokers. Upload one here; the password is usually your PAN. The latest of each kind is used."
      />
      <ul className="mt-2 divide-y divide-line border-t border-line">
        {(list.data ?? []).length === 0 && (
          <li className="px-5 py-4 text-[13px] text-ink-3">None yet.</li>
        )}
        {(list.data ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-5 py-3">
            <FileText className="size-4 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{c.filename}</p>
              <p className="text-[12px] text-ink-3">
                {CAS_KIND[c.kind]}
                {c.statementDate ? ` · as of ${formatDate(c.statementDate)}` : ''} ·{' '}
                {c.holdingCount} holdings
              </p>
            </div>
            <button
              onClick={() => void mutate(() => api.deleteCasImport(c.id), `Removed ${c.filename}`)}
              className="rounded-md p-1.5 text-ink-3 hover:bg-hot-soft hover:text-hot"
              aria-label={`Remove ${c.filename}`}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function StatementsPage(): React.JSX.Element {
  const go = useUi((s) => s.go)
  const openImport = useUi((s) => s.openImport)
  const mutate = useMutation()
  const sources = useQuery(() => api.listImportSources())
  const [confirm, setConfirm] = useState<ImportSourceWithAccount | null>(null)

  const byAccount = useMemo(() => {
    const map = new Map<string, ImportSourceWithAccount[]>()
    for (const s of sources.data ?? [])
      map.set(s.accountName, [...(map.get(s.accountName) ?? []), s])
    for (const list of map.values())
      list.sort((a, b) => (b.dateRangeEnd ?? '').localeCompare(a.dateRangeEnd ?? ''))
    return [...map.entries()]
  }, [sources.data])

  return (
    <div className="space-y-5">
      <button
        onClick={() => go('sources')}
        className="flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Data sources
      </button>
      <PageHeader
        eyebrow="Data sources"
        title="Bank & card statements"
        description="Upload as many as you like, in any order. Overlapping months are merged — each transaction is counted once — and deleting an old statement keeps anything a newer one also contains."
        actions={
          <Button
            variant="primary"
            icon={<Upload className="size-4" />}
            onClick={() => openImport()}
          >
            Upload statement
          </Button>
        }
      />
      {!sources.data ? (
        <Spinner />
      ) : byAccount.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No statements yet"
            description="Upload a PDF or CSV from your bank or card. It's read on this Mac."
          />
        </Card>
      ) : (
        byAccount.map(([account, list]) => (
          <Card key={account}>
            <CardHeader
              title={account}
              description={`${list.length} statement${list.length === 1 ? '' : 's'}`}
            />
            <Coverage list={list} />
            <ul className="mt-2 divide-y divide-line border-t border-line">
              {list.map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                  <FileText className="size-4 shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium" title={s.filename}>
                      {s.filename}
                      {s.isSample && (
                        <Badge tone="outline" className="ml-2">
                          sample
                        </Badge>
                      )}
                    </p>
                    <p className="text-[12px] text-ink-3">
                      {s.dateRangeStart && s.dateRangeEnd
                        ? `${formatDate(s.dateRangeStart)} – ${formatDate(s.dateRangeEnd)}`
                        : 'No dates'}{' '}
                      · uploaded {formatDate(s.importedAt.slice(0, 10), 'short')}
                    </p>
                  </div>
                  <div className="text-right text-[12px] text-ink-3">
                    <p className="num text-[13px] text-ink">
                      {(s.containedCount || s.transactionCount).toLocaleString('en-IN')}{' '}
                      transactions
                    </p>
                    <p>
                      {s.importedCount} new
                      {s.duplicateCount > 0 && ` · ${s.duplicateCount} already had`}
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirm(s)}
                    className="rounded-md p-1.5 text-ink-3 hover:bg-hot-soft hover:text-hot"
                    aria-label={`Delete ${s.filename}`}
                    title="Delete statement"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      <CasList />

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this statement?"
        description={confirm?.filename}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const s = confirm!
                setConfirm(null)
                void mutate(() => api.deleteImportSource(s.id), `Deleted ${s.filename}`)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        {confirm && (
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            Removes <strong className="text-ink">{confirm.onlyHereCount}</strong> transaction
            {confirm.onlyHereCount === 1 ? '' : 's'} that only this statement contains.
            {confirm.containedCount > confirm.onlyHereCount &&
              ` ${confirm.containedCount - confirm.onlyHereCount} shared with another statement stay.`}{' '}
            Your categories and rules are kept.
          </p>
        )}
      </Dialog>
    </div>
  )
}
