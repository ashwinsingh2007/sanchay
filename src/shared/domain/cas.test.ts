import { describe, expect, it } from 'vitest'
import { detectCas, parseCas, type CasStatement } from './cas'

// All fixtures are synthetic: fake names, ISINs, ids and amounts. Rows mirror `pdfLines`
// output, where separate PDF cells on one baseline are joined by three spaces.
const row = (...cells: string[]): string => cells.join('   ')

const PERSONAL = [
  'TEST INVESTOR',
  'AAAAA0000A',
  'FAKE STREET',
  'fake@example.com',
  'TEST NOMINEE',
  '10001234',
  '20005678',
  '30009876'
]

function expectNoPersonalData(st: CasStatement): void {
  const json = JSON.stringify(st)
  for (const s of PERSONAL) expect(json).not.toContain(s)
}

const NSDL = [
  'NSDL Consolidated Account Statement',
  'Statement for the period from 01-Sep-2026 to 30-Sep-2026',
  'CAS ID : ZZ0000001',
  'TEST INVESTOR NAME',
  '12 FAKE STREET, TESTPUR 400001',
  'Page 1 of 4',
  row('Account Type', 'Account Details', 'No. of ISINs / Schemes', 'Value in `'),
  'In the single name of',
  'TEST INVESTOR NAME (PAN:AAAAA0000A)',
  row('NSDL Demat Account', 'ALPHA BROKING LIMITED', '5', '3,95,560.00'),
  'DP ID: IN300001 Client ID: 10001234',
  row('CDSL Demat Account', 'BETA SECURITIES PVT LTD', '1', '50,000.00'),
  'DP ID: 12010000 Client ID: 20005678',
  row('Mutual Fund Folios', '2 Folios', '2', '1,10,000.00'),
  row('Total', '5,55,560.00'),
  'Page 2 of 4',
  row('NSDL Demat Account', 'ACCOUNT HOLDER'),
  row('ALPHA BROKING LIMITED', 'TEST INVESTOR NAME (PAN:AAAAA0000A)'),
  'DP ID: IN300001 Client ID: 10001234',
  'Equities (E)',
  row('ISIN', 'Company Name', 'Face Value (`)', 'No. of Shares', 'Market Price (`)', 'Value (`)'),
  'Stock Symbol',
  row('INE000A01011', 'ALPHA TEST INDUSTRIES', '10.00', '100', '2,950.50', '2,95,050.00'),
  row('ALPHATEST', 'LIMITED'),
  row('INE000B01022', 'GAMMA FAKE BANK LIMITED', '1.00', '200', '150.10', '30,020.00'),
  'GAMMABANK',
  // Row split across pages: numbers land after the repeated page furniture.
  row('INE000C01033', 'DELTA DUMMY MOTORS'),
  'Page 3 of 4',
  'NSDL Consolidated Account Statement',
  row('ISIN', 'Company Name', 'Face Value (`)', 'No. of Shares', 'Market Price (`)', 'Value (`)'),
  row('5.00', '50', '603.60', '30,180.00'),
  row('Sub Total', '3,55,250.00'),
  'Mutual Funds (M)',
  row('ISIN', 'ISIN Description', 'No. of Units', 'NAV (`)', 'Value (`)'),
  row('INF000D01044', 'EPSILON NIFTY 50 ETF', '120.000', '250.5000', '30,060.00'),
  'Corporate Bonds (C)',
  row(
    'ISIN',
    'Security',
    'Coupon Frequency',
    'Coupon Rate',
    'Maturity Date',
    'No. of Bonds',
    'Face Value',
    'Value'
  ),
  row(
    'INE000E07055',
    'ZETA FAKE FINANCE NCD SR 1',
    'Once a year',
    '8.10',
    '15-Mar-2030',
    '10',
    '1,000.00',
    '10,250.00'
  ),
  'National Pension System (N)',
  row('NPS TRUST- A/C FAKE SCHEME E - TIER I', 'FAKE PENSION FUND', '1,000.0000', '45.0000'),
  row('CDSL Demat Account', 'ACCOUNT HOLDER'),
  row('BETA SECURITIES PVT LTD', 'TEST INVESTOR NAME (PAN:AAAAA0000A)'),
  'DP ID: 12010000 Client ID: 20005678',
  'Equity Shares',
  row(
    'ISIN',
    'Security',
    'Current Bal.',
    'Free Bal.',
    'Lent Bal.',
    'Safekeep Bal.',
    'Pledge Bal.',
    'Market Price (`)',
    'Value (`)'
  ),
  row(
    'INE000F01066',
    'THETA PLACEHOLDER LTD',
    '25',
    '25',
    '--',
    '--',
    '--',
    '2,000.00',
    '50,000.00'
  ),
  'Mutual Fund Folios (F)',
  row(
    'ISIN UCC',
    'ISIN Description',
    'Folio No.',
    'No. of Units',
    'Average Cost Per Units (`)',
    'Total Cost (`)',
    'Current NAV per unit (`)',
    'Current Value (`)',
    'Unrealised Profit/(Loss) (`)',
    'Annualised Return (%)'
  ),
  row(
    'INF000G01077',
    'IOTA FLEXI CAP FUND - DIRECT PLAN - GROWTH',
    '1234567',
    '1,000.000',
    '50.0000',
    '50,000.00',
    '60.0000',
    '60,000.00',
    '10,000.00',
    '12.50'
  ),
  'NOT AVAILABLE',
  row(
    'INF000H01088',
    'KAPPA SHORT TERM DEBT FUND -',
    '7654321/12',
    '2,000.000',
    '26.0000',
    '52,000.00',
    '25.0000',
    '50,000.00',
    '(2,000.00)',
    '(1.20)'
  ),
  row('MFKAP0001', 'DIRECT PLAN - GROWTH'),
  row('Total', '1,10,000.00'),
  'Statement of Transactions for the period from 01-Sep-2026 to 30-Sep-2026',
  row('NSDL Demat Account', 'ALPHA BROKING LIMITED'),
  'DP ID: IN300001 Client ID: 10001234',
  row('INE000A01011', 'ALPHA TEST INDUSTRIES LIMITED', '05-Sep-2026', 'Buy', '50', '100'),
  'Page 4 of 4'
]

const CDSL = [
  'CONSOLIDATED ACCOUNT STATEMENT',
  'Central Depository Services (India) Limited',
  'Statement for the period from 01-09-2026 to 30-09-2026',
  'TEST INVESTOR NAME',
  '7 FAKE STREET, MOCKNAGAR',
  row('Account Type', 'Account Details', 'No. of ISINs', 'Value (`)'),
  row(
    'CDSL Demat Account',
    'OMEGA BROKING LTD DP Id: 12081600 Client Id : 30009876',
    '5',
    '1,02,000.00'
  ),
  row('Mutual Fund Folios', '1 Folio', '1', '23,000.00'),
  'AMC Name : Sigma Mutual Fund',
  row('Scheme Name : S101 - Sigma Midcap Fund - Direct Growth', 'Scheme Code : S101'),
  'Folio No : 99887766',
  row('ISIN : INF000S01099', 'UCC : MFSIG0001', 'RTA : CAMS'),
  'Page 1 of 3',
  row('DP Name : OMEGA BROKING LTD', 'BO ID : 1208160030009876'),
  'STATEMENT OF TRANSACTIONS FOR THE PERIOD FROM 01-09-2026 TO 30-09-2026',
  'ISIN : INE000P01011 - PI FAKE CHEMICALS LTD',
  row('Date', 'Description', 'Buy/Cr', 'Sell/Dr', 'Balance'),
  row('10-09-2026', 'BUY TRADE', '10', '--', '40'),
  'HOLDING STATEMENT AS ON 30-09-2026',
  row(
    'ISIN',
    'Security',
    'Current Bal',
    'Frozen Bal',
    'Pledge Bal',
    'Pledge Setup Bal',
    'Free Bal',
    'Market Price',
    'Value (`)'
  ),
  row(
    'INE000P01011',
    'PI FAKE CHEMICALS LTD',
    '40',
    '--',
    '--',
    '--',
    '40',
    '1,250.25',
    '50,010.00'
  ),
  row(
    'INE000Q01022',
    'RHO TEST POWER CORPORATION',
    '1,000',
    '--',
    '--',
    '--',
    '1,000',
    '45.50',
    '45,500.00'
  ),
  'LIMITED',
  'Page 2 of 3',
  'CONSOLIDATED ACCOUNT STATEMENT',
  row('ISIN', 'Security', 'Current Bal', 'Free Bal', 'Market Price', 'Value (`)'),
  row('INF000T01033', 'TAU GOLD BEES', '100', '--', '--', '--', '100', '64.90', '6,490.00'),
  row('INE000U20044', 'UPSILON RE PARTLY PAID', '--', '--', '--', '--', '--', '--', '--'),
  row('INE000V01055', 'PHI GARBLED LTD', '12', 'abc'),
  'MUTUAL FUND UNITS HELD AS ON 30-09-2026',
  row(
    'Scheme Name',
    'ISIN',
    'Folio No.',
    'Mode',
    'Closing Bal (Units)',
    'NAV',
    'Invested Value',
    'Valuation',
    'TER %',
    'Commission',
    'Profit/(Loss)',
    'Return %'
  ),
  row(
    'S101 - Sigma Midcap Fund -',
    'INF000S01099',
    '99887766',
    'DIRECT',
    '230.000',
    '100.0000',
    '20,000.00',
    '23,000.00',
    '0.65',
    '0.00',
    '3,000.00',
    '15.00'
  ),
  'Direct Growth',
  'Page 3 of 3'
]

const CAMS = [
  'CAMSCASWS-000123-TEST',
  'Consolidated Account Statement',
  '01-Apr-2026 To 30-Sep-2026',
  'Email Id: fake@example.com',
  'TEST INVESTOR',
  '9 FAKE STREET',
  'PORTFOLIO SUMMARY',
  row('Mutual Fund', 'Cost Value', 'Market Value'),
  row('Lambda Mutual Fund', '53,000.00', '62,033.85'),
  row('Total', '71,000.00', '82,073.85'),
  'Lambda Mutual Fund',
  row('Folio No: 1122334455 / 0', 'PAN: AAAAA0000A', 'KYC: OK  PAN: OK'),
  'TEST INVESTOR',
  row(
    'LMB01G-Lambda Bluechip Fund - Direct Plan - Growth (Non-Demat) - ISIN: INF000L01011(Advisor: DIRECT)',
    'Registrar : CAMS'
  ),
  row('Nominee 1: TEST NOMINEE', 'Nominee 2:', 'Nominee 3:'),
  'Opening Unit Balance: 1,000.000',
  row('Date', 'Transaction', 'Amount', 'Units', 'Price', 'Unit'),
  row('(INR)', '(INR)', 'Balance'),
  row('05-Apr-2026', 'Purchase - via Internet', '5,000.00', '100.000', '50.0000', '1,100.000'),
  'Page 1 of 2',
  'CAMSCASWS-000123-TEST',
  row('10-Jun-2026', 'Redemption', '(2,000.00)', '(40.000)', '50.0000', '1,060.000'),
  row('Closing Unit Balance: 1,060.000', 'NAV on 30-Sep-2026: INR 58.5225'),
  row('Total Cost Value: 53,000.00', 'Market Value on 30-Sep-2026: INR 62,033.85'),
  'LMB02Z-Lambda Liquid Fund - Direct Plan - Growth (Advisor: DIRECT) - ISIN:',
  row('INF000L01029', 'Registrar : CAMS'),
  'Opening Unit Balance: 0.000',
  '*** No transactions during this statement period ***',
  row('Closing Unit Balance: 0.000', 'NAV on 30-Sep-2026: INR 3,000.1234'),
  'Market Value on 30-Sep-2026: INR 0.00',
  'Mu Fake Fund House',
  row('Folio No: 5566778899', 'PAN: AAAAA0000A', 'KYC: OK'),
  row(
    'MU7GZ-Mu Small Cap Fund - Regular Growth (formerly Mu Emerging Fund) - ISIN: INF000M01037(Advisor: ARN-000001)',
    'Registrar : KFINTECH'
  ),
  'Opening Unit Balance: 0.000',
  row(
    '12-May-2026',
    'SIP Purchase - Instalment 1/12',
    '18,000.00',
    '250.500',
    '71.8563',
    '250.500'
  ),
  row(
    'Closing Unit Balance: 250.500',
    'NAV on 30-Sep-2026: INR 80.0000',
    'Total Cost Value: 18,000.00',
    'Market Value on 30-Sep-2026: INR 20,040.00'
  ),
  'Page 2 of 2'
]

const KFIN_DETAILED = [
  'KFINCASWS-000777',
  'Consolidated Account Statement',
  '01-Apr-2026 To 30-Sep-2026',
  'Xi Mutual Fund',
  row('Folio No: 4455667788 / 1', 'PAN: AAAAA0000A', 'KYC: OK'),
  row(
    'XI09D-Xi Corporate Bond Fund - Direct Growth - ISIN: INF000X01041(Advisor: DIRECT)',
    'Registrar : KFINTECH'
  ),
  'Opening Unit Balance: 812.345',
  row('Closing Unit Balance: 812.345', 'NAV on 30-Sep-2026: INR 36.9012'),
  row('Valuation on 30-Sep-2026: INR 29,976.51', 'Total Cost Value: 25,000.00')
]

const KFIN_SUMMARY = [
  'KFin Technologies Limited',
  'Consolidated Account Summary',
  'As on 30-Sep-2026',
  'TEST INVESTOR',
  row(
    'Folio No.',
    'ISIN',
    'Scheme Name',
    'Cost Value',
    'Unit Balance',
    'NAV Date',
    'NAV',
    'Market Value',
    'Registrar'
  ),
  'Nu Mutual Fund',
  row(
    '12345678/90',
    'INF000N01011',
    'NU12G-Nu Balanced Advantage Fund - Direct',
    '40,000.00',
    '1,234.567',
    '30-Sep-2026',
    '45.6789',
    '56,393.66',
    'KFINTECH'
  ),
  'Plan - Growth',
  'Omicron Mutual Fund',
  row(
    '87654321',
    'INF000O01022',
    'OM5-Omicron Nifty Index Fund - Direct Growth',
    '9,000.00',
    '500.000',
    '30-Sep-2026',
    '20.0000',
    '10,000.00',
    'CAMS'
  ),
  row('Total', '49,000.00', '66,393.66'),
  'Notes: market values are indicative and based on the latest NAV.'
]

const BANK = [
  'FAKE BANK LTD',
  'Consolidated Account Statement',
  'Statement of Account for the period 01/09/2026 to 30/09/2026',
  'Account No : XXXXXXXX1234',
  row('Date', 'Narration', 'Chq./Ref.No.', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'),
  row('01/09/26', 'ACH D- CAMS MF SIP INF000N01011', '0000123', '5,000.00', '', '1,20,000.00'),
  row('03/09/26', 'NSDL E-GOV PAN FEE', '0000124', '107.00', '', '1,19,893.00'),
  row('05/09/26', 'CDSL AMC CHARGES', '0000125', '300.00', '', '1,19,593.00'),
  row(
    '10/09/26',
    'BSE STAR MF REDEMPTION FOLIO 99887766',
    '0000126',
    '',
    '10,000.00',
    '1,29,593.00'
  ),
  row('30/09/26', 'SALARY SEP 2026', '0000127', '', '90,000.00', '2,19,593.00')
]

const PAYSLIP = [
  'FAKE TECH PRIVATE LIMITED',
  'Payslip for the month of September 2026',
  row('Employee Name', 'TEST INVESTOR'),
  row('PAN', 'AAAAA0000A', 'UAN', '100000000000'),
  row('Earnings', 'Amount', 'Deductions', 'Amount'),
  row('Basic', '50,000.00', 'Provident Fund', '6,000.00'),
  row('HRA', '20,000.00', 'Professional Tax', '200.00'),
  row('Special Allowance', '30,000.00', 'Income Tax', '12,000.00'),
  row('Net Pay', '81,800.00')
]

describe('detectCas', () => {
  it.each([
    ['nsdl', NSDL],
    ['cdsl', CDSL],
    ['cams', CAMS],
    ['kfintech', KFIN_DETAILED],
    ['kfintech', KFIN_SUMMARY]
  ])('detects %s', (kind, lines) => expect(detectCas(lines)).toBe(kind))

  it('does not treat a bank statement or payslip as a CAS', () => {
    expect(detectCas(BANK)).toBeNull()
    expect(detectCas(PAYSLIP)).toBeNull()
    expect(parseCas(BANK)).toBeNull()
    expect(parseCas(PAYSLIP)).toBeNull()
  })

  it('needs holdings structure, not just a mention of a depository', () => {
    expect(detectCas(['Central Depository Services (India) Limited', 'Annual charges'])).toBeNull()
    expect(detectCas(['Consolidated Account Statement', 'Folio No: 123456'])).toBeNull()
  })
})

describe('parseCas – NSDL', () => {
  const st = parseCas(NSDL)!

  it('reads the period and splits accounts', () => {
    expect(st.kind).toBe('nsdl')
    expect(st.statementDate).toBe('2026-09-30')
    expect(st.periodStart).toBe('2026-09-01')
    expect(st.accounts.map((a) => [a.type, a.label, a.dpId, a.value])).toEqual([
      ['demat', 'NSDL demat – ALPHA BROKING LIMITED', '••1234', 395560],
      ['demat', 'CDSL demat – BETA SECURITIES PVT LTD', '••5678', 50000],
      ['mf_folios', 'Mutual fund folios', null, 110000]
    ])
    expect(st.totalValue).toBe(555560)
  })

  it('reads equities with wrapped names, symbols and a row split across pages', () => {
    const [nsdl] = st.accounts
    expect(nsdl!.holdings.map((h) => [h.kind, h.name, h.isin, h.units, h.price, h.value])).toEqual([
      ['equity', 'ALPHA TEST INDUSTRIES LIMITED', 'INE000A01011', 100, 2950.5, 295050],
      ['equity', 'GAMMA FAKE BANK LIMITED', 'INE000B01022', 200, 150.1, 30020],
      ['equity', 'DELTA DUMMY MOTORS', 'INE000C01033', 50, 603.6, 30180],
      ['etf', 'EPSILON NIFTY 50 ETF', 'INF000D01044', 120, 250.5, 30060],
      ['bond', 'ZETA FAKE FINANCE NCD SR 1', 'INE000E07055', 10, 1025, 10250]
    ])
  })

  it('reads the MF folio table with cost, folio and negative P&L', () => {
    const mf = st.accounts[2]!.holdings
    expect(mf).toEqual([
      {
        kind: 'mutual_fund',
        name: 'IOTA FLEXI CAP FUND - DIRECT PLAN - GROWTH',
        isin: 'INF000G01077',
        units: 1000,
        price: 60,
        value: 60000,
        cost: 50000,
        folio: '1234567',
        amc: null
      },
      {
        kind: 'mutual_fund',
        name: 'KAPPA SHORT TERM DEBT FUND - DIRECT PLAN - GROWTH',
        isin: 'INF000H01088',
        units: 2000,
        price: 25,
        value: 50000,
        cost: 52000,
        folio: '7654321/12',
        amc: null
      }
    ])
  })

  it('ignores transactions, warns about unsupported sections and keeps out personal data', () => {
    expect(st.accounts[0]!.holdings).toHaveLength(5)
    expect(st.warnings).toEqual([
      'Skipped the "National Pension System (N)" section (not supported yet).'
    ])
    expectNoPersonalData(st)
  })
})

describe('parseCas – CDSL', () => {
  const st = parseCas(CDSL)!

  it('reads the holding statement, ETFs and placeholder cells', () => {
    expect(st.kind).toBe('cdsl')
    expect(st.statementDate).toBe('2026-09-30')
    expect(st.periodStart).toBe('2026-09-01')
    const [demat] = st.accounts
    expect(demat!.label).toBe('CDSL demat – OMEGA BROKING LTD')
    expect(demat!.dpId).toBe('••9876')
    expect(demat!.holdings.map((h) => [h.kind, h.name, h.units, h.price, h.value])).toEqual([
      ['equity', 'PI FAKE CHEMICALS LTD', 40, 1250.25, 50010],
      ['equity', 'RHO TEST POWER CORPORATION LIMITED', 1000, 45.5, 45500],
      ['etf', 'TAU GOLD BEES', 100, 64.9, 6490]
    ])
    expect(demat!.value).toBe(102000)
  })

  it('reads MF units with invested value and the AMC from the folio details', () => {
    const mf = st.accounts[1]!
    expect(mf.type).toBe('mf_folios')
    expect(mf.holdings).toEqual([
      {
        kind: 'mutual_fund',
        name: 'Sigma Midcap Fund - Direct Growth',
        isin: 'INF000S01099',
        units: 230,
        price: 100,
        value: 23000,
        cost: 20000,
        folio: '99887766',
        amc: 'Sigma Mutual Fund'
      }
    ])
    expect(st.totalValue).toBe(125000)
  })

  it('warns about unreadable rows instead of throwing', () => {
    expect(st.warnings).toEqual(["PHI GARBLED LTD (INE000V01055): couldn't read its numbers."])
    expectNoPersonalData(st)
  })
})

describe('parseCas – CAMS / KFintech', () => {
  it('reads a CAMS detailed statement from scheme footers', () => {
    const st = parseCas(CAMS)!
    expect(st.kind).toBe('cams')
    expect(st.periodStart).toBe('2026-04-01')
    expect(st.statementDate).toBe('2026-09-30')
    expect(st.accounts).toHaveLength(1)
    expect(st.accounts[0]!.holdings).toEqual([
      {
        kind: 'mutual_fund',
        name: 'Lambda Bluechip Fund - Direct Plan - Growth',
        isin: 'INF000L01011',
        units: 1060,
        price: 58.5225,
        value: 62033.85,
        cost: 53000,
        folio: '1122334455/0',
        amc: 'Lambda Mutual Fund'
      },
      {
        kind: 'mutual_fund',
        name: 'Mu Small Cap Fund - Regular Growth',
        isin: 'INF000M01037',
        units: 250.5,
        price: 80,
        value: 20040,
        cost: 18000,
        folio: '5566778899',
        amc: 'Mu Fake Fund House'
      }
    ])
    expect(st.totalValue).toBe(82073.85)
    expect(st.warnings).toEqual([])
    expectNoPersonalData(st)
  })

  it('reads a KFintech detailed statement with "Valuation on"', () => {
    const st = parseCas(KFIN_DETAILED)!
    expect(st.kind).toBe('kfintech')
    expect(st.accounts[0]!.holdings).toEqual([
      {
        kind: 'mutual_fund',
        name: 'Xi Corporate Bond Fund - Direct Growth',
        isin: 'INF000X01041',
        units: 812.345,
        price: 36.9012,
        value: 29976.51,
        cost: 25000,
        folio: '4455667788/1',
        amc: 'Xi Mutual Fund'
      }
    ])
  })

  it('reads a summary statement with wrapped scheme names', () => {
    const st = parseCas(KFIN_SUMMARY)!
    expect(st.statementDate).toBe('2026-09-30')
    expect(st.periodStart).toBeNull()
    expect(st.accounts[0]!.holdings).toEqual([
      {
        kind: 'mutual_fund',
        name: 'Nu Balanced Advantage Fund - Direct Plan - Growth',
        isin: 'INF000N01011',
        units: 1234.567,
        price: 45.6789,
        value: 56393.66,
        cost: 40000,
        folio: '12345678/90',
        amc: 'Nu Mutual Fund'
      },
      {
        kind: 'mutual_fund',
        name: 'Omicron Nifty Index Fund - Direct Growth',
        isin: 'INF000O01022',
        units: 500,
        price: 20,
        value: 10000,
        cost: 9000,
        folio: '87654321',
        amc: 'Omicron Mutual Fund'
      }
    ])
    expect(st.totalValue).toBe(66393.66)
    expectNoPersonalData(st)
  })
})

describe('parseCas – robustness', () => {
  it('returns null when a CAS has no readable holdings', () => {
    expect(
      parseCas(['NSDL Consolidated Account Statement', 'NSDL Demat Account', 'Nil'])
    ).toBeNull()
    expect(parseCas([])).toBeNull()
  })

  it('survives junk mixed into a statement', () => {
    const junk = [...CDSL.slice(0, 20), '', '((((', '1,2,3,,,.', 'INE000P01011', ...CDSL.slice(20)]
    expect(() => parseCas(junk)).not.toThrow()
    expect(parseCas(junk)!.accounts[0]!.holdings[0]!.value).toBe(50010)
  })

  it('never folds text from the top of the next page into a complete row', () => {
    const lines = [
      ...CDSL.slice(0, 21),
      'Page 2 of 3',
      'TEST INVESTOR NAME',
      row('INE000Q01022', 'RHO TEST POWER', '1,000', '1,000', '45.50', '45,500.00')
    ]
    const st = parseCas(lines)!
    expect(st.accounts[0]!.holdings.map((h) => h.name)).toEqual([
      'PI FAKE CHEMICALS LTD',
      'RHO TEST POWER'
    ])
    expectNoPersonalData(st)
  })

  it('falls back to column order and warns when units × price ≠ value', () => {
    const lines = [
      ...CDSL.slice(0, 21),
      row('INE000W01066', 'CHI ODD ROUNDING LTD', '10', '--', '--', '--', '10', '99.00', '1,500.00')
    ]
    const h = parseCas(lines)!.accounts[0]!.holdings.find((x) => x.isin === 'INE000W01066')!
    expect([h.units, h.price, h.value]).toEqual([10, 99, 1500])
    expect(parseCas(lines)!.warnings.some((w) => w.includes('CHI ODD ROUNDING LTD'))).toBe(true)
  })
})
