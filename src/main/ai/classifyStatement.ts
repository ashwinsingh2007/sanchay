import type { Db } from '../db/client'
import { getSettings } from '../repository'
import { streamChat } from './providers'
import { getAiStatus } from './service'

/**
 * Second opinion from the on-device model for borderline files ("is this a bank statement?").
 * Local models only — file contents never go to a cloud provider for this check.
 */
export async function aiConfirmStatement(
  db: Db,
  rows: readonly string[][]
): Promise<{ isStatement: boolean; reason: string } | null> {
  const status = await getAiStatus(db)
  if (!status.ready || status.provider !== 'ollama' || !status.model) return null
  const sample = rows
    .slice(0, 30)
    .map((r) => r.filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n')
    .slice(0, 3500)
  let text = ''
  try {
    await streamChat('ollama', {
      system:
        'You check whether a document is a bank account or credit-card statement that lists dated transactions with amounts. Reply on one line: "YES: <short reason>" or "NO: <short reason>".',
      messages: [{ role: 'user', content: sample }],
      model: status.model,
      baseUrl: getSettings(db).ollamaUrl,
      signal: AbortSignal.timeout(30_000),
      onText: (t) => (text += t)
    })
  } catch {
    return null
  }
  const m = /\b(YES|NO)\b\s*[:-]?\s*(.*)/i.exec(text)
  if (!m) return null
  const yes = m[1]!.toUpperCase() === 'YES'
  return {
    isStatement: yes,
    reason: yes
      ? 'Your AI CFO confirmed this is a statement.'
      : `Your AI CFO says this isn’t a statement: ${m[2]!.trim().slice(0, 160)}`
  }
}
