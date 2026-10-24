import { ChevronDown, FileSpreadsheet, ReceiptText, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useUi } from '../lib/store'
import { cn } from '../lib/utils'
import { Button } from './ui'

/** "Import" button with two choices: a bank/card statement or a salary slip. */
export function ImportMenu({
  size = 'md',
  className
}: {
  size?: 'sm' | 'md'
  className?: string
}): React.JSX.Element {
  const openImport = useUi((s) => s.openImport)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  const choose = (kind: 'statement' | 'payslip'): void => {
    setOpen(false)
    openImport(null, kind)
  }

  return (
    <div ref={ref} className="no-drag relative">
      <Button
        size={size}
        className={className}
        icon={<Upload className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Import
        <ChevronDown
          className={cn('size-3.5 opacity-70 transition-transform', open && 'rotate-180')}
        />
      </Button>
      {open && (
        <div
          role="menu"
          className="material absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-xl p-1.5 shadow-2xl"
        >
          {(
            [
              {
                kind: 'statement',
                icon: <FileSpreadsheet className="size-4" />,
                title: 'Import statement',
                detail: 'Bank or credit card · PDF or CSV'
              },
              {
                kind: 'payslip',
                icon: <ReceiptText className="size-4" />,
                title: 'Import payslip',
                detail: 'Salary slip · PDF'
              }
            ] as const
          ).map((o) => (
            <button
              key={o.kind}
              role="menuitem"
              onClick={() => choose(o.kind)}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-ink hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
                {o.icon}
              </span>
              <span>
                <span className="block text-[13.5px] font-medium">{o.title}</span>
                <span className="block text-[12px] text-ink-3">{o.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
