/**
 * Rebuilds a transaction table from positioned PDF text. PDFs have no cells, only text runs at
 * x/y positions, and blank cells (e.g. an empty "Withdrawal" on a deposit row) simply vanish —
 * so values are assigned to columns by their x position under the header, not by order.
 */

export interface PdfTextItem {
  str: string
  /** Left edge, PDF units. */
  x: number
  /** Baseline, PDF units (grows upward). */
  y: number
  width: number
  /** Font size / line height. */
  height: number
}

interface Chunk {
  text: string
  x0: number
  x1: number
}

interface Line {
  page: number
  y: number
  height: number
  chunks: Chunk[]
  text: string
}

const HEADER_WORDS = [
  'date',
  'narration',
  'description',
  'particulars',
  'details',
  'remarks',
  'transaction',
  'debit',
  'credit',
  'withdrawal',
  'deposit',
  'amount',
  'balance',
  'chq',
  'cheque',
  'ref'
]
const AMOUNT_HEADER = /debit|credit|withdrawal|deposit|amount|balance|dr|cr/i
const DATE_LIKE =
  /^(\d{1,2}[/\-. ](\d{1,2}|[a-z]{3,9})[/\-. ]\d{2,4}|\d{4}-\d{2}-\d{2}|[a-z]{3} \d{1,2},? \d{4})/i
const AMOUNT_LIKE = /^[-(]?[₹$€£]?\s?\d{1,3}(,\d{2,3})*(\.\d{1,2})?\)?(\s?(cr|dr))?$/i

function toLines(page: number, items: PdfTextItem[]): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; height: number; items: PdfTextItem[] }[] = []
  for (const item of sorted) {
    const line = lines.find(
      (l) => Math.abs(l.y - item.y) <= Math.max(2, Math.min(l.height, item.height) * 0.45)
    )
    if (line) line.items.push(item)
    else lines.push({ y: item.y, height: item.height || 10, items: [item] })
  }
  return lines.map((l) => {
    const its = l.items.sort((a, b) => a.x - b.x)
    const chunks: Chunk[] = []
    for (const it of its) {
      const last = chunks[chunks.length - 1]
      const gap = last ? it.x - last.x1 : Infinity
      // Words in the same cell are separated by roughly a space; columns by much more.
      if (last && gap < Math.max(3, l.height * 0.6)) {
        last.text +=
          (gap > 0.5 && !last.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str
        last.x1 = Math.max(last.x1, it.x + it.width)
      } else {
        chunks.push({ text: it.str, x0: it.x, x1: it.x + it.width })
      }
    }
    chunks.forEach((c) => (c.text = c.text.replace(/\s+/g, ' ').trim()))
    return {
      page,
      y: l.y,
      height: l.height,
      chunks: chunks.filter((c) => c.text),
      text: chunks.map((c) => c.text).join(' ')
    }
  })
}

function headerScore(line: Line): number {
  const words = line.chunks.map((c) => c.text.toLowerCase())
  return words.filter((w) => HEADER_WORDS.some((h) => w.includes(h))).length
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

/** Converts positioned text from all pages into CSV-like rows: [preamble..., header, ...data]. */
export function pdfItemsToRows(pages: PdfTextItem[][]): string[][] {
  const lines = pages.flatMap((items, p) => toLines(p, items))
  const headerIdx = lines.findIndex((l) => headerScore(l) >= 3 && l.chunks.length >= 3)
  if (headerIdx < 0) return lines.map((l) => l.chunks.map((c) => c.text))

  const header = lines[headerIdx]!
  const columns = header.chunks.map((c) => ({ ...c }))
  // Headers often wrap ("Withdrawal" / "Amt."): fold the next line(s) into the header cells.
  let headerEnd = headerIdx
  const headerKeys = [header.text.toLowerCase()]
  for (let i = headerIdx + 1; i < lines.length && i <= headerIdx + 2; i++) {
    const l = lines[i]!
    const close =
      l.page === header.page && lines[i - 1]!.y - l.y <= Math.max(l.height, header.height) * 1.9
    const looksLikeData = l.chunks.some((c) => DATE_LIKE.test(c.text) || AMOUNT_LIKE.test(c.text))
    if (!close || looksLikeData || l.chunks.length > columns.length) break
    for (const chunk of l.chunks) {
      let best = 0
      let bestDist = Infinity
      columns.forEach((col, ci) => {
        const d = Math.abs((chunk.x0 + chunk.x1) / 2 - (col.x0 + col.x1) / 2)
        if (d < bestDist) {
          best = ci
          bestDist = d
        }
      })
      columns[best]!.text = `${columns[best]!.text} ${chunk.text}`
      columns[best]!.x0 = Math.min(columns[best]!.x0, chunk.x0)
      columns[best]!.x1 = Math.max(columns[best]!.x1, chunk.x1)
    }
    headerKeys.push(l.text.toLowerCase())
    headerEnd = i
  }
  // Columns extend halfway to their neighbours so ragged values still land in the right one.
  const bounds = columns.map((c, i) => ({
    lo: i === 0 ? -Infinity : (columns[i - 1]!.x1 + c.x0) / 2,
    hi: i === columns.length - 1 ? Infinity : (c.x1 + columns[i + 1]!.x0) / 2
  }))
  const dateCol = columns.findIndex((c) => /date/i.test(c.text))
  const amountCols = new Set(
    columns.map((c, i) => (AMOUNT_HEADER.test(c.text) ? i : -1)).filter((i) => i >= 0)
  )
  const descCol = columns.findIndex((c) =>
    /narration|description|particulars|details|remarks/i.test(c.text)
  )

  const out: string[][] = lines.slice(0, headerIdx).map((l) => [l.text])
  out.push(columns.map((c) => c.text))
  let prev: { cells: string[]; line: Line } | null = null

  for (const line of lines.slice(headerEnd + 1)) {
    if (headerKeys.includes(line.text.toLowerCase())) continue // header repeated on each page
    const cells = new Array<string>(columns.length).fill('')
    for (const chunk of line.chunks) {
      let best = -1
      let bestScore = -Infinity
      columns.forEach((col, i) => {
        const ov = overlap(chunk.x0, chunk.x1, bounds[i]!.lo, bounds[i]!.hi)
        const score = ov > 0 ? ov : -Math.abs((chunk.x0 + chunk.x1) / 2 - (col.x0 + col.x1) / 2)
        if (score > bestScore) {
          best = i
          bestScore = score
        }
      })
      cells[best] = cells[best] ? `${cells[best]} ${chunk.text}` : chunk.text
    }

    const hasDate =
      dateCol >= 0 ? DATE_LIKE.test(cells[dateCol] ?? '') : cells.some((c) => DATE_LIKE.test(c))
    const hasAmount = [...amountCols].some((i) => AMOUNT_LIKE.test((cells[i] ?? '').trim()))
    // A wrapped description: no date, no amount, same page and directly under the previous row.
    const inDescription =
      descCol < 0 ||
      line.chunks.every((c) => c.x0 >= bounds[descCol]!.lo - 2 && c.x1 <= bounds[descCol]!.hi + 2)
    const continuation =
      prev &&
      !hasDate &&
      !hasAmount &&
      inDescription &&
      prev.line.page === line.page &&
      prev.line.y - line.y <= Math.max(line.height, prev.line.height) * 1.9
    if (continuation && prev) {
      const target = descCol >= 0 ? descCol : cells.findIndex((c) => c)
      const extra = cells.filter((c) => c).join(' ')
      prev.cells[target] = `${prev.cells[target] ?? ''} ${extra}`.trim()
      prev.line = line
      continue
    }
    out.push(cells)
    prev = hasDate ? { cells, line } : null
  }
  return out
}
