import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useUi } from '../lib/store'
import { api } from '../lib/utils'
import { Button, Dialog } from './ui'

/** "Start fresh": wipe imported statements and everything derived from them, keep settings. */
export function ClearDataButton({ size = 'md' }: { size?: 'sm' | 'md' }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { toast, bump, openImport, setMonth, go } = useUi()

  async function clear(): Promise<void> {
    setBusy(true)
    try {
      await api.clearImportedData('CLEAR')
      setOpen(false)
      setMonth('')
      go('home')
      bump()
      toast('All imported data cleared. Import your statements fresh.')
      openImport()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size={size} icon={<RotateCcw className="size-3.5" />} onClick={() => setOpen(true)}>
        Clear & re-import
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Clear all imported data?"
        description="Start fresh with a clean import."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void clear()}>
              Clear and import again
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px]">
          <div>
            <p className="font-medium">Removed</p>
            <p className="text-ink-2">
              All statements, transactions, accounts and balances, recurring commitments, steps,
              offers and the weekly briefing.
            </p>
          </div>
          <div>
            <p className="font-medium">Kept</p>
            <p className="text-ink-2">
              Your AI setup, goals, financial-independence numbers, settings and merchant rules.
            </p>
          </div>
          <p className="text-xs text-ink-3">
            This can’t be undone. Export your data in Settings first if you want a copy.
          </p>
        </div>
      </Dialog>
    </>
  )
}
