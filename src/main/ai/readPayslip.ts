import type { Payslip } from '../../shared/types'
import type { Db } from '../db/client'
import { getSettings } from '../repository'
import { streamChat } from './providers'
import { getAiStatus } from './service'

const PROMPT = `You read Indian salary slips. Reply with ONLY a JSON object, amounts in rupees as plain numbers:
{"period":"YYYY-MM" or null,"employer":string or null,"gross":number,"net":number,"basic":number|null,"hra":number|null,
 "pf":number|null,"vpf":number|null,"nps":number|null,"tax":number|null,"professionalTax":number|null}
"gross" = total earnings for the month, "net" = take-home pay. Use null when a value isn't on the slip.`

const rupees = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e8 ? Math.round(v * 100) : null

/**
 * Fallback when the rules can't read a slip: the on-device model extracts the key numbers.
 * Local models only — salary details never go to a cloud model for this.
 */
export async function aiReadPayslip(
  db: Db,
  lines: readonly string[],
  fileHash: string,
  filename: string
): Promise<Omit<Payslip, 'id' | 'createdAt'> | null> {
  const status = await getAiStatus(db)
  if (!status.ready || status.provider !== 'ollama' || !status.model) return null
  let text = ''
  try {
    await streamChat('ollama', {
      system: PROMPT,
      messages: [{ role: 'user', content: lines.slice(0, 80).join('\n').slice(0, 5000) }],
      model: status.model,
      baseUrl: getSettings(db).ollamaUrl,
      signal: AbortSignal.timeout(60_000),
      onText: (t) => (text += t)
    })
  } catch {
    return null
  }
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (!json) return null
  let a: Record<string, unknown>
  try {
    a = JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
  const gross = rupees(a['gross'])
  const net = rupees(a['net'])
  if (!gross || !net || net > gross) return null
  const period =
    typeof a['period'] === 'string' && /^\d{4}-\d{2}$/.test(a['period']) ? a['period'] : null
  return {
    period,
    employer: typeof a['employer'] === 'string' ? a['employer'].slice(0, 120) : null,
    grossMinor: gross,
    netMinor: net,
    deductionsMinor: gross - net,
    basicMinor: rupees(a['basic']),
    hraMinor: rupees(a['hra']),
    pfMinor: rupees(a['pf']),
    vpfMinor: rupees(a['vpf']),
    npsMinor: rupees(a['nps']),
    taxMinor: rupees(a['tax']),
    professionalTaxMinor: rupees(a['professionalTax']),
    earnings: [],
    deductions: [],
    fileHash,
    filename
  }
}
