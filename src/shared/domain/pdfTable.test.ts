import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { autoMapStatement } from './autoMap'
import { checkStatement } from './classify'
import { normaliseRows } from './csvNormalise'
import { pdfItemsToRows, type PdfTextItem } from './pdfTable'

async function pdfRows(file: string): Promise<string[][]> {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(join(__dirname, '../../../fixtures', file)))
  const doc = await lib.getDocument({ data, disableFontFace: true }).promise
  const pages: PdfTextItem[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    pages.push(
      content.items
        .filter((i) => 'str' in i && i.str)
        .map((i) => {
          const it = i as { str: string; transform: number[]; width: number; height: number }
          return {
            str: it.str,
            x: it.transform[4]!,
            y: it.transform[5]!,
            width: it.width,
            height: it.height
          }
        })
    )
  }
  return pdfItemsToRows(pages)
}

describe('PDF statements', () => {
  it('rebuilds a multi-page statement table with wrapped headers', async () => {
    const rows = await pdfRows('sample-bank-statement.pdf')
    expect(rows).toContainEqual([
      'Date',
      'Narration',
      'Chq./Ref.No.',
      'Withdrawal Amt.',
      'Deposit Amt.',
      'Closing Balance'
    ])
    // Empty cells keep their column: a deposit row has a blank withdrawal.
    expect(rows).toContainEqual([
      '01/04/2026',
      'NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY APR',
      '9740108507',
      '',
      '1,85,000.00',
      '3,25,000.00'
    ])

    expect(checkStatement(rows)).toMatchObject({ isStatement: true, confidence: 'high' })
    const auto = autoMapStatement(rows, 'statement.pdf')
    expect(auto.confident).toBe(true)
    expect(auto.mapping).toMatchObject({ amountMode: 'debit_credit', balanceColumn: 5 })
    const parsed = normaliseRows(rows, auto.mapping, 2)
    expect(parsed.rows).toHaveLength(78) // same as the CSV export of this statement
    expect(parsed.invalidCount).toBe(0)
  }, 30_000)

  it('rejects a PDF that is not a statement', async () => {
    const rows = await pdfRows('not-a-statement-invoice.pdf')
    expect(checkStatement(rows).isStatement).toBe(false)
  }, 30_000)
})

describe('checkStatement', () => {
  it('rejects text with no dated transactions', () => {
    expect(
      checkStatement([
        ['Name', 'Email'],
        ['A', 'a@x.com']
      ])
    ).toMatchObject({ isStatement: false, confidence: 'high' })
  })
})
