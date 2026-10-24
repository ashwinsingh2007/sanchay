import { useCallback, useEffect, useRef, useState } from 'react'
import { formatMoney, type FormatOptions } from '@shared/money'
import { useUi } from './store'

/** Loads data and reloads whenever the global data version or deps change. */
export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const version = useUi((s) => s.version)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher()
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tick, ...deps])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

export function useCurrency(): string {
  return useUi((s) => s.settings?.primaryCurrency ?? 'INR')
}

export function useMoney(): (minor: number, opts?: FormatOptions) => string {
  const currency = useCurrency()
  return useCallback(
    (minor: number, opts?: FormatOptions) => formatMoney(minor, currency, opts),
    [currency]
  )
}

/** Runs a mutation, shows errors as toasts, and refreshes data on success. */
export function useMutation(): <T>(
  fn: () => Promise<T>,
  success?: string
) => Promise<T | undefined> {
  const { toast, bump } = useUi.getState()
  return useCallback(
    async <T>(fn: () => Promise<T>, success?: string) => {
      try {
        const result = await fn()
        bump()
        if (success) toast(success)
        return result
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error')
        return undefined
      }
    },
    [bump, toast]
  )
}

/**
 * Eases a number towards `target` over ~500ms whenever it changes (hero figures only).
 * Jumps straight there when the user prefers reduced motion.
 */
export function useCountUp(target: number, durationMs = 500): number {
  const [value, setValue] = useState(target)
  const from = useRef(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setValue(target)
      from.current = target
      return
    }
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs)
      // cubic-bezier(.2,.8,.2,1)-like ease-out
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(begin + (target - begin) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = target
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      from.current = target
    }
  }, [target, durationMs])
  return value
}
