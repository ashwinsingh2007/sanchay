import type { PdfTextItem } from '../shared/domain/pdfTable'

export class PdfPasswordError extends Error {
  constructor(readonly incorrect: boolean) {
    super(incorrect ? 'That password didn’t work. Try again.' : 'This PDF is password-protected.')
  }
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: Promise<PdfJs> | null = null
function loadPdfJs(): Promise<PdfJs> {
  // pdf.js ships as ESM; load lazily so app start-up stays fast.
  pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjs
}

const MAX_PAGES = 200

/**
 * Extracts positioned text from a PDF, entirely on this Mac. Scripts, fonts and network access
 * are disabled. Throws PdfPasswordError when a password is needed or wrong.
 */
export async function extractPdfText(
  data: Uint8Array,
  password?: string
): Promise<PdfTextItem[][]> {
  const lib = await loadPdfJs()
  const task = lib.getDocument({
    data: new Uint8Array(data),
    password,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false
  })
  let doc
  try {
    doc = await task.promise
  } catch (err) {
    const name = (err as { name?: string }).name
    const code = (err as { code?: number }).code
    if (name === 'PasswordException') throw new PdfPasswordError(code === 2)
    throw new Error('This PDF couldn’t be opened. It may be damaged.', { cause: err })
  }
  try {
    const pages: PdfTextItem[][] = []
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const it of content.items) {
        if (!('str' in it) || !it.str) continue
        const t = it.transform as number[]
        items.push({
          str: it.str,
          x: t[4]!,
          y: t[5]!,
          width: it.width,
          height: it.height || Math.abs(t[3]!) || 10
        })
      }
      pages.push(items)
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}
