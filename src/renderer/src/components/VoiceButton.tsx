import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

/**
 * Click to talk, click again to stop: the recording is transcribed on this Mac (Whisper) and the
 * text lands in the message box, ready to edit and send.
 */
export function VoiceButton({
  onText,
  disabled
}: {
  onText: (text: string) => void
  disabled?: boolean
}): React.JSX.Element {
  const toast = useUi((s) => s.toast)
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    if (state !== 'recording') return
    setSeconds(0)
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [state])

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), [])

  async function start(): Promise<void> {
    try {
      if (!(await api.requestMicrophone())) {
        toast(
          'Allow microphone access in System Settings → Privacy & Security → Microphone.',
          'error'
        )
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void finish(new Blob(chunks.current, { type: rec.mimeType }))
      }
      recorder.current = rec
      rec.start()
      setState('recording')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
      setState('idle')
    }
  }

  async function finish(blob: Blob): Promise<void> {
    setState('transcribing')
    try {
      const data = new Uint8Array(await blob.arrayBuffer())
      const { text } = await api.transcribeAudio({ data, mimeType: blob.type || 'audio/webm' })
      if (text) onText(text)
      else toast("Didn't catch that — try again.", 'error')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setState('idle')
    }
  }

  const label =
    state === 'recording' ? 'Stop recording' : state === 'transcribing' ? 'Transcribing' : 'Speak'
  return (
    <button
      type="button"
      disabled={disabled || state === 'transcribing'}
      onClick={() => (state === 'recording' ? recorder.current?.stop() : void start())}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors disabled:opacity-40',
        state === 'recording'
          ? 'bg-negative px-3 text-[12px] font-medium text-on-color'
          : 'w-9 text-ink-2 hover:bg-ink/[0.06] hover:text-ink'
      )}
    >
      {state === 'recording' ? (
        <>
          <span className="size-2 animate-pulse rounded-full bg-current" />
          <span className="num">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>
          <Square className="size-3 fill-current" />
        </>
      ) : state === 'transcribing' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Mic className="size-4" />
      )}
    </button>
  )
}
