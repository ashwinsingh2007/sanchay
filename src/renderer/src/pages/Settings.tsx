import {
  Bot,
  Building2,
  Download,
  FileX2,
  HardDrive,
  Lock,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@shared/dates'
import { minorToInputValue, parseMoneyInput } from '@shared/money'
import { COUNTRIES } from '@shared/region'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  Disclaimer,
  Field,
  Input,
  PageHeader,
  Segmented,
  Select,
  Spinner
} from '../components/ui'
import { useCategoryName } from '../components/finance'
import { AiSetup } from '../components/AiSetup'
import { STYLE_META, useTheme, type Style } from '../lib/theme'
import { ClearDataButton } from '../components/ClearDataButton'
import { useMutation, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

function PlanningSettings(): React.JSX.Element {
  const settings = useUi((s) => s.settings)!
  const mutate = useMutation()
  const [currency, setCurrency] = useState(settings.primaryCurrency)
  const [nextIncome, setNextIncome] = useState(settings.nextIncomeDate ?? '')
  const [income, setIncome] = useState(
    minorToInputValue(settings.expectedIncomeMinor, settings.primaryCurrency)
  )
  const [buffer, setBuffer] = useState(
    minorToInputValue(settings.emergencyBufferMinor || null, settings.primaryCurrency)
  )
  const [target, setTarget] = useState(
    minorToInputValue(settings.monthlySavingsTargetMinor, settings.primaryCurrency)
  )
  const [tolerance, setTolerance] = useState(String(settings.recurringTolerancePct))

  return (
    <Card>
      <CardHeader
        title="Currency & planning"
        description="Used for safe-to-spend, savings targets and recurring detection."
      />
      <form
        className="grid grid-cols-3 gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void mutate(
            () =>
              api.updateSettings({
                primaryCurrency: currency,
                nextIncomeDate: nextIncome || null,
                expectedIncomeMinor: parseMoneyInput(income, currency),
                emergencyBufferMinor: parseMoneyInput(buffer, currency) ?? 0,
                monthlySavingsTargetMinor: parseMoneyInput(target, currency),
                recurringTolerancePct: Math.min(50, Math.max(1, Number(tolerance) || 15))
              }),
            'Settings saved'
          )
        }}
      >
        <Field
          label="Country"
          hint="Sets your currency and which banks, brokers and tips you see. Existing amounts are not converted."
          htmlFor="s-cur"
        >
          <Select id="s-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.currency}>
                {c.name} ({c.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Next income date"
          hint="Rolls forward monthly once it passes."
          htmlFor="s-inc-d"
        >
          <Input
            id="s-inc-d"
            type="date"
            value={nextIncome}
            onChange={(e) => setNextIncome(e.target.value)}
          />
        </Field>
        <Field label="Expected monthly income" hint="Optional" htmlFor="s-inc">
          <Input
            id="s-inc"
            inputMode="decimal"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        </Field>
        <Field label="Emergency buffer" hint="Excluded from safe-to-spend." htmlFor="s-buf">
          <Input
            id="s-buf"
            inputMode="decimal"
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
          />
        </Field>
        <Field label="Monthly savings target" hint="Optional" htmlFor="s-tgt">
          <Input
            id="s-tgt"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field
          label="Recurring amount tolerance (%)"
          hint="How much a recurring charge may vary."
          htmlFor="s-tol"
        >
          <Input
            id="s-tol"
            type="number"
            min={1}
            max={50}
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
        </Field>
        <p className="col-span-2 self-center text-xs text-ink-3">
          Months are calendar months in this version.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" type="submit">
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  )
}

function RulesSection(): React.JSX.Element {
  const { data } = useQuery(() => api.listRules())
  const mutate = useMutation()
  const categoryName = useCategoryName()
  return (
    <Card>
      <CardHeader
        title="Merchant rules"
        description="Created from Transactions → “Always categorise this merchant”. Applied before built-in keywords."
      />
      <div className="p-5 pt-3">
        {!data || data.length === 0 ? (
          <p className="text-[13px] text-ink-3">No rules yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-[13px]">
                <Badge tone="outline">{r.matchType}</Badge>
                <code className="rounded bg-sunken px-1.5 py-0.5 text-xs">{r.matchValue}</code>
                <span className="text-ink-3">→</span>
                <span className="flex-1">
                  {categoryName(r.categoryId)}
                  {r.merchantNormalised && (
                    <span className="text-ink-3"> · as “{r.merchantNormalised}”</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete rule"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => void mutate(() => api.deleteRule(r.id), 'Rule deleted')}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function DataSection(): React.JSX.Element {
  const mutate = useMutation()
  const toast = useUi((s) => s.toast)
  const sources = useQuery(() => api.listImportSources())
  const info = useQuery(() => api.getAppInfo())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [typed, setTyped] = useState('')

  async function doExport(format: 'json' | 'csv'): Promise<void> {
    try {
      const res = await api.exportData(format)
      if (res.saved) toast(`Exported to ${res.path}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <Card>
      <CardHeader title="Your data" description="Export, remove an import, or erase everything." />
      <div className="grid gap-6 p-5 pt-4">
        <div className="flex items-start gap-3 rounded-xl bg-sunken/70 p-4">
          <HardDrive className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />
          <div className="min-w-0 text-[13px]">
            <p className="font-medium">Stored locally on this Mac</p>
            <p className="mt-0.5 break-all text-xs text-ink-3" data-selectable>
              {info.data?.databaseFile ?? '…'}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              Stored as a standard SQLite file protected by your macOS account. It is not separately
              encrypted by Sanchay — use FileVault for disk encryption.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button icon={<Download className="size-4" />} onClick={() => void doExport('json')}>
            Export everything (JSON)
          </Button>
          <Button icon={<Download className="size-4" />} onClick={() => void doExport('csv')}>
            Export transactions (CSV)
          </Button>
        </div>

        <div>
          <h4 className="mb-2 text-[13px] font-semibold">Imported statements</h4>
          {!sources.data ? (
            <Spinner />
          ) : sources.data.length === 0 ? (
            <p className="text-[13px] text-ink-3">No imports yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {sources.data.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.filename}</span>
                      {s.isSample && <Badge tone="attention">Sample</Badge>}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {s.accountName} · {s.transactionCount} transactions
                      {s.dateRangeStart &&
                        s.dateRangeEnd &&
                        ` · ${formatDate(s.dateRangeStart, 'short')} – ${formatDate(s.dateRangeEnd)}`}{' '}
                      · imported {formatDate(s.importedAt.slice(0, 10))}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<FileX2 className="size-3.5" />}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete “${s.filename}” and its ${s.transactionCount} transactions? This cannot be undone.`
                        )
                      ) {
                        void mutate(() => api.deleteImportSource(s.id), 'Import deleted')
                      }
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-line p-4">
          <div>
            <p className="text-[13px] font-semibold">Start fresh</p>
            <p className="text-xs text-ink-2">
              Clear all imported statements and transactions, keep your settings and AI setup, then
              import again.
            </p>
          </div>
          <ClearDataButton />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-negative/20 bg-negative-soft/50 p-4">
          <div>
            <p className="text-[13px] font-semibold text-negative">Delete all local data</p>
            <p className="text-xs text-ink-2">
              Removes every account, transaction, rule, goal and setting from this Mac.
            </p>
          </div>
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" />}
            onClick={() => setConfirmOpen(true)}
          >
            Delete everything
          </Button>
        </div>
      </div>
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o)
          setTyped('')
        }}
        title="Delete all local data?"
        description="This permanently erases everything Sanchay has stored. Export first if you want a backup."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={typed !== 'DELETE'}
              onClick={() =>
                void mutate(async () => {
                  await api.deleteAllData('DELETE')
                  useUi.getState().setMonth('')
                  useUi.getState().go('home')
                }, 'All local data deleted').then(() => setConfirmOpen(false))
              }
            >
              Permanently delete
            </Button>
          </>
        }
      >
        <Field
          label={
            <>
              Type <code className="rounded bg-sunken px-1">DELETE</code> to confirm
            </>
          }
          htmlFor="del-confirm"
        >
          <Input
            id="del-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </Field>
      </Dialog>
    </Card>
  )
}

function PrivacySection(): React.JSX.Element {
  const statements: [React.ReactNode, string][] = [
    [<Building2 key="1" className="size-4" />, 'Sanchay does not connect to your bank.'],
    [<Lock key="2" className="size-4" />, 'Your imported statements are processed locally.'],
    [
      <ShieldCheck key="3" className="size-4" />,
      'No financial data is sent to our servers in this version.'
    ],
    [
      <ShieldCheck key="4" className="size-4" />,
      'Cloud AI is optional and off by default. If you turn it on, only a spending summary is sent — never raw statements.'
    ],
    [
      <ShieldCheck key="5" className="size-4" />,
      'Sanchay provides informational budgeting insights, not investment, tax, or financial advice.'
    ]
  ]
  return (
    <Card>
      <CardHeader title="Privacy" description="How your data is handled." />
      <ul className="grid gap-2 p-5 pt-4">
        {statements.map(([icon, text]) => (
          <li
            key={text}
            className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-[13.5px]"
          >
            <span className="text-positive">{icon}</span>
            {text}
          </li>
        ))}
      </ul>
      <div className="px-5 pb-5 text-xs leading-relaxed text-ink-3">
        <p>
          No analytics, tracking or advertising SDKs are included. The app blocks all outgoing
          network requests from its window, so the interface can only load files bundled with the
          app.
        </p>
        <Disclaimer className="mt-2" />
      </div>
    </Card>
  )
}

function AiSection(): React.JSX.Element {
  const settings = useUi((st) => st.settings)!
  const mutate = useMutation()
  const [goal, setGoal] = useState(settings.goalText ?? '')
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Bot className="size-4" aria-hidden /> AI
          </span>
        }
        description="Choose where your AI runs and what it knows about your goals."
      />
      <div className="space-y-5 p-5 pt-4">
        <AiSetup />
        <div>
          <Field
            label="Your goals"
            hint="Shared with Sanchay to prioritise advice."
            htmlFor="s-goal"
          >
            <textarea
              id="s-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              maxLength={4000}
              className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              placeholder="e.g. Build a 6-month emergency fund; spend less on food delivery."
            />
          </Field>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() =>
                void mutate(
                  () => api.updateSettings({ goalText: goal.trim() || null }),
                  'Goals saved'
                )
              }
            >
              Save goals
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function AppearanceSection(): React.JSX.Element {
  const { mode, style, setMode, setStyle } = useTheme()
  return (
    <Card>
      <CardHeader
        title="Appearance"
        description="Same colours, same meaning — pick the look you like living with."
        action={
          <Segmented
            label="Theme"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' }
            ]}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-4 md:grid-cols-3">
        {(Object.keys(STYLE_META) as Style[]).map((key) => {
          const m = STYLE_META[key]
          const [side, canvas, card, accent] = m.preview
          return (
            <button
              key={key}
              onClick={() => setStyle(key)}
              aria-pressed={style === key}
              className={cn(
                'overflow-hidden rounded-xl border text-left transition-colors',
                style === key
                  ? 'border-accent ring-2 ring-accent/30'
                  : 'border-line hover:border-line-strong'
              )}
            >
              {/* A tiny picture of the app in this style. */}
              <div className="flex h-16" style={{ background: canvas }} aria-hidden>
                <div className="w-1/4" style={{ background: side }} />
                <div className="flex flex-1 flex-col justify-center gap-1.5 p-2.5">
                  <div
                    className="h-5 rounded-sm"
                    style={{ background: card, border: '1px solid rgb(0 0 0 / 0.08)' }}
                  />
                  <div className="h-2 w-10 rounded-full" style={{ background: accent }} />
                </div>
              </div>
              <div className="px-3 py-2">
                <p className="text-[13px] font-medium">{m.name}</p>
                <p className="text-[11.5px] text-ink-3">{m.note}</p>
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

export function SettingsPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings & privacy" />
      <div className="grid gap-6">
        <AppearanceSection />
        <AiSection />
        <PlanningSettings />
        <PrivacySection />
        <DataSection />
        <RulesSection />
      </div>
    </div>
  )
}
