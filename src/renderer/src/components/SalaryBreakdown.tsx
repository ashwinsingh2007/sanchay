import { BadgeIndianRupee, CheckCircle2, ReceiptText } from 'lucide-react'
import { monthLabel } from '@shared/dates'
import { Badge, Button, Card } from './ui'
import { useMoney, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

const SEGMENTS = [
  { key: 'net', label: 'Take-home', color: 'var(--color-cool)' },
  { key: 'tax', label: 'Income tax', color: 'var(--color-hot)' },
  { key: 'retirement', label: 'PF / NPS', color: 'var(--color-cold)' },
  { key: 'other', label: 'Other deductions', color: 'var(--color-ink-3)' }
] as const

/**
 * Where the salary goes before it reaches the bank: gross → tax, PF/NPS, other deductions → take-home.
 * Built from the latest uploaded payslip; shows an import prompt when there is none.
 */
export function SalaryBreakdown({
  compact = false
}: {
  compact?: boolean
}): React.JSX.Element | null {
  const money = useMoney()
  const openImport = useUi((s) => s.openImport)
  const { data: p, loading } = useQuery(() => api.getSalaryProfile())
  if (loading && !p) return null

  if (!p) {
    return (
      <Card className="flex items-center gap-4 px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-ink-2 ring-1 ring-white/10">
          <BadgeIndianRupee className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">See where your salary goes</p>
          <p className="text-[12.5px] text-ink-3">
            Import a payslip to show gross pay, tax, PF and take-home here.
          </p>
        </div>
        <Button
          size="sm"
          icon={<ReceiptText className="size-3.5" />}
          onClick={() => openImport(null, 'payslip')}
        >
          Import payslip
        </Button>
      </Card>
    )
  }

  const other = Math.max(
    0,
    p.grossMonthlyMinor - p.netMonthlyMinor - p.taxMonthlyMinor - p.retirementMonthlyMinor
  )
  const values: Record<(typeof SEGMENTS)[number]['key'], number> = {
    net: p.netMonthlyMinor,
    tax: p.taxMonthlyMinor,
    retirement: p.retirementMonthlyMinor,
    other
  }
  const parts = SEGMENTS.filter((s) => values[s.key] > 0)

  return (
    <Card className={cn('p-5', compact && 'py-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">Salary</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            {p.latestPeriod ? `${monthLabel(p.latestPeriod)} payslip` : 'Latest payslip'}
            {p.employer ? ` · ${p.employer}` : ''}
          </p>
        </div>
        <div className="flex items-start gap-6 text-right">
          <div>
            <p className="text-[11.5px] text-ink-3">Gross / month</p>
            <p className="num text-[17px] font-semibold">{money(p.grossMonthlyMinor)}</p>
          </div>
          <div>
            <p className="text-[11.5px] text-ink-3">Take-home / month</p>
            <p className="num text-[17px] font-semibold text-positive">
              {money(p.netMonthlyMinor)}
            </p>
          </div>
          {!compact && (
            <div>
              <p className="text-[11.5px] text-ink-3">Per year (gross)</p>
              <p className="num text-[17px] font-semibold">{money(p.annualGrossMinor)}</p>
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label="Salary split"
      >
        {parts.map((s) => (
          <div
            key={s.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            title={`${s.label} ${money(values[s.key])}`}
            style={{
              width: `${(values[s.key] / p.grossMonthlyMinor) * 100}%`,
              background: s.color
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
        {parts.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-ink-2">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="num font-medium text-ink">{money(values[s.key])}</span>
            <span className="num text-ink-3">
              {Math.round((values[s.key] / p.grossMonthlyMinor) * 100)}%
            </span>
          </span>
        ))}
        <span className="ml-auto">
          {p.creditMatches ? (
            <Badge tone="positive">
              <CheckCircle2 className="size-3" /> Credited to your bank
            </Badge>
          ) : (
            <Badge tone="attention">Salary credit not found in statements</Badge>
          )}
        </span>
      </div>
      {!compact && p.financialYear && (
        <p className="mt-3 text-[12px] text-ink-3">
          {p.financialYear} so far ({p.payslipsInFy} payslip{p.payslipsInFy === 1 ? '' : 's'}):
          gross {money(p.fyGrossMinor)} · tax {money(p.fyTaxMinor)} · PF/NPS{' '}
          {money(p.fyRetirementMinor)}
        </p>
      )}
    </Card>
  )
}
