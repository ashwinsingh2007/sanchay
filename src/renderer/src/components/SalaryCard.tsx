import { BadgeIndianRupee, CheckCircle2, Trash2, Upload } from 'lucide-react'
import { monthLabel } from '@shared/dates'
import { Badge, Button, Card, CardHeader } from './ui'
import { useMoney, useMutation, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'

/** Salary from uploaded payslips: structure, tax and PF, and whether it matches the bank credit. */
export function SalaryCard(): React.JSX.Element {
  const money = useMoney()
  const mutate = useMutation()
  const openImport = useUi((s) => s.openImport)
  const slips = useQuery(() => api.listPayslips())
  const profile = useQuery(() => api.getSalaryProfile())
  const p = profile.data
  const list = slips.data ?? []

  return (
    <Card className="mb-6">
      <CardHeader
        title="Salary"
        description="Upload salary slips so Sanchay knows your pay, tax and PF — read on this Mac only."
        action={
          <Button
            size="sm"
            icon={<Upload className="size-3.5" />}
            onClick={() => openImport(null, 'payslip')}
          >
            Import payslip
          </Button>
        }
      />
      {!p ? (
        <div className="flex items-center gap-3 px-5 pb-5 pt-4 text-[13px] text-ink-2">
          <BadgeIndianRupee className="size-5 text-ink-3" />
          No payslips yet. Use Import → Import payslip to add your salary slip PDF.
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(
              [
                ['Gross / month', money(p.grossMonthlyMinor)],
                ['Take-home / month', money(p.netMonthlyMinor)],
                ['Income tax / month', money(p.taxMonthlyMinor)],
                ['PF + NPS / month', money(p.retirementMonthlyMinor)]
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-ink/[0.03] px-3 py-2">
                <p className="text-[11px] text-ink-3">{label}</p>
                <p className="num text-[15px] font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            {p.employer && <span>{p.employer}</span>}
            <Badge tone="neutral">Take-home {p.takeHomePct}% of gross</Badge>
            {p.financialYear && (
              <Badge tone="neutral">
                {p.financialYear}: tax {money(p.fyTaxMinor)} · PF/NPS {money(p.fyRetirementMinor)} (
                {p.payslipsInFy} slip{p.payslipsInFy === 1 ? '' : 's'})
              </Badge>
            )}
            {p.creditMatches ? (
              <Badge tone="positive">
                <CheckCircle2 className="size-3" /> Matches the salary credit in your bank
              </Badge>
            ) : (
              <Badge tone="attention">No matching salary credit found in your statements yet</Badge>
            )}
          </div>
          <ul className="mt-4 divide-y divide-line rounded-lg bg-sunken/60">
            {list.map((s) => (
              <li key={s.id} className="group flex items-center gap-3 px-3 py-2 text-[12.5px]">
                <span className="w-[110px] shrink-0 font-medium">
                  {s.period ? monthLabel(s.period) : 'Unknown month'}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-3">{s.filename}</span>
                <span className="num text-ink-2">Gross {money(s.grossMinor)}</span>
                <span className="num w-[130px] text-right font-medium">
                  Net {money(s.netMinor)}
                </span>
                <button
                  className="rounded-md p-1 text-ink-3 opacity-0 hover:text-negative group-hover:opacity-100 focus:opacity-100"
                  aria-label="Remove salary slip"
                  onClick={() =>
                    void mutate(() => api.deletePayslip(s.id), 'Salary slip removed').then(() => {
                      slips.reload()
                      profile.reload()
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
