import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react'
import { cn } from '../lib/utils'

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'gloss-btn',
  secondary:
    'bg-raised/70 text-ink border border-line-strong/80 hover:bg-raised shadow-[0_1px_2px_rgba(16,24,40,0.06)]',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger:
    'bg-negative text-on-color hover:bg-negative/90 shadow-[3px_3px_0_0_var(--color-hot-edge)]',
  link: 'text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink px-0 h-auto'
}
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        buttonSizes[size],
        buttonVariants[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

// ---------- Card ----------

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('material rounded-xl', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------- Badge ----------

type Tone = 'neutral' | 'positive' | 'attention' | 'negative' | 'outline'
const badgeTones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  positive: 'bg-positive-soft text-positive',
  attention: 'bg-attention-soft text-attention',
  negative: 'bg-negative-soft text-negative',
  outline: 'border border-line-strong text-ink-2'
}

export function Badge({
  tone = 'neutral',
  className,
  children
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap',
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

// ---------- Form controls ----------

const controlBase =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-sunken disabled:text-ink-3'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { prefix?: string }
>(function Input({ className, prefix, ...props }, ref) {
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-3">
          {prefix}
        </span>
        <input ref={ref} className={cn(controlBase, 'h-9 pl-8', className)} {...props} />
      </div>
    )
  }
  return <input ref={ref} className={cn(controlBase, 'h-9', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          controlBase,
          'h-9 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23868b92%22%20stroke-width%3D%222.5%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E")] bg-[position:right_10px_center] bg-no-repeat pr-8',
          className
        )}
        {...props}
      >
        {children}
      </select>
    )
  }
)

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  htmlFor?: string
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-negative">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

// ---------- Dialog ----------

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgb(20_18_17/0.42)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'animate-fade-up fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-surface shadow-2xl focus:outline-none',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-2">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === 'string' ? title : 'Dialog'}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ---------- Misc ----------

export function Spinner({ label = 'Loading' }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-3" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  )
}

export function ErrorState({
  message,
  onRetry
}: {
  message: string
  onRetry?: () => void
}): React.JSX.Element {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm font-medium text-negative">Something went wrong</p>
      <p className="max-w-md text-[13px] text-ink-2">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon: ReactNode
  title: string
  description: ReactNode
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-sunken text-ink-2">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-2">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Progress({
  value,
  tone = 'positive',
  label
}: {
  value: number
  tone?: 'positive' | 'attention' | 'ink'
  label: string
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, value))
  const color =
    tone === 'positive' ? 'bg-positive' : tone === 'attention' ? 'bg-attention' : 'bg-ink'
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-sunken"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium eyebrow text-ink-3">{eyebrow}</p>}
        <h1 className="font-[family-name:var(--font-display)] text-[26px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Disclaimer({ className }: { className?: string }): React.JSX.Element {
  return (
    <p className={cn('text-[11.5px] leading-relaxed text-ink-3', className)}>
      Sanchay provides budgeting and informational insights based on your data. It is not
      investment, tax, or financial advice.
    </p>
  )
}

// ---------- Segmented control (macOS style) ----------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
  className?: string
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-md bg-ink/[0.06] p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-[12.5px] font-medium transition-all',
            value === o.value
              ? 'bg-raised text-ink shadow-[0_1px_2px_rgba(16,24,40,0.12),0_0_0_0.5px_rgba(16,24,40,0.06)]'
              : 'text-ink-2 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
