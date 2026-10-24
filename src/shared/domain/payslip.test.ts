import { describe, expect, it } from 'vitest'
import {
  buildSalaryProfile,
  financialYear,
  isPayslip,
  parsePayslip,
  payslipPeriod
} from './payslip'

const SLIP = [
  'Acme Technologies Private Limited',
  'Payslip for the month of September 2026',
  'Employee Name   Asha Rao   Employee ID   E1234',
  'PAN   ABCDE1234F   UAN   100200300400',
  'Earnings   Amount   Deductions   Amount',
  'Basic Salary   75,000.00   Provident Fund   9,000.00',
  'HRA   37,500.00   Professional Tax   200.00',
  'Special Allowance   52,500.00   Income Tax   28,450.00',
  'Total Earnings   1,65,000.00   Total Deductions   37,650.00',
  'Net Pay   1,27,350.00'
]

describe('payslip parsing', () => {
  it('recognises a payslip and its month', () => {
    expect(isPayslip(SLIP)).toBe(true)
    expect(isPayslip(['Statement of account', 'Date Narration Withdrawal Deposit Balance'])).toBe(
      false
    )
    expect(payslipPeriod(SLIP)).toBe('2026-09')
    expect(payslipPeriod(['Salary slip Sep-26'])).toBe('2026-09')
  })

  it('reads gross, net, tax and PF from a two-column slip', () => {
    const p = parsePayslip(SLIP, 'h', 'slip.pdf')!
    expect(p.employer).toBe('Acme Technologies Private Limited')
    expect(p.grossMinor).toBe(16500000)
    expect(p.netMinor).toBe(12735000)
    expect(p.basicMinor).toBe(7500000)
    expect(p.hraMinor).toBe(3750000)
    expect(p.pfMinor).toBe(900000)
    expect(p.taxMinor).toBe(2845000)
    expect(p.professionalTaxMinor).toBe(20000)
  })

  it('builds a salary profile and matches the bank credit', () => {
    const p = parsePayslip(SLIP, 'h', 'slip.pdf')!
    const profile = buildSalaryProfile(
      [{ ...p, id: '1', createdAt: '' }],
      [
        {
          id: 't',
          accountId: 'a',
          importSourceId: null,
          transactionDate: '2026-09-30',
          descriptionOriginal: 'NEFT ACME SALARY',
          descriptionKey: '',
          merchantNormalised: 'Acme',
          amountMinor: 12735000,
          currency: 'INR',
          direction: 'income',
          categoryId: 'income',
          categoryConfidence: 1,
          categorySource: 'keyword',
          isRecurring: false,
          isTransfer: false,
          notes: null,
          createdAt: ''
        }
      ]
    )!
    expect(profile.creditMatches).toBe(true)
    expect(profile.financialYear).toBe('FY 2026-27')
    expect(profile.retirementMonthlyMinor).toBe(900000)
    expect(financialYear('2027-02')).toBe('FY 2026-27')
  })
})
