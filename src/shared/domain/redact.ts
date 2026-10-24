/**
 * Masks personal identifiers before text leaves the Mac for a cloud AI. Amounts are never
 * touched — the AI needs exact numbers to give correct advice, but it never needs your PAN,
 * Aadhaar, account or card numbers, UPI IDs, phone, IFSC or employer's name.
 */
export interface RedactTerm {
  /** Text to hide, matched case-insensitively (e.g. the employer's name). */
  value: string
  /** What the AI sees instead, e.g. "[employer]". */
  label: string
}

const RULES: { pattern: RegExp; replace: (m: string) => string }[] = [
  // PAN: ABCDE1234F
  { pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replace: () => '[PAN]' },
  // IFSC: HDFC0001234
  { pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replace: () => '[IFSC]' },
  // UPI IDs and email addresses: name@okhdfcbank, someone@example.com
  { pattern: /\b[\w.+-]+@[A-Za-z][\w-]*(?:\.[\w-]+)*\b/g, replace: () => '[UPI/email]' },
  // Card numbers (before Aadhaar, which is a shorter run of the same shape): 13–19 digits in
  // groups of four — keep the last 4.
  {
    pattern: /(?<![\d.,₹])(?:\d{4}[ -]){3}\d{1,7}(?![\d.])/g,
    replace: (m) => `card ••${m.replace(/\D/g, '').slice(-4)}`
  },
  // Aadhaar: 1234 5678 9012 (12 digits, optionally grouped)
  { pattern: /(?<![\d.,₹])\d{4}[ -]\d{4}[ -]\d{4}(?![\d.])/g, replace: () => '[Aadhaar]' },
  // Indian mobile numbers: +91 98765 43210 / 9876543210
  {
    pattern: /(?<![\d.,₹])(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?![\d.])/g,
    replace: () => '[phone]'
  },
  // Account / card numbers written as one long run (10–18 digits) — keep the last 4. Runs next
  // to a decimal point, comma or ₹ are amounts, so they are left alone.
  {
    pattern: /(?<![\d.,₹])\d{10,18}(?![\d.,])/g,
    replace: (m) => `••${m.slice(-4)}`
  }
]

export function redact(text: string, terms: readonly RedactTerm[] = []): string {
  let out = text
  for (const t of terms) {
    const value = t.value.trim()
    if (value.length < 3) continue
    out = out.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), t.label)
  }
  for (const r of RULES) out = out.replace(r.pattern, r.replace)
  return out
}
