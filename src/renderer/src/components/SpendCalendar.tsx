import { ArrowDownLeft, ArrowUpRight, CreditCard, Lightbulb, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { daysInMonth, formatDate, todayISO } from '@shared/dates'
import { merchantKey } from '@shared/domain/merchant'
import type { PayTip, TransactionView, TxSuggestion } from '@shared/types'
import { useMoney } from '../lib/hooks'
import { useUi } from '../lib/store'
import { cn } from '../lib/utils'
import { Amount, CategoryDot } from './finance'
import { Card } from './ui'
import { PAL } from '../lib/theme'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DayCell {
  date: string
  day: number
  spend: number
  income: number
  moneyIn: number
  moneyOut: number
  txs: TransactionView[]
}

/**
 * Month calendar of money coming in or going out (one side at a time). Transfers between your own
 * accounts are not counted. Selecting a day lists its transactions; outgoing ones carry a saving
 * tip where one exists.
 */
export function SpendCalendar({
  month,
  rows,
  onEdit,
  suggestions,
  payTips,
  mode
}: {
  payTips?: ReadonlyMap<string, PayTip>
  mode: 'in' | 'out'
  month: string
  rows: TransactionView[]
  onEdit: (tx: TransactionView) => void
  suggestions?: ReadonlyMap<string, TxSuggestion>
}): React.JSX.Element {
  const money = useMoney()
  const categories = useUi((s) => s.categories)
  const savingsCats = useMemo(
    () => new Set(categories.filter((c) => c.kind === 'savings').map((c) => c.id)),
    [categories]
  )
  const today = todayISO()
  const days = daysInMonth(month)

  const cells = useMemo(() => {
    const map = new Map<number, DayCell>()
    for (let d = 1; d <= days; d++) {
      map.set(d, {
        date: `${month}-${String(d).padStart(2, '0')}`,
        day: d,
        spend: 0,
        income: 0,
        moneyIn: 0,
        moneyOut: 0,
        txs: []
      })
    }
    for (const t of rows) {
      if (!t.transactionDate.startsWith(month)) continue
      const cell = map.get(Number(t.transactionDate.slice(8, 10)))
      if (!cell) continue
      cell.txs.push(t)
      if (!t.isTransfer) {
        if (t.amountMinor > 0) cell.moneyIn += t.amountMinor
        else cell.moneyOut -= t.amountMinor
      }
      if (t.direction === 'expense' && !savingsCats.has(t.categoryId ?? ''))
        cell.spend += -t.amountMinor
      else if (t.direction === 'income') cell.income += t.amountMinor
    }
    return map
  }, [rows, month, days, savingsCats])

  const val = (c: DayCell): number => (mode === 'in' ? c.moneyIn : c.moneyOut)
  const defaultDay = today.startsWith(month)
    ? Number(today.slice(8, 10))
    : [...cells.values()].reduce((best, c) => (val(c) > val(cells.get(best)!) ? c.day : best), 1)
  const [selected, setSelected] = useState<number>(defaultDay)
  const sel = cells.get(selected) ?? cells.get(1)!

  const all = [...cells.values()]
  const max = Math.max(1, ...all.map(val))
  const total = all.reduce((s, c) => s + val(c), 0)
  const biggest = all.reduce((a, b) => (val(b) > val(a) ? b : a), all[0]!)
  const elapsed = today.startsWith(month) ? Number(today.slice(8, 10)) : days
  const activeDays = all.filter((c) => val(c) > 0).length
  const quietDays = all.filter((c) => c.day <= elapsed && val(c) <= 0).length
  const isIn = mode === 'in'
  // Heat colour: green for money in, white for money out.
  // Income days tint cool; spending runs warm and turns hot on the heaviest days. Tints stay
  // light enough that ink text reads on every cell.
  const dark = document.documentElement.dataset['theme'] === 'dark'
  const heat = (a: number): string =>
    `color-mix(in oklab, var(--color-${isIn ? 'cool' : a > 0.62 ? 'hot' : 'warm'}-tint) ${Math.round(dark ? 14 + a * 50 : 8 + a * 34)}%, var(--color-surface))`

  // Monday-first grid with leading blanks.
  const firstWeekday = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7
  const slots: (DayCell | null)[] = [...Array(firstWeekday).fill(null), ...all]
  while (slots.length % 7) slots.push(null)
  const weeks: (DayCell | null)[][] = []
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7))

  function onKey(e: React.KeyboardEvent, day: number): void {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!delta) return
    e.preventDefault()
    const next = Math.min(days, Math.max(1, day + delta))
    setSelected(next)
    document.getElementById(`cal-${next}`)?.focus()
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
      <Card className="p-5">
        <div className="mb-4 grid grid-cols-4 gap-3">
          {(isIn
            ? [
                ['Money in', `+${money(total)}`, 'text-positive'],
                ['Days with money in', String(activeDays), ''],
                [
                  'Biggest day',
                  val(biggest) > 0
                    ? `${formatDate(biggest.date, 'short')} · ${money(val(biggest))}`
                    : '—',
                  ''
                ],
                [
                  'Credits',
                  String(
                    all.reduce(
                      (n, c) => n + c.txs.filter((t) => t.amountMinor > 0 && !t.isTransfer).length,
                      0
                    )
                  ),
                  ''
                ]
              ]
            : [
                ['Money out', money(total), 'text-expense'],
                ['Average per day', money(Math.round(total / Math.max(1, elapsed))), ''],
                [
                  'Biggest day',
                  val(biggest) > 0
                    ? `${formatDate(biggest.date, 'short')} · ${money(val(biggest))}`
                    : '—',
                  ''
                ],
                ['No-spend days', String(quietDays), '']
              ]
          ).map(([label, value, tone]) => (
            <div key={label} className="rounded-xl bg-ink/[0.03] px-3 py-2">
              <p className="text-[11px] text-ink-3">{label}</p>
              <p className={cn('num truncate text-[14px] font-semibold', tone)}>{value}</p>
            </div>
          ))}
        </div>

        <div
          className="grid grid-cols-[repeat(7,minmax(0,1fr))_76px] gap-1.5"
          role="grid"
          aria-label={isIn ? 'Money in calendar' : 'Money out calendar'}
        >
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="pb-1 text-center text-[11px] font-medium text-ink-3"
              role="columnheader"
            >
              {d}
            </div>
          ))}
          <div className="pb-1 text-right text-[11px] font-medium text-ink-3">Week</div>
          {weeks.map((week, wi) => (
            <div key={wi} className="contents" role="row">
              {week.map((cell, ci) => {
                if (!cell) return <div key={`b${ci}`} />
                const v = val(cell)
                const intensity = v > 0 ? 0.12 + 0.68 * Math.sqrt(v / max) : 0
                const isSel = cell.day === selected
                const isToday = cell.date === today
                const future = cell.date > today
                return (
                  <button
                    key={cell.day}
                    id={`cal-${cell.day}`}
                    role="gridcell"
                    aria-selected={isSel}
                    aria-label={`${formatDate(cell.date)}: ${v > 0 ? `${isIn ? 'in' : 'out'} ${money(v)}` : isIn ? 'nothing in' : 'nothing out'}`}
                    tabIndex={isSel ? 0 : -1}
                    onClick={() => setSelected(cell.day)}
                    onKeyDown={(e) => onKey(e, cell.day)}
                    className={cn(
                      'relative flex h-[68px] flex-col justify-between rounded-lg p-2 text-left transition-all',
                      isSel
                        ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface'
                        : 'hover:ring-1 hover:ring-accent/40',
                      future && 'opacity-45'
                    )}
                    style={{
                      background: v > 0 ? heat(intensity) : PAL.empty
                    }}
                  >
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full text-[11.5px] font-medium',
                        isToday ? 'bg-negative text-on-color' : 'text-ink-3'
                      )}
                    >
                      {cell.day}
                    </span>
                    {v > 0 && (
                      <span className={cn('num truncate text-[11.5px] font-semibold', 'text-ink')}>
                        {isIn ? '+' : '−'}
                        {money(v, { compact: v >= 1_000_000 })}
                      </span>
                    )}
                  </button>
                )
              })}
              <div className="num flex items-center justify-end pr-1 text-[11.5px] text-ink-3">
                {money(
                  week.reduce((s, c) => s + (c ? val(c) : 0), 0),
                  { compact: true }
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-3" aria-hidden>
          <span>Less</span>
          {[0.1, 0.25, 0.4, 0.55, 0.7].map((a) => (
            <span key={a} className="size-3 rounded" style={{ background: heat(a) }} />
          ))}
          <span>More</span>
        </div>
      </Card>

      <Card className="flex max-h-[620px] flex-col">
        <div className="border-b border-line px-5 py-4">
          <p className="text-[12px] font-medium text-ink-3">
            {new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
              new Date(`${sel.date}T00:00:00Z`)
            )}
          </p>
          <p className="text-[18px] font-semibold tracking-tight">{formatDate(sel.date)}</p>
          <p className="num mt-0.5 text-[13px] text-ink-2">
            {isIn ? (
              <span className="text-positive">+{money(sel.moneyIn)} came in</span>
            ) : (
              <>{money(sel.moneyOut)} went out</>
            )}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {sel.txs.filter((t) => (isIn ? t.amountMinor > 0 : t.amountMinor <= 0)).length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">
              {isIn ? 'Nothing came in on this day.' : 'Nothing went out on this day.'}
            </p>
          )}
          {(
            [
              ['In', isIn ? sel.txs.filter((t) => t.amountMinor > 0) : []],
              ['Out', isIn ? [] : sel.txs.filter((t) => t.amountMinor <= 0)]
            ] as const
          ).map(
            ([label, txs]) =>
              txs.length > 0 && (
                <section key={label}>
                  <p className="eyebrow flex items-center gap-1.5 px-3 pt-3 pb-1 text-[10.5px] text-ink-3">
                    {label === 'In' ? (
                      <ArrowDownLeft className="size-3 text-positive" />
                    ) : (
                      <ArrowUpRight className="size-3" />
                    )}
                    {label}
                  </p>
                  <ul className="divide-y divide-line">
                    {txs.map((t) => {
                      const key = merchantKey(t.merchantNormalised)
                      const tip = t.amountMinor < 0 ? suggestions?.get(key) : undefined
                      const pay = t.amountMinor < 0 ? payTips?.get(key) : undefined
                      const earn = pay ? Math.round(-t.amountMinor * pay.best.rate) : 0
                      return (
                        <li key={t.id} className="group px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <CategoryDot categoryId={t.categoryId} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium">
                                {t.merchantNormalised}
                              </p>
                              <p className="truncate text-[11.5px] text-ink-3">
                                {t.isTransfer
                                  ? 'Own money moving'
                                  : (categories.find((c) => c.id === t.categoryId)?.name ??
                                    'Uncategorised')}{' '}
                                · {t.accountName}
                              </p>
                            </div>
                            <Amount
                              minor={t.amountMinor}
                              colorInflow={!t.isTransfer}
                              className="text-[13px]"
                            />
                            <button
                              onClick={() => onEdit(t)}
                              className="rounded-md p-1 text-ink-3 opacity-0 hover:bg-ink/5 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                              aria-label={`Edit ${t.merchantNormalised}`}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          </div>
                          {tip && (
                            <p className="mt-1.5 ml-[18px] flex items-start gap-1.5 rounded-md bg-positive-soft px-2 py-1.5 text-[11.5px] leading-snug text-ink-2">
                              <Lightbulb className="mt-px size-3 shrink-0 text-positive" />
                              <span>
                                <span className="font-medium text-ink">{tip.title}</span>
                                {tip.alternatives.length > 0 && (
                                  <> — {tip.alternatives.slice(0, 2).join(', ')}</>
                                )}
                                <span className="num text-positive">
                                  {' '}
                                  · save {money(tip.monthlySavingMinor)}/mo
                                </span>
                              </span>
                            </p>
                          )}
                          {pay && earn >= 100 && (
                            <p className="mt-1 ml-[18px] flex items-start gap-1.5 rounded-md bg-white/[0.05] px-2 py-1.5 text-[11.5px] leading-snug text-ink-2">
                              <CreditCard className="mt-px size-3 shrink-0 text-ink" />
                              <span>
                                Pay with{' '}
                                <span className="font-medium text-ink">{pay.best.label}</span>
                                <span className="num text-positive">
                                  {' '}
                                  · earn {money(earn)} on this (
                                  {Math.round(pay.best.rate * 1000) / 10}%)
                                </span>
                              </span>
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
          )}
        </div>
      </Card>
    </div>
  )
}
