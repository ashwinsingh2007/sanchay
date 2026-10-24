import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { checkStatement } from '../shared/domain/classify'
import { detectHeaderRow } from '../shared/domain/csvNormalise'
import { pdfItemsToRows } from '../shared/domain/pdfTable'
import { isPayslip, parsePayslip, pdfLines } from '../shared/domain/payslip'
import { detectCas, parseCas } from '../shared/domain/cas'
import { saveCas } from './portfolio'
import { aiReadPayslip } from './ai/readPayslip'
import { savePayslip } from './repository'
import type { StatementReadResult } from '../shared/types'
import { aiConfirmStatement } from './ai/classifyStatement'
import { MAX_CSV_BYTES, parseCsvText } from './csv'
import type { Db } from './db/client'
import { extractPdfText, PdfPasswordError } from './pdf'

const MAX_BYTES = 25 * 1024 * 1024

/** Files picked via the dialog that are waiting for a PDF password (kept only in memory). */
const pending = new Map<string, { filename: string; data: Uint8Array }>()

function isPdf(filename: string, data: Uint8Array): boolean {
  return (
    /\.pdf$/i.test(filename) ||
    (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)
  ) // %PDF
}

/**
 * Turns any supported file (CSV/TXT/PDF) into statement rows, after checking it really is a bank
 * or credit-card statement. Everything happens locally; passwords are used once and never stored.
 */
export async function readStatement(
  db: Db,
  input: { filename?: string; data?: Uint8Array; token?: string; password?: string }
): Promise<StatementReadResult> {
  let filename = input.filename ?? 'statement'
  let data = input.data
  if (input.token) {
    const p = pending.get(input.token)
    if (!p) return { status: 'unreadable', reason: 'Please choose the file again.' }
    filename = p.filename
    data = p.data
  }
  if (!data) return { status: 'unreadable', reason: 'No file received.' }
  if (data.byteLength > MAX_BYTES)
    return { status: 'unreadable', reason: 'This file is larger than 25 MB.' }

  let rows: string[][]
  let fileHash: string
  let format: 'csv' | 'pdf'
  if (isPdf(filename, data)) {
    format = 'pdf'
    try {
      const pages = await extractPdfText(data, input.password)
      const chars = pages.reduce((n, p) => n + p.reduce((m, i) => m + i.str.trim().length, 0), 0)
      if (chars < 40) {
        return {
          status: 'unreadable',
          reason:
            'This PDF looks scanned (images only), so its text can’t be read. Download the statement again as a text PDF or CSV from your bank.'
        }
      }
      // A salary slip rather than a statement? Parse and keep it for the AI CFO.
      const lines = pdfLines(pages)
      // A CAS (holdings across brokers / fund houses)? Store it as the portfolio source.
      if (detectCas(lines)) {
        const cas = parseCas(lines)
        if (input.token) pending.delete(input.token)
        if (!cas)
          return {
            status: 'unreadable',
            reason:
              'This looks like a CAS, but its holdings couldn’t be read. Download it again as the "detailed" statement from NSDL, CDSL, CAMS or KFintech.'
          }
        const hash = createHash('sha256').update(data).digest('hex')
        const saved = saveCas(db, cas, filename, hash)
        return { status: 'cas', cas: saved.info, duplicate: saved.duplicate }
      }
      if (isPayslip(lines)) {
        const hash = createHash('sha256').update(data).digest('hex')
        const parsed =
          parsePayslip(lines, hash, filename) ?? (await aiReadPayslip(db, lines, hash, filename))
        if (input.token) pending.delete(input.token)
        if (!parsed)
          return {
            status: 'unreadable',
            reason:
              'This looks like a salary slip, but its gross and net pay couldn’t be read. Try the PDF your employer’s payroll portal provides.'
          }
        return { status: 'payslip', ...savePayslip(db, parsed) }
      }
      rows = pdfItemsToRows(pages)
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        const token = input.token ?? randomUUID()
        pending.set(token, { filename, data })
        return { status: 'password_required', token, filename, incorrect: err.incorrect }
      }
      return {
        status: 'unreadable',
        reason: err instanceof Error ? err.message : 'This PDF couldn’t be read.'
      }
    }
    fileHash = createHash('sha256').update(data).digest('hex')
  } else {
    format = 'csv'
    if (data.byteLength > MAX_CSV_BYTES)
      return { status: 'unreadable', reason: 'This file is larger than 20 MB.' }
    try {
      const parsed = parseCsvText(filename, Buffer.from(data).toString('utf8'))
      rows = parsed.rows
      fileHash = parsed.fileHash
    } catch (err) {
      return {
        status: 'unreadable',
        reason: err instanceof Error ? err.message : 'This file couldn’t be read.'
      }
    }
  }
  if (input.token) pending.delete(input.token)

  // Is it actually a statement? Clear cases are decided by rules; unclear ones by the local AI.
  const check = checkStatement(rows)
  let isStatement = check.isStatement
  let reason = check.reason
  if (check.confidence === 'low') {
    const ai = await aiConfirmStatement(db, rows)
    if (ai) {
      isStatement = ai.isStatement
      reason = ai.reason
    }
  }
  if (!isStatement) return { status: 'not_statement', reason, filename }

  return {
    status: 'ok',
    csv: { filename, fileHash, rows, suggestedHeaderRow: detectHeaderRow(rows), format },
    transactionLines: check.transactionLines
  }
}

/** Reads a file chosen in the native dialog. */
export async function readPickedFile(db: Db, path: string): Promise<StatementReadResult> {
  if (statSync(path).size > MAX_BYTES)
    return { status: 'unreadable', reason: 'This file is larger than 25 MB.' }
  return readStatement(db, { filename: basename(path), data: new Uint8Array(readFileSync(path)) })
}
