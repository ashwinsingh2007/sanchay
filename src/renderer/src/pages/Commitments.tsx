import { Check, ChevronRight, EyeOff, Pencil, RefreshCw, Repeat, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDate } from '@shared/dates'
import { monthlyEquivalentMinor } from '@shared/domain/recurring'
import { minorToInputValue, parseMoneyInput } from '@shared/money'
import type { Cadence, CommitmentStatus, EvidenceTx, RecurringCommitment } from '@shared/types'
import {
  CategoryDot,
  ConfidenceBadge,
  EvidenceTransactions,
  useCategoryName
} from '../components/finance'
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
  Select,
  Spinner
} from '../components/ui'
import { useCurrency, useMoney, useMutation, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_120px_96px_104px_170px_210px] items-center gap-3'

const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom'
}
const STATUS_META: Record<
  CommitmentStatus,
  { label: string; tone: 'positive' | 'attention' | 'neutral' }
> = {
  active: { label: 'Active', tone: 'positive' },
  review: { label: 'Review', tone: 'attention' },
  ignored: { label: 'Ignored', tone: 'neutral' }
}

function EditCommitmentDialog({
  c,
  onClose
}: {
  c: RecurringCommitment
  onClose: () => void
}): React.JSX.Element {
  const currency = useCurrency()
  const categories = useUi((s) => s.categories)
  const mutate = useMutation()
  const [name, setName] = useState(c.merchantName)
  const [amount, setAmount] = useState(minorToInputValue(c.typicalAmountMinor, currency))
  const [cadence, setCadence] = useState<Cadence>(c.cadence)
  const [next, setNext] = useState(c.nextExpectedDate ?? '')
  const [categoryId, setCategoryId] = useState(c.categoryId ?? '')

  async function save(): Promise<void> {
    const amountMinor = parseMoneyInput(amount, currency)
    const ok = await mutate(
      () =>
        api.updateCommitment({
          id: c.id,
          merchantName: name.trim() || c.merchantName,
          typicalAmountMinor: amountMinor ?? c.typicalAmountMinor,
          cadence,
          nextExpectedDate: next || null,
          categoryId: categoryId || null
        }),
      'Commitment saved and confirmed'
    )
    if (ok) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit commitment"
      description="Your edits are kept when detection re-runs."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="cm-n" className="col-span-2">
          <Input id="cm-n" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Typical amount" htmlFor="cm-a">
          <Input
            id="cm-a"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Cadence" htmlFor="cm-c">
          <Select id="cm-c" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            {(['monthly', 'quarterly', 'yearly'] as const).map((k) => (
              <option key={k} value={k}>
                {CADENCE_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next expected date" htmlFor="cm-d">
          <Input id="cm-d" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Category" htmlFor="cm-cat">
          <Select id="cm-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  )
}

function CommitmentRow({
  c,
  evidence,
  onEdit
}: {
  c: RecurringCommitment
  evidence: EvidenceTx[]
  onEdit: () => void
}): React.JSX.Element {
  const money = useMoney()
  const mutate = useMutation()
  const categoryName = useCategoryName()
  const status = STATUS_META[c.status]
  const setStatus = (s: CommitmentStatus, msg: string): void =>
    void mutate(() => api.updateCommitment({ id: c.id, status: s }), msg)

  return (
    <li className={cn(c.status === 'ignored' && 'opacity-60')}>
      <details className="group">
        <summary className={cn(ROW_GRID, 'px-5 py-3 hover:bg-sunken/40')}>
          <span className="flex min-w-0 items-center gap-2.5">
            <ChevronRight
              className="chevron size-3.5 shrink-0 text-ink-3 transition-transform"
              aria-hidden
            />
            <CategoryDot categoryId={c.categoryId} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{c.merchantName}</span>
              <span className="block truncate text-xs text-ink-3">
                {categoryName(c.categoryId)}
                {c.userEdited && ' · edited'}
              </span>
            </span>
          </span>
          <span className="num text-right">
            <span className="block text-sm font-semibold">{money(c.typicalAmountMinor)}</span>
            {c.cadence !== 'monthly' && (
              <span className="block text-[11px] text-ink-3">
                ≈ {money(monthlyEquivalentMinor(c.typicalAmountMinor, c.cadence))}/mo
              </span>
            )}
          </span>
          <span className="text-[13px] text-ink-2">{CADENCE_LABEL[c.cadence]}</span>
          <span className="num text-[13px] text-ink-2">
            {c.nextExpectedDate ? formatDate(c.nextExpectedDate, 'short') : '—'}
          </span>
          <span className="flex flex-col items-start gap-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            {!c.userConfirmed && <ConfidenceBadge confidence={c.confidence} />}
          </span>
          <span className="flex items-center justify-end gap-1" onClick={(e) => e.preventDefault()}>
            {c.status !== 'active' && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Check className="size-3.5" />}
                onClick={() => setStatus('active', `${c.merchantName} confirmed`)}
              >
                Confirm
              </Button>
            )}
            {c.status !== 'ignored' ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<EyeOff className="size-3.5" />}
                onClick={() => setStatus('ignored', `${c.merchantName} ignored`)}
              >
                Ignore
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => setStatus('review', `${c.merchantName} restored`)}
              >
                Restore
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit ${c.merchantName}`}
              icon={<Pencil className="size-3.5" />}
              onClick={onEdit}
            />
          </span>
        </summary>
        <div className="border-t border-line bg-canvas/50 px-5 py-3 pl-14">
          <p className="mb-1 text-xs text-ink-2">
            Detected from {c.linkedTransactionIds.length} payments
            {c.lastSeenDate && `, last on ${formatDate(c.lastSeenDate)}`}. Next date is estimated
            from the last payment and cadence.
          </p>
          {evidence.length > 0 && <EvidenceTransactions transactions={evidence} limit={8} />}
        </div>
      </details>
    </li>
  )
}

export function CommitmentsPage({
  embedded = false
}: { embedded?: boolean } = {}): React.JSX.Element {
  const money = useMoney()
  const mutate = useMutation()
  const { data, error, loading, reload } = useQuery(() => api.listCommitments())
  const txs = useQuery(() => api.listTransactions({ limit: 20000 }))
  const [editing, setEditing] = useState<RecurringCommitment | null>(null)

  const byId = useMemo(() => new Map((txs.data ?? []).map((t) => [t.id, t])), [txs.data])
  const evidenceFor = (c: RecurringCommitment): EvidenceTx[] =>
    c.linkedTransactionIds
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
      .map((t) => ({
        id: t.id,
        date: t.transactionDate,
        merchant: t.merchantNormalised,
        description: t.descriptionOriginal,
        amountMinor: t.amountMinor,
        categoryId: t.categoryId
      }))

  const list = data ?? []
  const live = list.filter((c) => c.status !== 'ignored')
  const monthlyTotal = live.reduce(
    (s, c) => s + monthlyEquivalentMinor(c.typicalAmountMinor, c.cadence),
    0
  )
  const groups: [string, RecurringCommitment[]][] = [
    ['Needs review', list.filter((c) => c.status === 'review')],
    ['Active', list.filter((c) => c.status === 'active')],
    ['Ignored', list.filter((c) => c.status === 'ignored')]
  ]

  return (
    <div>
      {!embedded && (
        <PageHeader
          eyebrow="Commitments"
          title="Fixed commitments"
          description="Recurring payments detected from your statements. Confirm the real ones, ignore the rest — confirmed and unconfirmed commitments both count toward safe-to-spend."
          actions={
            <Button
              icon={<RefreshCw className="size-4" />}
              onClick={() => void mutate(() => api.redetectCommitments(), 'Detection re-run')}
            >
              Re-run detection
            </Button>
          }
        />
      )}

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Repeat className="size-5" />}
            title="No recurring payments detected yet"
            description="Detection needs at least three similar payments to the same merchant at a regular interval (two for yearly). Import more months of statements to find them."
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Card className="p-5">
              <p className="text-[13px] font-medium text-ink-2">Monthly commitments</p>
              <p className="num mt-1.5 text-[26px] font-semibold tracking-tight">
                {money(monthlyTotal)}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Monthly equivalent of {live.length} active and unconfirmed items
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-medium text-ink-2">Per year</p>
              <p className="num mt-1.5 text-[26px] font-semibold tracking-tight">
                {money(monthlyTotal * 12)}
              </p>
              <p className="mt-1 text-xs text-ink-3">If nothing changes</p>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-medium text-ink-2">How detection works</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
                Same merchant · similar amount (±tolerance in Settings) · charged roughly monthly,
                quarterly or yearly · at least 3 times (2 for yearly).
              </p>
            </Card>
          </div>

          <div className="grid gap-6">
            {groups
              .filter(([, items]) => items.length > 0)
              .map(([title, items]) => (
                <Card key={title} className="overflow-hidden">
                  <div
                    className={cn(
                      ROW_GRID,
                      'border-b border-line bg-sunken/50 px-5 py-2 text-xs font-medium text-ink-2'
                    )}
                  >
                    <span className="pl-6">
                      {title} <span className="text-ink-3">({items.length})</span>
                    </span>
                    <span className="text-right">Typical amount</span>
                    <span>Cadence</span>
                    <span>Next expected</span>
                    <span>Status</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-line">
                    {items.map((c) => (
                      <CommitmentRow
                        key={c.id}
                        c={c}
                        evidence={evidenceFor(c)}
                        onEdit={() => setEditing(c)}
                      />
                    ))}
                  </ul>
                </Card>
              ))}
          </div>
        </>
      )}
      {editing && <EditCommitmentDialog c={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
