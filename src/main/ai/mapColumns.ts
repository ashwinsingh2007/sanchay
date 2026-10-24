import { balanceAgreement } from '../../shared/domain/autoMap'
import { normaliseRows, validateMapping } from '../../shared/domain/csvNormalise'
import type { ColumnMapping } from '../../shared/types'
import type { Db } from '../db/client'
import { getSettings } from '../repository'
import { getAiStatus } from './service'
import { streamChat } from './providers'

const PROMPT = `You map bank or credit-card CSV statements to columns. Reply with ONLY a JSON object, no prose:
{"headerRow": <0-based row index of the column names>, "date": <col>, "description": <col>,
 "amount": <col or null>, "debit": <col or null>, "credit": <col or null>, "balance": <col or null>,
 "positiveMeans": "inflow" | "outflow", "dateOrder": "dmy" | "mdy" | "ymd"}
Use either "amount" (one signed column) or "debit"/"credit" (separate columns). Column indexes are 0-based.
"positiveMeans" is "outflow" when positive numbers are purchases (typical for card exports).`

/**
 * Last-resort column mapping by the on-device model when the heuristics aren't confident.
 * Only runs with a local provider: statement rows never go to a cloud model for this.
 * The model's answer is only accepted if it actually parses the file (and fits the balance).
 */
export async function aiMapColumns(
  db: Db,
  rows: readonly string[][],
  decimals: number
): Promise<ColumnMapping | null> {
  const status = await getAiStatus(db)
  if (!status.ready || status.provider !== 'ollama' || !status.model) return null
  const settings = getSettings(db)
  const sample = rows
    .slice(0, 14)
    .map((r, i) => `${i}: ${JSON.stringify(r.slice(0, 12))}`)
    .join('\n')

  let text = ''
  try {
    await streamChat('ollama', {
      system: PROMPT,
      messages: [{ role: 'user', content: `First rows of the CSV (index: cells):\n${sample}` }],
      model: status.model,
      baseUrl: settings.ollamaUrl,
      signal: AbortSignal.timeout(45_000),
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
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
  const amount = num(a['amount'])
  const mapping: ColumnMapping = {
    headerRow: num(a['headerRow']) ?? 0,
    dateColumn: num(a['date']) ?? -1,
    descriptionColumn: num(a['description']) ?? -1,
    amountMode: amount != null ? 'signed' : 'debit_credit',
    amountColumn: amount,
    positiveMeans: a['positiveMeans'] === 'outflow' ? 'outflow' : 'inflow',
    debitColumn: num(a['debit']),
    creditColumn: num(a['credit']),
    balanceColumn: num(a['balance']),
    dateOrder: a['dateOrder'] === 'mdy' ? 'mdy' : a['dateOrder'] === 'ymd' ? 'ymd' : 'dmy'
  }
  if (validateMapping(mapping).length) return null
  const result = normaliseRows(rows, mapping, decimals)
  const dataRows = rows.length - mapping.headerRow - 1 - result.blankCount
  if (dataRows <= 0 || result.rows.length / dataRows < 0.9) return null
  const balance = balanceAgreement(result.rows)
  if (balance != null && balance < 0.7) return null
  return mapping
}
