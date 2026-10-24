import { describe, expect, it } from 'vitest'
import { redact } from './redact'

describe('redact', () => {
  it('masks identifiers', () => {
    const text = [
      'PAN ABCDE1234F, IFSC HDFC0001234',
      'UPI/ravi.k@okhdfcbank/Dinner; mail me at a.b@example.com',
      'Aadhaar 1234 5678 9012',
      'Card 4111 1111 1111 1234',
      'Call +91 98765 43210',
      'NEFT/50100123456789/rent'
    ].join('\n')
    const out = redact(text)
    expect(out).toContain('PAN [PAN], IFSC [IFSC]')
    expect(out).toContain('UPI/[UPI/email]/Dinner')
    expect(out).toContain('mail me at [UPI/email]')
    expect(out).toContain('Aadhaar [Aadhaar]')
    expect(out).toContain('Card card ••1234')
    expect(out).toContain('Call [phone]')
    expect(out).toContain('NEFT/••6789/rent')
  })

  it('never changes amounts', () => {
    const text =
      'Net worth ₹1,38,61,796 · invested 13441553.29 · ₹5,00,000 · 1234567.5 · total 99000000'
    expect(redact(text)).toBe(text)
  })

  it('hides named terms case-insensitively', () => {
    expect(
      redact('Salary from Revecast Solutions Private Limited', [
        { value: 'revecast solutions private limited', label: '[employer]' }
      ])
    ).toBe('Salary from [employer]')
  })
})
