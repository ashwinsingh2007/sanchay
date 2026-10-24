import {
  AlertTriangle,
  KeyRound,
  CheckCircle2,
  CopyCheck,
  FileSpreadsheet,
  Lock,
  Sparkles,
  Upload
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { formatDate, monthLabel } from '@shared/dates'
import { normaliseRows, suggestMapping, validateMapping } from '@shared/domain/csvNormalise'
import { currencyInfo } from '@shared/money'
import type {
  CasImportInfo,
  AccountType,
  ColumnMapping,
  ImportAnalysis,
  ImportSummary,
  ParsedCsv,
  Payslip,
  QuickImportResult,
  StatementReadResult
} from '@shared/types'
import { Amount } from '../components/finance'
import { Badge, Button, Dialog, Field, Input, Select } from '../components/ui'
import { useCurrency, useMoney, useQuery } from '../lib/hooks'
import { recategorise } from '../lib/recategorise'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

const MAX_DROP_BYTES = 25 * 1024 * 1024

/**
 * Drop or pick a bank/card statement (PDF or CSV). The file is read on this Mac; we first check
 * it's really a statement, ask for the PDF password if needed, then hand the rows on.
 */
export function CsvDropzone({
  onParsed,
  compact = false,
  kind = 'statement'
}: {
  onParsed: (csv: ParsedCsv) => void
  compact?: boolean
  kind?: 'statement' | 'payslip'
}): React.JSX.Element {
  const payslip = kind === 'payslip'
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ title: string; reason: string } | null>(null)
  const [slip, setSlip] = useState<{ payslip: Payslip; duplicate: boolean } | null>(null)
  const [cas, setCas] = useState<{ cas: CasImportInfo; duplicate: boolean } | null>(null)
  const [locked, setLocked] = useState<{
    token: string
    filename: string
    incorrect: boolean
  } | null>(null)
  const [password, setPassword] = useState('')

  async function handle(result: Promise<StatementReadResult | null>): Promise<void> {
    setBusy(true)
    setProblem(null)
    setSlip(null)
    setCas(null)
    try {
      const r = await result
      if (!r) return
      if (r.status === 'ok') {
        setLocked(null)
        onParsed(r.csv)
      } else if (r.status === 'password_required') {
        setLocked({ token: r.token, filename: r.filename, incorrect: r.incorrect })
        setPassword('')
      } else if (r.status === 'payslip') {
        setLocked(null)
        setSlip({ payslip: r.payslip, duplicate: r.duplicate })
        useUi.getState().bump()
      } else if (r.status === 'cas') {
        setLocked(null)
        setCas({ cas: r.cas, duplicate: r.duplicate })
        useUi.getState().bump()
      } else if (r.status === 'not_statement') {
        setLocked(null)
        setProblem({
          title: `“${r.filename}” doesn’t look like a bank statement`,
          reason: r.reason
        })
      } else {
        setLocked(null)
        setProblem({ title: 'We couldn’t read this file', reason: r.reason })
      }
    } catch (e) {
      setProblem({
        title: 'We couldn’t read this file',
        reason: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File): Promise<void> {
    if (!/\.(csv|txt|pdf)$/i.test(file.name)) {
      setProblem({
        title: 'Unsupported file',
        reason: 'Drop a PDF or CSV statement from your bank or card.'
      })
      return
    }
    if (file.size > MAX_DROP_BYTES) {
      setProblem({ title: 'File too large', reason: 'Statements up to 25 MB are supported.' })
      return
    }
    const data = new Uint8Array(await file.arrayBuffer())
    await handle(api.readStatementFile({ filename: file.name, data }))
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  if (locked) {
    return (
      <form
        className="flex flex-col items-center rounded-2xl border border-line-strong bg-surface px-8 py-10 text-center"
        onSubmit={(e) => {
          e.preventDefault()
          void handle(api.readStatementFile({ token: locked.token, password }))
        }}
      >
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-sunken text-ink-2">
          <KeyRound className="size-5" aria-hidden />
        </div>
        <p className="text-[15px] font-semibold">“{locked.filename}” is password-protected</p>
        <p className="mt-1 max-w-sm text-[13px] text-ink-2">
          Banks usually use your customer ID, date of birth or part of your PAN. The password is
          used once to open the file and is never saved.
        </p>
        <div className="mt-4 flex w-full max-w-xs gap-2">
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="PDF password"
            aria-label="PDF password"
            autoComplete="off"
          />
          <Button variant="primary" type="submit" loading={busy} disabled={!password}>
            Unlock
          </Button>
        </div>
        {locked.incorrect && (
          <p className="mt-2 text-xs text-negative">That password didn’t work. Try again.</p>
        )}
        <button
          type="button"
          className="mt-4 text-xs text-ink-3 underline underline-offset-2"
          onClick={() => setLocked(null)}
        >
          Choose a different file
        </button>
      </form>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors',
        compact ? 'px-6 py-8' : 'px-8 py-12',
        over ? 'border-accent bg-accent-soft/60' : 'border-line-strong bg-surface'
      )}
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-sunken text-ink-2">
        {busy ? (
          <Sparkles className="size-5 animate-pulse" aria-hidden />
        ) : (
          <FileSpreadsheet className="size-5" aria-hidden />
        )}
      </div>
      <p className="text-[15px] font-semibold">
        {busy
          ? payslip
            ? 'Reading your payslip…'
            : 'Checking your statement…'
          : payslip
            ? 'Drop your salary slip here'
            : 'Drop a bank or card statement here'}
      </p>
      <p className="mt-1 text-[13px] text-ink-2">
        {payslip
          ? 'The payslip PDF from your payroll portal. Password-protected PDFs work too.'
          : 'PDF or CSV, straight from your bank’s app or website. Password-protected PDFs work too.'}
      </p>
      <Button
        variant="primary"
        className="mt-4"
        loading={busy}
        icon={<Upload className="size-4" />}
        onClick={() => void handle(api.pickStatement())}
      >
        Choose file
      </Button>
      {slip && <PayslipSaved {...slip} />}
      {cas && <CasSaved {...cas} />}
      {problem && (
        <div
          className="mt-4 max-w-md rounded-xl border border-attention/30 bg-attention-soft px-4 py-3 text-left text-[13px]"
          role="alert"
        >
          <p className="font-medium">{problem.title}</p>
          <p className="mt-0.5 text-xs text-ink-2">{problem.reason}</p>
        </div>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-3">
        <Lock className="size-3 text-positive" aria-hidden /> Your file stays on this Mac
      </p>
    </div>
  )
}

const CAS_LABEL: Record<CasImportInfo['kind'], string> = {
  nsdl: 'NSDL demat statement',
  cdsl: 'CDSL demat statement',
  cams: 'CAMS mutual fund statement',
  kfintech: 'KFintech mutual fund statement'
}

/** A CAS was read: every holding across brokers / fund houses is now the portfolio source. */
function CasSaved({
  cas,
  duplicate
}: {
  cas: CasImportInfo
  duplicate: boolean
}): React.JSX.Element {
  const money = useMoney()
  return (
    <div
      className="mt-4 w-full max-w-md rounded-xl border border-positive/30 bg-positive-soft px-4 py-3 text-left text-[13px]"
      role="status"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <CheckCircle2 className="size-4 text-positive" />
        {duplicate ? 'This statement was already added' : `${CAS_LABEL[cas.kind]} added`}
      </p>
      <p className="mt-1 text-xs text-ink-2">
        {cas.holdingCount} holdings worth {money(cas.totalValueMinor)}
        {cas.statementDate ? ` as of ${cas.statementDate}` : ''}
      </p>
      {cas.accounts.length > 0 && (
        <p className="mt-0.5 text-xs text-ink-3">{cas.accounts.join(' · ')}</p>
      )}
      <p className="mt-2 text-[11.5px] text-ink-3">
        Your CFO and the Investments page now use these holdings. Upload a newer CAS each month to
        keep them current.
      </p>
    </div>
  )
}

function PayslipSaved({
  payslip: p,
  duplicate
}: {
  payslip: Payslip
  duplicate: boolean
}): React.JSX.Element {
  const money = useMoney()
  const rows: [string, number | null][] = [
    ['Gross pay', p.grossMinor],
    ['Take-home', p.netMinor],
    ['Income tax (TDS)', p.taxMinor],
    ['PF / VPF / NPS', (p.pfMinor ?? 0) + (p.vpfMinor ?? 0) + (p.npsMinor ?? 0) || null]
  ]
  return (
    <div
      className="mt-4 w-full max-w-md rounded-xl border border-positive/30 bg-positive-soft px-4 py-3 text-left text-[13px]"
      role="status"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <CheckCircle2 className="size-4 text-positive" />
        {duplicate ? 'This salary slip was already added' : 'Salary slip added'}
        {p.period && <span className="text-ink-2">· {monthLabel(p.period)}</span>}
      </p>
      {p.employer && <p className="mt-0.5 text-xs text-ink-2">{p.employer}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {rows
          .filter(([, v]) => v != null)
          .map(([label, v]) => (
            <div key={label} className="flex justify-between gap-2 text-xs">
              <dt className="text-ink-3">{label}</dt>
              <dd className="num font-medium">{money(v!)}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Your AI CFO now uses this for salary, tax and PF insights. Add more months for trends.
      </p>
    </div>
  )
}

const colLabel = (headers: string[], i: number): string => {
  const h = headers[i]?.trim()
  return `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''} · ${h || '(blank)'}`
}

function ColumnSelect({
  id,
  value,
  onChange,
  headers,
  optional
}: {
  id: string
  value: number | null
  onChange: (v: number | null) => void
  headers: string[]
  optional?: boolean
}): React.JSX.Element {
  return (
    <Select
      id={id}
      value={value ?? -1}
      onChange={(e) => onChange(Number(e.target.value) < 0 ? null : Number(e.target.value))}
    >
      <option value={-1}>{optional ? 'None' : 'Choose column…'}</option>
      {headers.map((_, i) => (
        <option key={i} value={i}>
          {colLabel(headers, i)}
        </option>
      ))}
    </Select>
  )
}

function MappingStep({
  csv,
  onDone,
  initial
}: {
  csv: ParsedCsv
  onDone: (summary: ImportSummary) => void
  initial?: {
    mapping: ColumnMapping
    accountType: AccountType
    accountName: string
    reasons: string[]
  }
}): React.JSX.Element {
  const currency = useCurrency()
  const toast = useUi((s) => s.toast)
  const accounts = useQuery(() => api.listAccounts())
  const [mapping, setMapping] = useState<ColumnMapping>(
    () => initial?.mapping ?? suggestMapping(csv.rows, csv.suggestedHeaderRow)
  )
  const [accountId, setAccountId] = useState<string>('new')
  const [accountName, setAccountName] = useState(
    () =>
      initial?.accountName ??
      csv.filename
        .replace(/\.(csv|txt)$/i, '')
        .replace(/[_-]+/g, ' ')
        .slice(0, 60)
  )
  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'bank')
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const userPickedAccount = useRef(false)

  const headers = csv.rows[mapping.headerRow] ?? []
  const set = (patch: Partial<ColumnMapping>): void => setMapping((m) => ({ ...m, ...patch }))
  const existing = accounts.data?.find((a) => a.id === accountId)

  const errors = validateMapping(mapping)
  const result = useMemo(
    () =>
      errors.length
        ? null
        : normaliseRows(csv.rows, mapping, currencyInfo(existing?.currency ?? currency).decimals),
    [csv.rows, mapping, currency, existing?.currency, errors.length]
  )
  const errorIssues = result?.issues.filter((i) => i.severity === 'error') ?? []

  // Check against what's already imported: same file? which account? how many rows are new?
  useEffect(() => {
    if (errors.length) {
      setAnalysis(null)
      return
    }
    const t = setTimeout(() => {
      void api
        .analyzeImport({
          filename: csv.filename,
          fileHash: csv.fileHash,
          rows: csv.rows,
          mapping,
          account: {
            existingAccountId: accountId === 'new' ? null : accountId,
            name: accountName.trim() || 'My account',
            type: accountType
          }
        })
        .then((a) => {
          setAnalysis(a)
          if (a.suggestedAccountId && !userPickedAccount.current && accountId === 'new') {
            setAccountId(a.suggestedAccountId)
          }
        })
        .catch(() => setAnalysis(null))
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, accountId, csv.fileHash, errors.length])
  const dates = result?.rows.map((r) => r.date).sort() ?? []

  async function commit(): Promise<void> {
    if (!result) return
    setBusy(true)
    try {
      const summary = await api.commitImport({
        filename: csv.filename,
        fileHash: csv.fileHash,
        rows: csv.rows,
        mapping,
        account: {
          existingAccountId: existing ? existing.id : null,
          name: existing ? existing.name : accountName.trim() || 'My account',
          type: existing ? existing.type : accountType
        }
      })
      onDone(summary)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      {initial && initial.reasons.length > 0 && (
        <div
          className="rounded-xl border border-attention/30 bg-attention-soft px-4 py-3 text-[13px]"
          role="alert"
        >
          <p className="font-medium">We couldn’t read this statement confidently.</p>
          <p className="mt-0.5 text-xs text-ink-2">
            {initial.reasons.join(' ')} Please check the columns below.
          </p>
        </div>
      )}
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <FileSpreadsheet className="size-4" aria-hidden />
        <span className="font-medium text-ink">{csv.filename}</span>
        <span>· {csv.rows.length} lines</span>
      </div>

      {analysis && analysis.totalRows > 0 && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]',
            analysis.newRows === 0
              ? 'border-attention/30 bg-attention-soft'
              : analysis.duplicateRows > 0
                ? 'border-line-strong bg-accent-soft'
                : 'border-positive/25 bg-positive-soft'
          )}
          role="status"
        >
          {analysis.duplicateRows > 0 ? (
            <CopyCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <div>
            <p className="font-medium">
              {analysis.sameFile
                ? `You imported this exact file on ${formatDate(analysis.sameFile.importedAt.slice(0, 10))}.`
                : analysis.newRows === 0
                  ? 'Everything in this file is already in your data.'
                  : analysis.duplicateRows > 0
                    ? `${analysis.duplicateRows} of ${analysis.totalRows} transactions are already here — only ${analysis.newRows} new will be added.`
                    : `All ${analysis.totalRows} transactions are new.`}
            </p>
            <p className="mt-0.5 text-xs text-ink-2">
              {analysis.suggestedAccountName
                ? `Recognised as your ${analysis.suggestedAccountName} statement, so it goes into that account. Nothing gets counted twice.`
                : 'Duplicates are detected automatically, even across different exports of the same account.'}
            </p>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-x-5 gap-y-4">
        <h3 className="col-span-2 text-[13px] eyebrow text-ink-3">1 · Account</h3>
        <Field label="Import into" htmlFor="acc">
          <Select
            id="acc"
            value={accountId}
            onChange={(e) => {
              userPickedAccount.current = true
              setAccountId(e.target.value)
              const chosen = accounts.data?.find((a) => a.id === e.target.value)
              const type = chosen ? chosen.type : accountType
              if (mapping.amountMode === 'signed')
                set({ positiveMeans: type === 'credit_card' ? 'outflow' : 'inflow' })
            }}
          >
            <option value="new">New account…</option>
            {accounts.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {existing ? (
          <Field label="Account type">
            <p className="flex h-9 items-center text-sm text-ink-2">
              {existing.type === 'credit_card' ? 'Credit card' : 'Bank account'}
            </p>
          </Field>
        ) : (
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <Field label="Account name" htmlFor="acc-name">
              <Input
                id="acc-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. Salary account"
              />
            </Field>
            <Field label="Type" htmlFor="acc-type">
              <Select
                id="acc-type"
                value={accountType}
                onChange={(e) => {
                  const type = e.target.value as AccountType
                  setAccountType(type)
                  if (mapping.amountMode === 'signed')
                    set({ positiveMeans: type === 'credit_card' ? 'outflow' : 'inflow' })
                }}
              >
                <option value="bank">Bank account</option>
                <option value="credit_card">Credit card</option>
              </Select>
            </Field>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-x-5 gap-y-4">
        <h3 className="col-span-2 text-[13px] eyebrow text-ink-3">2 · Columns</h3>
        <Field label="Header row" hint="The line that contains column names." htmlFor="hdr">
          <Select
            id="hdr"
            value={mapping.headerRow}
            onChange={(e) => setMapping(suggestMapping(csv.rows, Number(e.target.value)))}
          >
            {csv.rows.slice(0, 40).map((r, i) => (
              <option key={i} value={i}>
                Line {i + 1}: {r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date format" htmlFor="dfmt">
          <Select
            id="dfmt"
            value={mapping.dateOrder}
            onChange={(e) => set({ dateOrder: e.target.value as ColumnMapping['dateOrder'] })}
          >
            <option value="dmy">Day / Month / Year (31/01/2026)</option>
            <option value="mdy">Month / Day / Year (01/31/2026)</option>
            <option value="ymd">Year / Month / Day (2026-01-31)</option>
          </Select>
        </Field>
        <Field label="Date" htmlFor="c-date">
          <ColumnSelect
            id="c-date"
            headers={headers}
            value={mapping.dateColumn}
            onChange={(v) => set({ dateColumn: v ?? -1 })}
          />
        </Field>
        <Field label="Description / merchant" htmlFor="c-desc">
          <ColumnSelect
            id="c-desc"
            headers={headers}
            value={mapping.descriptionColumn}
            onChange={(v) => set({ descriptionColumn: v ?? -1 })}
          />
        </Field>

        <fieldset className="col-span-2">
          <legend className="mb-2 text-[13px] font-medium">How are amounts shown?</legend>
          <div className="flex gap-2">
            {(
              [
                ['debit_credit', 'Separate debit & credit columns'],
                ['signed', 'One amount column']
              ] as const
            ).map(([mode, label]) => (
              <label
                key={mode}
                className={cn(
                  'flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]',
                  mapping.amountMode === mode
                    ? 'border-accent bg-accent-soft/50 font-medium'
                    : 'border-line-strong'
                )}
              >
                <input
                  type="radio"
                  name="amode"
                  className="accent-accent"
                  checked={mapping.amountMode === mode}
                  onChange={() => set({ amountMode: mode })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {mapping.amountMode === 'signed' ? (
          <>
            <Field label="Amount" htmlFor="c-amt">
              <ColumnSelect
                id="c-amt"
                headers={headers}
                value={mapping.amountColumn}
                onChange={(v) => set({ amountColumn: v })}
              />
            </Field>
            <Field
              label="Positive amounts are"
              hint="Card exports usually show purchases as positive."
              htmlFor="pos"
            >
              <Select
                id="pos"
                value={mapping.positiveMeans}
                onChange={(e) => set({ positiveMeans: e.target.value as 'inflow' | 'outflow' })}
              >
                <option value="inflow">Money in (deposits)</option>
                <option value="outflow">Money out (spending)</option>
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Debit (money out)" htmlFor="c-dr">
              <ColumnSelect
                id="c-dr"
                headers={headers}
                value={mapping.debitColumn}
                onChange={(v) => set({ debitColumn: v })}
                optional
              />
            </Field>
            <Field label="Credit (money in)" htmlFor="c-cr">
              <ColumnSelect
                id="c-cr"
                headers={headers}
                value={mapping.creditColumn}
                onChange={(v) => set({ creditColumn: v })}
                optional
              />
            </Field>
          </>
        )}
        <Field
          label="Balance (optional)"
          hint="Used as your current balance for safe-to-spend."
          htmlFor="c-bal"
        >
          <ColumnSelect
            id="c-bal"
            headers={headers}
            value={mapping.balanceColumn}
            onChange={(v) => set({ balanceColumn: v })}
            optional
          />
        </Field>
      </section>

      <section>
        <h3 className="mb-3 text-[13px] eyebrow text-ink-3">3 · Preview</h3>
        {errors.length > 0 ? (
          <p className="rounded-lg bg-attention-soft px-3 py-2 text-[13px] text-attention">
            {errors.join(' ')}
          </p>
        ) : result ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
              <Badge tone="positive">
                <CheckCircle2 className="size-3" aria-hidden /> {result.rows.length} transactions
                ready
              </Badge>
              {dates.length > 0 && (
                <span className="text-ink-2">
                  {formatDate(dates[0]!)} – {formatDate(dates[dates.length - 1]!)}
                </span>
              )}
              {errorIssues.length > 0 && (
                <Badge tone="attention">
                  <AlertTriangle className="size-3" aria-hidden /> {errorIssues.length} rows can’t
                  be read and will be skipped
                </Badge>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-sunken text-left text-xs text-ink-2">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    {mapping.balanceColumn != null && (
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.rows.slice(0, 10).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="num whitespace-nowrap px-3 py-1.5 text-ink-2">
                        {formatDate(r.date)}
                      </td>
                      <td className="max-w-[360px] truncate px-3 py-1.5" title={r.description}>
                        {r.description}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Amount minor={r.amountMinor} />
                      </td>
                      {mapping.balanceColumn != null && (
                        <td className="px-3 py-1.5 text-right text-ink-2">
                          {r.balanceMinor != null ? (
                            <Amount minor={r.balanceMinor} colorInflow={false} />
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Check that money in shows as + and money out has no sign. If it’s reversed, change
              “Positive amounts are”.
            </p>
            {result.issues.length > 0 && (
              <details className="mt-3 text-[13px]">
                <summary className="cursor-pointer text-ink-2">
                  Import warnings ({result.issues.length})
                </summary>
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-ink-2">
                  {result.issues.slice(0, 50).map((i, n) => (
                    <li key={n}>
                      <span className={i.severity === 'error' ? 'text-attention' : ''}>
                        Line {i.rowNumber}:
                      </span>{' '}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : null}
      </section>

      <div className="sticky bottom-0 -mx-6 -mb-5 flex items-center justify-between border-t border-line bg-surface px-6 py-3.5">
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <Lock className="size-3 text-positive" aria-hidden /> Processed on this Mac. Duplicates
          are skipped automatically.
        </p>
        <Button
          variant="primary"
          loading={busy}
          disabled={!result || result.rows.length === 0}
          onClick={() => void commit()}
        >
          {analysis && analysis.totalRows > 0
            ? analysis.newRows === 0
              ? 'Done — nothing new'
              : `Add ${analysis.newRows} new transaction${analysis.newRows === 1 ? '' : 's'}`
            : `Import ${result ? result.rows.length : ''} transactions`}
        </Button>
      </div>
    </div>
  )
}

function SummaryStep({
  summary,
  onFixColumns,
  mappedBy
}: {
  summary: ImportSummary
  onFixColumns?: () => void
  mappedBy?: 'auto' | 'ai'
}): React.JSX.Element {
  const { closeImport, go, setMonth } = useUi()
  const settings = useUi((s) => s.settings)
  const toast = useUi((s) => s.toast)

  async function finish(target: 'home' | 'review'): Promise<void> {
    try {
      if (settings && !settings.onboardingComplete)
        await api.updateSettings({ onboardingComplete: true })
      const { defaultMonth } = await api.listMonths()
      setMonth(defaultMonth)
      closeImport()
      if (target === 'review') go('flow')
      else go('home')
      useUi.getState().bump()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const stats: [string, string | number][] = [
    ['Imported', summary.importedCount],
    ['Already here, skipped', summary.duplicateCount + summary.cleanedUp],
    ['Unreadable rows skipped', summary.invalidCount],
    ['Need a category', summary.needsReviewCount]
  ]
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-positive-soft text-positive">
        <CheckCircle2 className="size-6" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold tracking-tight">
        {summary.importedCount > 0
          ? `Imported into ${summary.accountName}`
          : 'Nothing new to import'}
      </h3>
      {summary.dateRangeStart && summary.dateRangeEnd && (
        <p className="mt-1 text-[13px] text-ink-2">
          {formatDate(summary.dateRangeStart)} – {formatDate(summary.dateRangeEnd)}
        </p>
      )}
      <dl className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3 text-left">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line px-4 py-3">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="num mt-0.5 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {(summary.autoMatchedAccount || summary.cleanedUp > 0) && (
        <p className="mt-4 text-xs text-ink-2">
          {summary.autoMatchedAccount && `Recognised as your ${summary.accountName} statement. `}
          {summary.cleanedUp > 0 &&
            `Removed ${summary.cleanedUp} duplicate${summary.cleanedUp === 1 ? '' : 's'} from earlier imports.`}
        </p>
      )}
      {summary.balanceUpdated && (
        <p className="mt-4 text-xs text-ink-2">
          Current balance updated from the statement’s closing balance.
        </p>
      )}
      {mappedBy && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-3">
          <Sparkles className="size-3.5" aria-hidden />
          {mappedBy === 'ai'
            ? 'Columns read by your on-device AI.'
            : 'Columns, signs and account detected automatically.'}
          {onFixColumns && summary.importedCount > 0 && (
            <button
              className="ml-1 underline underline-offset-2 hover:text-ink"
              onClick={onFixColumns}
            >
              Something look wrong?
            </button>
          )}
        </p>
      )}
      <div className="mt-6 flex justify-center gap-2">
        {summary.needsReviewCount > 0 && (
          <Button onClick={() => void finish('review')}>Review uncategorised</Button>
        )}
        <Button variant="primary" onClick={() => void finish('home')}>
          See your insights
        </Button>
      </div>
    </div>
  )
}

type Stage =
  | { kind: 'pick' }
  | { kind: 'reading'; csv: ParsedCsv }
  | {
      kind: 'review'
      csv: ParsedCsv
      initial?: {
        mapping: ColumnMapping
        accountType: AccountType
        accountName: string
        reasons: string[]
      }
    }
  | {
      kind: 'done'
      csv: ParsedCsv
      summary: ImportSummary
      mapping?: ColumnMapping
      mappedBy?: 'auto' | 'ai'
    }

const READING_STEPS = [
  'Reading your statement',
  'Finding dates, amounts and merchants',
  'Matching it to your accounts',
  'Skipping anything already imported'
]

function Reading(): React.JSX.Element {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, READING_STEPS.length - 1)), 650)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col items-center py-14 text-center" role="status" aria-live="polite">
      <span className="gloss mb-5 flex size-14 items-center justify-center rounded-2xl text-white">
        <Sparkles className="size-6 animate-pulse" aria-hidden />
      </span>
      <ul className="space-y-1.5 text-[14px]">
        {READING_STEPS.map((step, n) => (
          <li
            key={step}
            className={cn(
              'transition-colors',
              n < i ? 'text-ink-3' : n === i ? 'font-medium text-ink' : 'text-ink-3/40'
            )}
          >
            {n < i ? '✓ ' : ''}
            {step}
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-center gap-1.5 text-xs text-ink-3">
        <Lock className="size-3" aria-hidden /> All on this Mac
      </p>
    </div>
  )
}

export function ImportWizard(): React.JSX.Element {
  const { importInitial, importKind, closeImport, toast } = useUi()
  const [stage, setStage] = useState<Stage>(() =>
    importInitial ? { kind: 'reading', csv: importInitial } : { kind: 'pick' }
  )

  // Drop a file → import it automatically. Only ask for help if the file can't be read confidently.
  // One request per file, even if React runs this effect twice (StrictMode) — never import twice.
  const inFlight = useRef<{ key: ParsedCsv; promise: Promise<QuickImportResult> } | null>(null)
  useEffect(() => {
    if (stage.kind !== 'reading') return
    let cancelled = false
    const { csv } = stage
    if (inFlight.current?.key !== csv) {
      inFlight.current = {
        key: csv,
        promise: api.quickImport({ filename: csv.filename, fileHash: csv.fileHash, rows: csv.rows })
      }
    }
    inFlight.current.promise
      .then((r) => {
        if (cancelled) return
        if (r.status === 'imported')
          setStage({
            kind: 'done',
            csv,
            summary: r.summary,
            mapping: r.mapping,
            mappedBy: r.mappedBy
          })
        else
          setStage({
            kind: 'review',
            csv,
            initial: {
              mapping: r.mapping,
              accountType: r.accountType,
              accountName: r.accountName,
              reasons: r.reasons
            }
          })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        toast(e instanceof Error ? e.message : String(e), 'error')
        setStage({ kind: 'review', csv })
      })
    return () => {
      cancelled = true
    }
  }, [stage, toast])

  async function fixColumns(s: Extract<Stage, { kind: 'done' }>): Promise<void> {
    // Undo the automatic import, then let the user correct the columns.
    if (s.summary.importSourceId) await api.deleteImportSource(s.summary.importSourceId)
    useUi.getState().bump()
    setStage({
      kind: 'review',
      csv: s.csv,
      initial: s.mapping
        ? {
            mapping: s.mapping,
            accountType: 'bank',
            accountName: s.summary.accountName,
            reasons: []
          }
        : undefined
    })
  }

  // Once rows are in, let the AI CFO sort whatever the rules weren't sure about (in the background).
  useEffect(() => {
    if (stage.kind === 'done') void recategorise({ quiet: true })
  }, [stage.kind])

  const title =
    stage.kind === 'done'
      ? 'Import complete'
      : stage.kind === 'review'
        ? 'Check the columns'
        : stage.kind === 'reading'
          ? 'Importing'
          : importKind === 'payslip'
            ? 'Import payslip'
            : 'Import statement'
  const description =
    stage.kind === 'pick'
      ? importKind === 'payslip'
        ? 'Your AI CFO uses it for salary, tax and PF insights. Read on this Mac only.'
        : 'Drop a statement from any bank or credit card — we’ll take it from there.'
      : stage.kind === 'review'
        ? 'Nothing is saved until you import.'
        : undefined

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (stage.kind === 'done') useUi.getState().bump()
          closeImport()
        }
      }}
      title={title}
      description={description}
      className="w-[min(860px,94vw)]"
    >
      {stage.kind === 'done' ? (
        <SummaryStep
          summary={stage.summary}
          mappedBy={stage.mappedBy}
          onFixColumns={() => void fixColumns(stage)}
        />
      ) : stage.kind === 'review' ? (
        <MappingStep
          csv={stage.csv}
          initial={stage.initial}
          onDone={(summary) => setStage({ kind: 'done', csv: stage.csv, summary })}
        />
      ) : stage.kind === 'reading' ? (
        <Reading />
      ) : (
        <CsvDropzone
          onParsed={(csv) => setStage({ kind: 'reading', csv })}
          compact
          kind={importKind}
        />
      )}
    </Dialog>
  )
}
