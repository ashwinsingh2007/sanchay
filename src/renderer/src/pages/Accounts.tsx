import { CreditCard, Landmark, Plus, Upload, Wallet } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@shared/dates'
import { minorToInputValue, parseAmount, currencyInfo } from '@shared/money'
import type { AccountType, AccountWithStats } from '@shared/types'
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
import { ClearDataButton } from '../components/ClearDataButton'
import { SalaryCard } from '../components/SalaryCard'
import { ImportMenu } from '../components/ImportMenu'
import { api } from '../lib/utils'

const TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank account',
  credit_card: 'Credit card',
  cash: 'Cash',
  investment_placeholder: 'Investments (tracking only)'
}

function parseSigned(raw: string, currency: string): number | null | 'invalid' {
  if (!raw.trim()) return null
  const parsed = parseAmount(raw, currencyInfo(currency).decimals)
  return parsed ? parsed.minor : 'invalid'
}

function AccountDialog({
  account,
  onClose
}: {
  account: AccountWithStats | null
  onClose: () => void
}): React.JSX.Element {
  const currency = useCurrency()
  const mutate = useMutation()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [balance, setBalance] = useState(
    account?.currentBalanceMinor != null
      ? minorToInputValue(account.currentBalanceMinor, account.currency)
      : ''
  )
  const [err, setErr] = useState<string | null>(null)

  async function save(): Promise<void> {
    const parsed = parseSigned(balance, account?.currency ?? currency)
    if (parsed === 'invalid') return setErr('Enter the balance as a number, e.g. 125000.50')
    if (!name.trim()) return setErr('Give the account a name.')
    const ok = await mutate(
      () =>
        account
          ? api.updateAccount({
              id: account.id,
              name: name.trim(),
              type,
              currentBalanceMinor: parsed
            })
          : api.createAccount({ name: name.trim(), type, currentBalanceMinor: parsed }),
      'Account saved'
    )
    if (ok) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={account ? 'Edit account' : 'Add account'}
      description="Balances are entered by you and stay on this Mac."
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
      <div className="grid gap-4">
        <Field label="Name" htmlFor="ac-n">
          <Input
            id="ac-n"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Salary account"
          />
        </Field>
        <Field label="Type" htmlFor="ac-t">
          <Select id="ac-t" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Current balance"
          hint={
            type === 'credit_card'
              ? 'Optional. Credit-card balances are not counted as available cash.'
              : 'What your banking app shows right now. Used for safe-to-spend. Leave blank if unknown.'
          }
          htmlFor="ac-b"
        >
          <Input
            id="ac-b"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="e.g. 125000"
          />
        </Field>
        {err && <p className="text-[13px] text-negative">{err}</p>}
      </div>
    </Dialog>
  )
}

export function AccountsPage(): React.JSX.Element {
  const money = useMoney()
  const openImport = useUi((s) => s.openImport)
  const { data, error, loading, reload } = useQuery(() => api.listAccounts())
  const [editing, setEditing] = useState<AccountWithStats | 'new' | null>(null)

  const cash = (data ?? []).filter(
    (a) => (a.type === 'bank' || a.type === 'cash') && a.currentBalanceMinor != null
  )
  const cashTotal = cash.reduce((s, a) => s + (a.currentBalanceMinor ?? 0), 0)

  return (
    <div>
      <PageHeader
        eyebrow="Accounts"
        title="Accounts & balances"
        description="Keep balances current for an accurate safe-to-spend estimate. Sanchay never connects to your bank."
        actions={
          <>
            <ClearDataButton />
            <ImportMenu />
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setEditing('new')}
            >
              Add account
            </Button>
          </>
        }
      />
      <SalaryCard />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data && loading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark className="size-5" />}
            title="No accounts yet"
            description="Accounts are created when you import a statement. You can also add one manually to track a cash balance."
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
        </Card>
      ) : (
        <>
          <Card className="mb-4 flex items-center justify-between p-5">
            <div>
              <p className="text-[13px] font-medium text-ink-2">
                Available cash (bank + cash accounts)
              </p>
              <p className="num mt-1 text-[26px] font-semibold tracking-tight">
                {cash.length ? money(cashTotal) : '—'}
              </p>
            </div>
            <p className="max-w-sm text-right text-xs text-ink-3">
              {cash.length
                ? `From ${cash.length} account${cash.length === 1 ? '' : 's'} with a balance set.`
                : 'Add a current balance to at least one bank account to unlock safe-to-spend.'}
            </p>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            {data.map((a) => (
              <Card key={a.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-sunken text-ink-2">
                      {a.type === 'credit_card' ? (
                        <CreditCard className="size-4" />
                      ) : a.type === 'cash' ? (
                        <Wallet className="size-4" />
                      ) : (
                        <Landmark className="size-4" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{a.name}</p>
                      {/^[\d\s-]+$/.test(a.name) && (
                        <button
                          onClick={() => setEditing(a)}
                          className="text-[11.5px] text-accent-ink hover:underline"
                        >
                          Give it a real name (e.g. “HDFC savings”)
                        </button>
                      )}
                      <p className="text-xs text-ink-3">
                        {TYPE_LABEL[a.type]} · {a.currency}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setEditing(a)}>
                    {a.currentBalanceMinor == null && a.type !== 'credit_card'
                      ? 'Add balance'
                      : 'Edit'}
                  </Button>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-ink-3">Current balance</p>
                    <p className="num text-lg font-semibold">
                      {a.currentBalanceMinor != null ? money(a.currentBalanceMinor) : '—'}
                    </p>
                    {a.balanceAsOf && (
                      <p className="text-[11.5px] text-ink-3">
                        {a.balanceSource === 'statement' ? 'From statement' : 'Entered by you'} · as
                        of {formatDate(a.balanceAsOf)}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-ink-3">
                    <Badge tone="neutral">{a.transactionCount} transactions</Badge>
                    {a.firstDate && a.lastDate && (
                      <p className="mt-1">
                        {formatDate(a.firstDate, 'short')} – {formatDate(a.lastDate)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      {editing && (
        <AccountDialog
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
