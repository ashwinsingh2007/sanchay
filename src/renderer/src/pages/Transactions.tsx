import { ArrowLeftRight, CalendarDays, List, Pencil, Search, Sparkles, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatDate, monthEnd, monthLabel, monthStart } from '@shared/dates'
import { cleanMerchantName } from '@shared/domain/merchant'
import type { Direction, TransactionFilter, TransactionView } from '@shared/types'
import { Amount, CategoryDot } from '../components/finance'
import { SpendCalendar } from '../components/SpendCalendar'
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Segmented,
  Select,
  Spinner
} from '../components/ui'
import { useMoney, useMutation, useQuery } from '../lib/hooks'
import { recategorise } from '../lib/recategorise'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

const RENDER_LIMIT = 400

function CategoryOptions(): React.JSX.Element {
  const categories = useUi((s) => s.categories)
  return (
    <>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </>
  )
}

export function EditTransactionDialog({
  tx,
  onClose
}: {
  tx: TransactionView
  onClose: () => void
}): React.JSX.Element {
  const mutate = useMutation()
  const toast = useUi((s) => s.toast)
  const [merchant, setMerchant] = useState(tx.merchantNormalised)
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? 'other')
  const [notes, setNotes] = useState(tx.notes ?? '')
  const [isTransfer, setIsTransfer] = useState(tx.isTransfer)
  const [makeRule, setMakeRule] = useState(false)
  const [matchValue, setMatchValue] = useState(() => cleanMerchantName(tx.descriptionOriginal))
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    setBusy(true)
    const ok = await mutate(
      async () => {
        await api.updateTransaction({
          id: tx.id,
          merchantNormalised: merchant.trim() || tx.merchantNormalised,
          notes: notes.trim() || null,
          ...(isTransfer !== tx.isTransfer ? { isTransfer } : {}),
          ...(!isTransfer && categoryId !== tx.categoryId ? { categoryId } : {})
        })
        if (makeRule && matchValue.trim()) {
          const { updatedCount } = await api.createRule({
            matchType: 'contains',
            matchValue: matchValue.trim(),
            merchantNormalised: merchant.trim() || null,
            categoryId: isTransfer ? 'transfers' : categoryId,
            applyToExisting: true
          })
          toast(
            `Rule saved · ${updatedCount} matching transaction${updatedCount === 1 ? '' : 's'} updated`
          )
        }
        return true
      },
      makeRule ? undefined : 'Transaction updated'
    )
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit transaction"
      description={`${formatDate(tx.transactionDate)} · ${tx.accountName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="rounded-xl bg-sunken px-4 py-3">
          <p className="text-[11px] eyebrow text-ink-3">Original description</p>
          <p className="mt-0.5 break-all text-[13px]" data-selectable>
            {tx.descriptionOriginal}
          </p>
          <p className="mt-2 text-sm font-semibold">
            <Amount minor={tx.amountMinor} />
          </p>
        </div>
        <Field label="Merchant name" htmlFor="tx-m">
          <Input id="tx-m" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={isTransfer}
            onChange={(e) => setIsTransfer(e.target.checked)}
          />
          This is a transfer between my own accounts (e.g. card bill payment) — exclude from income
          and spending
        </label>
        {!isTransfer && (
          <Field label="Category" htmlFor="tx-c">
            <Select id="tx-c" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <CategoryOptions />
            </Select>
          </Field>
        )}
        <Field label="Notes" htmlFor="tx-n">
          <Input
            id="tx-n"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <div className="rounded-xl border border-line p-4">
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={makeRule}
              onChange={(e) => setMakeRule(e.target.checked)}
            />
            Always categorise this merchant this way
          </label>
          {makeRule && (
            <Field
              label="Match descriptions containing"
              hint="Applied to past and future imports. Manage rules in Settings."
              htmlFor="tx-r"
              className="mt-3"
            >
              <Input id="tx-r" value={matchValue} onChange={(e) => setMatchValue(e.target.value)} />
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  )
}

type Period = 'month' | 'all' | 'custom'

export function TransactionsPage(): React.JSX.Element {
  const { month, accounts, preset, openImport, categories } = {
    month: useUi((s) => s.month),
    accounts: useQuery(() => api.listAccounts()),
    preset: useUi((s) => s.transactionPreset),
    openImport: useUi((s) => s.openImport),
    categories: useUi((s) => s.categories)
  }
  const money = useMoney()
  const mutate = useMutation()
  const hasPreset = !!(preset?.needsReview || preset?.categoryId || preset?.search)
  const [view, setView] = useState<'calendar' | 'list'>(hasPreset ? 'list' : 'calendar')
  const [sorting, setSorting] = useState(false)
  const [search, setSearch] = useState(preset?.search ?? '')
  const [debounced, setDebounced] = useState(preset?.search ?? '')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState(
    preset?.needsReview ? '__review' : (preset?.categoryId ?? '')
  )
  const [direction, setDirection] = useState<Direction | ''>('')
  const [period, setPeriod] = useState<Period>(preset?.needsReview ? 'all' : 'month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [editing, setEditing] = useState<TransactionView | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200)
    return () => clearTimeout(t)
  }, [search])

  const filter: TransactionFilter = useMemo(
    () => ({
      search: debounced || null,
      accountId: accountId || null,
      categoryId: categoryId && categoryId !== '__review' ? categoryId : null,
      needsReview: categoryId === '__review' || undefined,
      direction: direction || null,
      from:
        period === 'month' && month ? monthStart(month) : period === 'custom' ? from || null : null,
      to: period === 'month' && month ? monthEnd(month) : period === 'custom' ? to || null : null
    }),
    [debounced, accountId, categoryId, direction, period, from, to, month]
  )
  const { data, error, loading, reload } = useQuery(() => api.listTransactions(filter), [filter])
  const calendar = useQuery(
    () =>
      month
        ? api.listTransactions({ from: monthStart(month), to: monthEnd(month), limit: 20000 })
        : Promise.resolve([]),
    [month]
  )

  useEffect(() => setSelected(new Set()), [filter])

  const rows = useMemo(() => data ?? [], [data])
  const visible = rows.slice(0, RENDER_LIMIT)
  const totals = useMemo(() => {
    let inflow = 0
    let outflow = 0
    for (const t of rows) {
      if (t.direction === 'transfer') continue
      if (t.amountMinor > 0) inflow += t.amountMinor
      else outflow -= t.amountMinor
    }
    return { inflow, outflow }
  }, [rows])

  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.id))
  const toggle = (id: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const hasAnyData = accounts.data?.some((a) => a.transactionCount > 0) ?? true

  return (
    <div>
      <PageHeader
        eyebrow="Transactions"
        title="Transactions"
        description={
          view === 'calendar'
            ? 'Tap a day to see what you spent. Darker days cost more.'
            : 'Search, recategorise and teach Sanchay how to handle your merchants.'
        }
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                {
                  value: 'calendar',
                  label: (
                    <>
                      <CalendarDays className="size-3.5" /> Calendar
                    </>
                  )
                },
                {
                  value: 'list',
                  label: (
                    <>
                      <List className="size-3.5" /> List
                    </>
                  )
                }
              ]}
            />
            <Button
              variant="ghost"
              icon={<Sparkles className="size-4" />}
              loading={sorting}
              title="Re-check every category with the latest rules and Sanchay"
              onClick={() => {
                setSorting(true)
                void recategorise().finally(() => setSorting(false))
              }}
            >
              Re-categorise with AI
            </Button>
            <Button icon={<Upload className="size-4" />} onClick={() => openImport()}>
              Import
            </Button>
          </>
        }
      />

      {view === 'calendar' && month && (
        <>
          {calendar.data ? (
            <SpendCalendar
              key={month}
              mode="out"
              month={month}
              rows={calendar.data}
              onEdit={setEditing}
            />
          ) : (
            <Spinner />
          )}
          {editing && <EditTransactionDialog tx={editing} onClose={() => setEditing(null)} />}
        </>
      )}
      {view === 'list' && (
        <>
          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
                  aria-hidden
                />
                <Input
                  className="pl-9"
                  placeholder="Search description, merchant or notes"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search transactions"
                />
              </div>
              <Select
                className="w-auto"
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                aria-label="Date range"
              >
                <option value="month">{month ? monthLabel(month) : 'This month'}</option>
                <option value="all">All dates</option>
                <option value="custom">Custom range…</option>
              </Select>
              {period === 'custom' && (
                <>
                  <Input
                    type="date"
                    className="w-[150px]"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    aria-label="From date"
                  />
                  <Input
                    type="date"
                    className="w-[150px]"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    aria-label="To date"
                  />
                </>
              )}
              <Select
                className="w-auto"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-label="Account"
              >
                <option value="">All accounts</option>
                {accounts.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select
                className="w-auto"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Category"
              >
                <option value="">All categories</option>
                <option value="__review">⚠︎ Needs review</option>
                <CategoryOptions />
              </Select>
              <Select
                className="w-auto"
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction | '')}
                aria-label="Transaction type"
              >
                <option value="">All types</option>
                <option value="income">Income</option>
                <option value="expense">Spending</option>
                <option value="transfer">Transfers</option>
              </Select>
            </div>
          </Card>

          {selected.size > 0 && (
            <div className="animate-fade-up sticky top-0 z-10 mb-3 flex items-center gap-3 rounded-xl border border-accent bg-surface px-4 py-2.5 text-[13px] text-ink shadow-[3px_3px_0_0_var(--color-accent-deep)]">
              <span className="font-medium">{selected.size} selected</span>
              <Select
                className="h-8 w-auto border-white/20 bg-white/10 text-white"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                aria-label="Bulk category"
              >
                <option value="">Set category…</option>
                <CategoryOptions />
              </Select>
              <Button
                size="sm"
                disabled={!bulkCategory}
                onClick={() =>
                  void mutate(
                    () => api.bulkUpdateCategory({ ids: [...selected], categoryId: bulkCategory }),
                    `Updated ${selected.size} transactions`
                  ).then(() => {
                    setSelected(new Set())
                    setBulkCategory('')
                  })
                }
              >
                Apply
              </Button>
              <button
                className="ml-auto text-white/70 hover:text-white"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          )}

          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : !data && loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <Card>
              {!hasAnyData ? (
                <EmptyState
                  icon={<ArrowLeftRight className="size-5" />}
                  title="No transactions yet"
                  description="Import a CSV statement from your bank or card to see transactions here."
                  action={
                    <Button
                      variant="primary"
                      icon={<Upload className="size-4" />}
                      onClick={() => openImport()}
                    >
                      Import statement
                    </Button>
                  }
                />
              ) : categoryId === '__review' ? (
                <EmptyState
                  icon={<ArrowLeftRight className="size-5" />}
                  title="Everything is categorised"
                  description="No transactions need review for these filters."
                />
              ) : (
                <EmptyState
                  icon={<Search className="size-5" />}
                  title="No matching transactions"
                  description="Try a different search, date range or filter."
                />
              )}
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-ink-2">
                <span>
                  {rows.length.toLocaleString()} transactions ·{' '}
                  <span className="num text-positive">+{money(totals.inflow)}</span> in ·{' '}
                  <span className="num">{money(totals.outflow)}</span> out{' '}
                  <span className="text-ink-3">(transfers excluded)</span>
                </span>
                {rows.length > RENDER_LIMIT && (
                  <span>Showing first {RENDER_LIMIT}. Narrow the filters to see more.</span>
                )}
              </div>
              <table className="w-full table-fixed text-[13px]">
                <thead className="bg-sunken/60 text-left text-xs text-ink-2">
                  <tr>
                    <th className="w-10 px-4 py-2">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-accent"
                        aria-label="Select all visible"
                        checked={allSelected}
                        onChange={() =>
                          setSelected(allSelected ? new Set() : new Set(visible.map((t) => t.id)))
                        }
                      />
                    </th>
                    <th className="w-[92px] py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Merchant</th>
                    <th className="w-[200px] py-2 font-medium">Category</th>
                    <th className="w-[150px] py-2 font-medium">Account</th>
                    <th className="w-[120px] py-2 pr-2 text-right font-medium">Amount</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((t) => (
                    <tr
                      key={t.id}
                      className={cn(
                        'group hover:bg-sunken/40',
                        selected.has(t.id) && 'bg-sunken/60'
                      )}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-accent"
                          aria-label={`Select ${t.merchantNormalised}`}
                          checked={selected.has(t.id)}
                          onChange={() => toggle(t.id)}
                        />
                      </td>
                      <td className="num py-2 text-ink-2">
                        {formatDate(t.transactionDate, 'short')}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{t.merchantNormalised}</span>
                          {t.isRecurring && <Badge tone="outline">Recurring</Badge>}
                          {t.notes && <Badge tone="neutral">Note</Badge>}
                        </div>
                        <p
                          className="truncate text-[11.5px] text-ink-3"
                          title={t.descriptionOriginal}
                        >
                          {t.descriptionOriginal}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        {t.isTransfer ? (
                          <Badge tone="neutral">
                            <ArrowLeftRight className="size-3" aria-hidden /> Transfer
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <CategoryDot categoryId={t.categoryId} />
                            <select
                              className={cn(
                                'h-7 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-1 text-[13px] hover:border-line-strong focus:border-accent focus:outline-none',
                                t.needsReview && 'text-attention'
                              )}
                              value={t.categoryId ?? ''}
                              aria-label={`Category for ${t.merchantNormalised}`}
                              onChange={(e) =>
                                void mutate(() =>
                                  api.updateTransaction({ id: t.id, categoryId: e.target.value })
                                )
                              }
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                  {t.needsReview && c.id === t.categoryId ? ' (needs review)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                      <td className="truncate py-2 pr-3 text-ink-2">{t.accountName}</td>
                      <td className={cn('py-2 pr-2 text-right', t.isTransfer && 'text-ink-3')}>
                        <Amount minor={t.amountMinor} colorInflow={!t.isTransfer} />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <button
                          className="rounded-md p-1.5 text-ink-3 opacity-0 hover:bg-sunken hover:text-ink focus:opacity-100 group-hover:opacity-100"
                          onClick={() => setEditing(t)}
                          aria-label={`Edit ${t.merchantNormalised}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {editing && <EditTransactionDialog tx={editing} onClose={() => setEditing(null)} />}
        </>
      )}
    </div>
  )
}
