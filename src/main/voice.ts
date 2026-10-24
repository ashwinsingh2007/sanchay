import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { systemPreferences } from 'electron'
import type { Db } from './db/client'
import { getSecret } from './ai/secrets'

/**
 * Speech to text for the chat's mic button. Prefers Whisper running on this Mac (openai-whisper
 * or whisper.cpp); falls back to OpenAI's transcription API only when an OpenAI key is saved.
 */
const run = promisify(execFile)
const WHISPER = ['/opt/homebrew/bin/whisper', '/usr/local/bin/whisper']
const WHISPER_CPP = ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli']
/** whisper.cpp needs a ggml model file; look in the usual places. */
const GGML_MODELS = [
  join(process.env['HOME'] ?? '', '.cache/whisper/ggml-base.bin'),
  '/opt/homebrew/share/whisper-cpp/ggml-base.bin'
]

export async function requestMicrophone(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true
  return systemPreferences.askForMediaAccess('microphone')
}

export async function transcribe(
  db: Db,
  audio: Uint8Array,
  mimeType: string
): Promise<{ text: string; engine: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'cfo-voice-'))
  const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
  const file = join(dir, `speech.${ext}`)
  try {
    await writeFile(file, audio)

    const whisper = WHISPER.find((p) => existsSync(p))
    if (whisper) {
      await run(
        whisper,
        [
          file,
          '--model',
          'base',
          '--output_format',
          'txt',
          '--output_dir',
          dir,
          '--fp16',
          'False',
          '--task',
          'transcribe'
        ],
        {
          timeout: 120_000,
          env: {
            ...process.env,
            PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env['PATH'] ?? ''}`
          }
        }
      )
      const text = await readFile(join(dir, 'speech.txt'), 'utf8')
      return { text: text.trim(), engine: 'Whisper on this Mac' }
    }

    const cpp = WHISPER_CPP.find((p) => existsSync(p))
    const model = GGML_MODELS.find((p) => existsSync(p))
    if (cpp && model) {
      // whisper.cpp reads 16 kHz WAV, so convert first.
      const wav = join(dir, 'speech.wav')
      await run('/opt/homebrew/bin/ffmpeg', ['-y', '-i', file, '-ar', '16000', '-ac', '1', wav], {
        timeout: 60_000
      })
      const { stdout } = await run(cpp, ['-m', model, '-f', wav, '-nt', '-np'], {
        timeout: 120_000
      })
      return { text: stdout.trim(), engine: 'Whisper on this Mac' }
    }

    const key = getSecret(db, 'openai_api_key')
    if (key) {
      const form = new FormData()
      form.append('model', 'gpt-4o-mini-transcribe')
      form.append('file', new Blob([audio], { type: mimeType }), `speech.${ext}`)
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(60_000)
      })
      if (!res.ok) throw new Error(`OpenAI transcription error ${res.status}`)
      const json = (await res.json()) as { text?: string }
      return { text: (json.text ?? '').trim(), engine: 'OpenAI' }
    }

    throw new Error(
      'No speech-to-text found. Install Whisper (brew install openai-whisper), or press Fn twice to use macOS Dictation.'
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
