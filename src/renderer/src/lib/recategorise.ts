import { useUi } from './store'
import { api } from './utils'

let inFlight: Promise<void> | null = null

/**
 * Re-files transactions with the latest rules, then lets the AI CFO categorise the rest.
 * Safe to call repeatedly; runs once at a time and refreshes every page when done.
 */
export function recategorise(opts: { quiet?: boolean } = {}): Promise<void> {
  inFlight ??= api
    .recategorise()
    .then((r) => {
      const changed = r.reapplied + r.updated
      if (changed > 0) useUi.getState().bump()
      if (opts.quiet && r.updated === 0) return
      useUi
        .getState()
        .toast(
          r.updated > 0
            ? `Your AI CFO re-categorised ${r.updated} transaction${r.updated === 1 ? '' : 's'} across ${r.asked} merchant${r.asked === 1 ? '' : 's'}.`
            : changed > 0
              ? `Re-categorised ${changed} transaction${changed === 1 ? '' : 's'}.`
              : r.aiUsed
                ? 'Everything already looks correctly categorised.'
                : 'Categories are up to date. Set up your AI CFO to sort the unclear ones too.'
        )
    })
    .catch((e: unknown) => {
      if (!opts.quiet) useUi.getState().toast(e instanceof Error ? e.message : String(e), 'error')
    })
    .finally(() => (inFlight = null))
  return inFlight
}
