import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { monthEnd, monthStart } from '@shared/dates'
import type { AccountType, AccountWithStats } from '@shared/types'
import { useMoney, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

const GROUPS: { id: string; label: string; types: AccountType[]; color: string }[] = [
  { id: 'cards', label: 'Credit cards', types: ['credit_card'], color: 'var(--color-hot)' },
  { id: 'banks', label: 'Bank accounts', types: ['bank', 'cash'], color: '#60a5fa' }
]

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('sidebar-groups') ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/**
 * Accounts grouped like a wallet: credit cards show what was spent on them this month,
 * bank accounts show their balance (or this month's spend when no balance is known).
 */
export function SidebarAccounts(): React.JSX.Element | null {
  const money = useMoney()
  const month = useUi((s) => s.month)
  const go = useUi((s) => s.go)
  const accounts = useQuery(() => api.listAccounts())
  const txs = useQuery(
    () =>
      month
        ? api.listTransactions({ from: monthStart(month), to: monthEnd(month), limit: 20000 })
        : Promise.resolve([]),
    [month]
  )
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen)

  const spent = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of txs.data ?? [])
      if (t.amountMinor < 0 && !t.isTransfer)
        m.set(t.accountId, (m.get(t.accountId) ?? 0) - t.amountMinor)
    return m
  }, [txs.data])

  const list = accounts.data ?? []
  if (list.length === 0) return null

  const toggle = (id: string): void =>
    setOpen((o) => {
      const next = { ...o, [id]: !(o[id] ?? true) }
      try {
        localStorage.setItem('sidebar-groups', JSON.stringify(next))
      } catch {
        // not persisted — fine
      }
      return next
    })

  const amountFor = (a: AccountWithStats): { value: string; hint: string } => {
    if (a.type !== 'credit_card' && a.currentBalanceMinor != null)
      return { value: money(a.currentBalanceMinor), hint: 'Balance' }
    return { value: money(spent.get(a.id) ?? 0), hint: 'Spent this month' }
  }

  return (
    <div className="mt-5 flex flex-col gap-0.5 border-t border-white/10 pt-3">
      {GROUPS.map((g) => {
        const items = list.filter((a) => g.types.includes(a.type))
        if (items.length === 0) return null
        const isOpen = open[g.id] ?? true
        return (
          <div key={g.id}>
            <button
              onClick={() => toggle(g.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium text-white/60 hover:text-white"
            >
              <ChevronRight
                className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')}
              />
              {g.label}
            </button>
            {isOpen &&
              items.map((a) => {
                const amt = amountFor(a)
                return (
                  <button
                    key={a.id}
                    onClick={() => go('accounts')}
                    title={`${a.name} · ${amt.hint}`}
                    className="flex w-full items-center gap-2.5 rounded-md py-[6px] pl-3 pr-2.5 text-left text-[13px] text-white/85 hover:bg-white/[0.06] hover:text-white"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: g.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="num shrink-0 text-[12px] text-white/60">{amt.value}</span>
                  </button>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}
