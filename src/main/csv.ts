import { createHash } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import { detectHeaderRow } from '../shared/domain/csvNormalise'
import type { ParsedCsv } from '../shared/types'

export const MAX_CSV_BYTES = 20 * 1024 * 1024
const MAX_ROWS = 200_000
const MAX_COLUMNS = 200

/** Picks the delimiter that splits the first lines most consistently. */
function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 20)
  let best = ','
  let bestScore = -1
  for (const delim of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => l.split(delim).length - 1)
    const max = Math.max(0, ...counts)
    const consistent = counts.filter((c) => c === max).length
    const score = max > 0 ? consistent * 10 + max : 0
    if (score > bestScore) {
      best = delim
      bestScore = score
    }
  }
  return best
}

/** Parses CSV text locally. Never leaves the machine. */
export function parseCsvText(filename: string, text: string): ParsedCsv {
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES)
    throw new Error('This file is larger than 20 MB.')
  const clean = text.replace(/^\uFEFF/, '')
  let rows: string[][]
  try {
    rows = parse(clean, {
      delimiter: detectDelimiter(clean),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true
    }) as string[][]
  } catch (err) {
    throw new Error(
      `Could not read this CSV: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    )
  }
  if (rows.length === 0) throw new Error('This file is empty.')
  if (rows.length > MAX_ROWS)
    throw new Error(`This file has more than ${MAX_ROWS.toLocaleString()} rows.`)
  rows = rows.map((r) => r.slice(0, MAX_COLUMNS).map((c) => String(c ?? '').slice(0, 2000)))

  return {
    filename,
    fileHash: createHash('sha256').update(clean).digest('hex'),
    rows,
    suggestedHeaderRow: detectHeaderRow(rows)
  }
}
