/**
 * The CFO review: one deterministic read of the whole picture — what you own, what you spend,
 * what you should keep liquid and where the risks are. The AI quotes these numbers instead of
 * re-deriving them on every answer, so advice stays consistent from one question to the next.
 *
 * Rules of thumb (all estimates, shown with their basis):
 * - Emergency fund = 6 × typical (median) monthly spend, rounded up to ₹50,000. Median, so one
 *   expensive month doesn't inflate it.
 * - Target equity share of invested money = 100 − age, nudged by risk appetite, kept within
 *   20–85%; 5% gold; the rest debt. (The common age-based rule, also used by open-source
 *   planners such as sarveshtalele/personal-finance-mcp.)
 * - Concentration: one stock > 20% of direct stocks or > 10% of net worth; one macro-sector
 *   > 30% of direct stocks.
 */
export type Row = Record<string, unknown>

export interface FundFacts {
  category: string | null
  expenseRatio: number | null
  rankTag: string | null
  rank: string | null
  return3y: number | null
}

export interface ReviewInput {
  asOf: string
  /** INDmoney networth_snapshot (rupees). */
  snapshot: Row | null
  /** INDmoney holdings by asset type (IND_STOCK, MF, SA, …). */
  holdings: Record<string, Row[]>
  /** investment_code → sector facts from Tapetide. */
  sectors: Record<string, { macroSector?: string | null; sector?: string | null }>
  /** fund investment_code → fund facts. */
  funds: Record<string, FundFacts>
  /** Monthly spending (paise) for recent full months, oldest first. */
  monthlySpendMinor: number[]
  profile: {
    age: number | null
    risk: 'low' | 'medium' | 'high' | null
    hasDependents: boolean | null
    termInsurance: string | null
    healthInsurance: string | null
  }
}

export interface AllocationSlice {
  key: 'equity' | 'debt' | 'gold' | 'cash' | 'other'
  label: string
  currentMinor: number
  currentPct: number
  /** Target share of net worth; null when there is no target for this slice. */
  targetPct: number | null
}

export interface ReviewFinding {
  id: string
  severity: 'high' | 'attention' | 'info'
  title: string
  detail: string
  amountMinor: number | null
}

export interface CfoReview {
  asOf: string
  netWorthMinor: number
  cashMinor: number
  typicalMonthlySpendMinor: number | null
  emergencyFundMinor: number | null
  investableSurplusMinor: number | null
  targetBasis: string
  allocation: AllocationSlice[]
  stocks: {
    count: number
    valueMinor: number
    top: { name: string; pct: number }[]
    sectors: { name: string; pct: number }[]
    unclassifiedPct: number
  }
  funds: {
    count: number
    valueMinor: number
    byCategory: { category: string; count: number; valueMinor: number }[]
    elssCount: number
    costly: { name: string; expenseRatio: number }[]
    lagging: { name: string; rank: string | null }[]
  }
  findings: ReviewFinding[]
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const paise = (rupees: unknown): number => Math.round(num(rupees) * 100)
const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0
const roundUp = (minor: number, step: number): number => Math.ceil(minor / step) * step

export function median(values: number[]): number | null {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2)
}

/** Target equity share of invested money (excluding the emergency fund). */
export function targetEquityPct(age: number | null, risk: ReviewInput['profile']['risk']): number {
  const base = age == null ? 60 : 100 - age
  const adj = risk === 'low' ? -15 : risk === 'high' ? 10 : 0
  return Math.max(20, Math.min(85, base + adj))
}

const ASSET_CLASS: Record<string, AllocationSlice['key']> = {
  equity: 'equity',
  'global equity': 'equity',
  debt: 'debt',
  liquid: 'cash',
  gold: 'gold'
}

export function buildCfoReview(input: ReviewInput): CfoReview {
  const snap = input.snapshot
  const netWorth = paise(snap?.['total_networth'])
  const assets = (snap?.['assets'] as Row[] | undefined) ?? []
  const totals: Record<AllocationSlice['key'], number> = {
    equity: 0,
    debt: 0,
    gold: 0,
    cash: 0,
    other: 0
  }
  for (const a of assets) {
    const key = ASSET_CLASS[String(a['assetclass_l2'] ?? '').toLowerCase()] ?? 'other'
    totals[key] += paise(a['current_value'])
  }
  const grossAssets = Object.values(totals).reduce((t, v) => t + v, 0) || netWorth
  const cash = totals.cash

  // --- Liquidity -----------------------------------------------------------------------------
  const typicalSpend = median(input.monthlySpendMinor.slice(-6))
  const emergencyFund = typicalSpend != null ? roundUp(typicalSpend * 6, 50_000_00) : null
  const surplus = emergencyFund != null ? Math.max(0, cash - emergencyFund) : null

  // --- Targets -------------------------------------------------------------------------------
  const { age, risk } = input.profile
  const equityTargetOfInvested = targetEquityPct(age, risk)
  const investedBase = Math.max(0, grossAssets - (emergencyFund ?? 0))
  const share = (part: number): number => pct(part, grossAssets)
  const efPct = emergencyFund != null ? share(Math.min(emergencyFund, grossAssets)) : null
  const toNet = (p: number): number =>
    Math.round(((p / 100) * investedBase * 1000) / Math.max(1, grossAssets)) / 10
  const targetBasis =
    `${age == null ? 'Age unknown (assumed 40)' : `Age ${age}`}, ` +
    `${risk ?? 'medium (assumed)'} risk → ${equityTargetOfInvested}% equity / 5% gold / ` +
    `${95 - equityTargetOfInvested}% debt of invested money` +
    (emergencyFund != null ? `, plus a 6-month emergency fund in cash.` : '.')
  const allocation: AllocationSlice[] = [
    { key: 'equity', label: 'Equity', targetPct: toNet(equityTargetOfInvested) },
    { key: 'debt', label: 'Debt', targetPct: toNet(95 - equityTargetOfInvested) },
    { key: 'gold', label: 'Gold', targetPct: toNet(5) },
    { key: 'cash', label: 'Cash', targetPct: efPct },
    { key: 'other', label: 'Other', targetPct: null }
  ].map((s) => ({
    ...(s as Omit<AllocationSlice, 'currentMinor' | 'currentPct'>),
    currentMinor: totals[s.key as AllocationSlice['key']],
    currentPct: share(totals[s.key as AllocationSlice['key']])
  }))

  // --- Direct stocks ---------------------------------------------------------------------------
  const stocks = input.holdings['IND_STOCK'] ?? []
  const stockValue = stocks.reduce((t, h) => t + paise(h['market_value']), 0)
  const top = [...stocks]
    .sort((a, b) => num(b['market_value']) - num(a['market_value']))
    .slice(0, 5)
    .map((h) => ({
      name: String(h['investment'] ?? '—'),
      pct: pct(paise(h['market_value']), stockValue)
    }))
  const bySector = new Map<string, number>()
  let unclassified = 0
  for (const h of stocks) {
    const sector = input.sectors[String(h['investment_code'] ?? '')]?.macroSector
    if (sector) bySector.set(sector, (bySector.get(sector) ?? 0) + paise(h['market_value']))
    else unclassified += paise(h['market_value'])
  }
  const sectors = [...bySector.entries()]
    .map(([name, v]) => ({ name, pct: pct(v, stockValue) }))
    .sort((a, b) => b.pct - a.pct)

  // --- Mutual funds ----------------------------------------------------------------------------
  const funds = input.holdings['MF'] ?? []
  const fundValue = funds.reduce((t, h) => t + paise(h['market_value']), 0)
  const cats = new Map<string, { count: number; valueMinor: number }>()
  const costly: CfoReview['funds']['costly'] = []
  const lagging: CfoReview['funds']['lagging'] = []
  let elss = 0
  for (const h of funds) {
    const name = String(h['investment'] ?? '—')
    const facts = input.funds[String(h['investment_code'] ?? '')]
    const isElss = /elss|tax ?saver/i.test(name) || /elss/i.test(facts?.category ?? '')
    if (isElss) elss++
    const category = isElss ? 'ELSS (tax saver)' : (facts?.category ?? 'Unknown')
    const c = cats.get(category) ?? { count: 0, valueMinor: 0 }
    cats.set(category, { count: c.count + 1, valueMinor: c.valueMinor + paise(h['market_value']) })
    // INDmoney's fund expense ratio is the scheme's headline (regular-plan) figure, so it only
    // says something about holdings that aren't direct plans.
    if (facts?.expenseRatio != null && facts.expenseRatio > 1 && !/\bdirect\b/i.test(name))
      costly.push({ name, expenseRatio: facts.expenseRatio })
    if (facts?.rankTag && /lag/i.test(facts.rankTag)) lagging.push({ name, rank: facts.rank })
  }
  const byCategory = [...cats.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.valueMinor - a.valueMinor)

  // --- Findings, most important first ---------------------------------------------------------
  const findings: ReviewFinding[] = []
  const L = (minor: number): string => `₹${(minor / 100 / 100_000).toFixed(1)}L`
  const few = (names: string[]): string =>
    names.length > 3
      ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
      : names.join(', ')

  if (emergencyFund != null && surplus != null && surplus > 1_00_000_00)
    findings.push({
      id: 'idle-cash',
      severity: 'high',
      title: `${L(surplus)} of cash is idle`,
      detail: `You hold ${L(cash)} in savings/liquid. Keeping a 6-month emergency fund of ${L(emergencyFund)} (6 × typical monthly spend of ${L(typicalSpend!)}), the remaining ${L(surplus)} could be earning more.`,
      amountMinor: surplus
    })
  else if (emergencyFund != null && cash < emergencyFund)
    findings.push({
      id: 'emergency-short',
      severity: 'high',
      title: `Emergency fund short by ${L(emergencyFund - cash)}`,
      detail: `Cash is ${L(cash)}; 6 months of typical spending is ${L(emergencyFund)}. Build this before investing more.`,
      amountMinor: emergencyFund - cash
    })

  const eq = allocation[0]!
  if (eq.targetPct != null && Math.abs(eq.currentPct - eq.targetPct) >= 10)
    findings.push({
      id: 'equity-drift',
      severity: 'attention',
      title: `Equity is ${eq.currentPct}% of your money; target ~${eq.targetPct}%`,
      detail: `${targetBasis} Moving ${L(Math.abs(((eq.targetPct - eq.currentPct) / 100) * grossAssets))} ${eq.currentPct < eq.targetPct ? 'into' : 'out of'} equity closes the gap — gradually, not at once.`,
      amountMinor: Math.round(Math.abs(((eq.targetPct - eq.currentPct) / 100) * grossAssets))
    })

  const biggest = top[0]
  if (biggest && stockValue > 0) {
    const ofNet = pct((biggest.pct / 100) * stockValue, netWorth)
    if (biggest.pct > 20 || ofNet > 10)
      findings.push({
        id: 'single-stock',
        severity: 'high',
        title: `${biggest.name} is ${biggest.pct}% of your stocks`,
        detail: `That is ${ofNet}% of your net worth in one company. A common limit is 10% of stocks per company.`,
        amountMinor: null
      })
  }
  const topSector = sectors[0]
  if (topSector && topSector.pct > 30)
    findings.push({
      id: 'sector',
      severity: 'attention',
      title: `${topSector.name} is ${topSector.pct}% of your stocks`,
      detail: `Sector mix of direct stocks: ${sectors
        .slice(0, 4)
        .map((s) => `${s.name} ${s.pct}%`)
        .join(
          ', '
        )}${unclassified > 0 ? ` (${pct(unclassified, stockValue)}% unclassified)` : ''}. Shares in one sector tend to fall together.`,
      amountMinor: null
    })

  if (funds.length > 8 || elss > 2)
    findings.push({
      id: 'fund-clutter',
      severity: 'attention',
      title: `${funds.length} mutual funds${elss > 2 ? `, ${elss} of them tax-saver (ELSS)` : ''}`,
      detail: `More funds rarely means more diversification — they overlap. ${elss > 2 ? 'ELSS units unlock 3 years after each purchase; stop new SIPs in extra ELSS funds and consolidate as units unlock. ' : ''}4–6 funds usually cover everything.`,
      amountMinor: null
    })
  if (costly.length > 0)
    findings.push({
      id: 'costly-funds',
      severity: 'attention',
      title: `${costly.length} regular-plan fund${costly.length === 1 ? '' : 's'} costing over 1% a year`,
      detail: `${few(costly.map((c) => `${c.name} (${c.expenseRatio}%)`))}. The direct plan of the same fund is usually 0.5–1% a year cheaper.`,
      amountMinor: null
    })
  if (lagging.length > 0)
    findings.push({
      id: 'lagging-funds',
      severity: 'info',
      title: `${lagging.length} fund${lagging.length === 1 ? '' : 's'} rated "lagging" by INDmoney`,
      detail: `${few(lagging.map((l) => `${l.name}${l.rank ? ` (${l.rank} in category)` : ''}`))}. Worth a look before adding more money to them.`,
      amountMinor: null
    })

  const p = input.profile
  if (p.hasDependents && !p.termInsurance)
    findings.push({
      id: 'term-cover',
      severity: 'high',
      title: 'No term life cover on record',
      detail:
        'You have dependents. A pure term plan of about 10–15× annual income is the usual first protection. Tell me what you have in the CFO profile.',
      amountMinor: null
    })
  if (!p.healthInsurance)
    findings.push({
      id: 'health-cover',
      severity: 'attention',
      title: 'Health cover not on record',
      detail:
        'Add your health insurance (employer + personal) to the CFO profile so I can check it.',
      amountMinor: null
    })
  if (p.age == null || p.risk == null)
    findings.push({
      id: 'profile-gaps',
      severity: 'info',
      title: 'Targets use assumptions',
      detail: `Add your ${[p.age == null && 'age', p.risk == null && 'risk appetite'].filter(Boolean).join(' and ')} in the CFO profile for a personal target allocation.`,
      amountMinor: null
    })

  const order = { high: 0, attention: 1, info: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])

  return {
    asOf: input.asOf,
    netWorthMinor: netWorth,
    cashMinor: cash,
    typicalMonthlySpendMinor: typicalSpend,
    emergencyFundMinor: emergencyFund,
    investableSurplusMinor: surplus,
    targetBasis,
    allocation,
    stocks: {
      count: stocks.length,
      valueMinor: stockValue,
      top,
      sectors,
      unclassifiedPct: pct(unclassified, stockValue)
    },
    funds: {
      count: funds.length,
      valueMinor: fundValue,
      byCategory,
      elssCount: elss,
      costly,
      lagging
    },
    findings
  }
}

/** The review as text for the AI CFO: the agreed numbers it must quote. */
export function cfoReviewDigest(r: CfoReview): string {
  const L = (minor: number | null): string =>
    minor == null ? 'unknown' : `₹${(minor / 100 / 100_000).toFixed(2)}L`
  return [
    `CFO review (computed ${r.asOf}; these are the agreed numbers — quote them, don't recompute):`,
    `- Net worth ${L(r.netWorthMinor)}; cash ${L(r.cashMinor)}; typical monthly spend ${L(r.typicalMonthlySpendMinor)} (median of recent months).`,
    `- Emergency fund target ${L(r.emergencyFundMinor)} (6 months); investable surplus cash ${L(r.investableSurplusMinor)}.`,
    `- Allocation now vs target (% of total assets): ${r.allocation
      .map(
        (a) =>
          `${a.label} ${a.currentPct}%${a.targetPct != null ? ` (target ${a.targetPct}%)` : ''}`
      )
      .join(', ')}. Basis: ${r.targetBasis}`,
    `- Direct stocks: ${r.stocks.count} holdings, ${L(r.stocks.valueMinor)}. Top: ${r.stocks.top
      .map((t) => `${t.name} ${t.pct}%`)
      .join(', ')}. Sectors: ${r.stocks.sectors
      .slice(0, 5)
      .map((s) => `${s.name} ${s.pct}%`)
      .join(
        ', '
      )}${r.stocks.unclassifiedPct ? `; ${r.stocks.unclassifiedPct}% unclassified` : ''}.`,
    `- Mutual funds: ${r.funds.count} funds, ${L(r.funds.valueMinor)}; by category: ${r.funds.byCategory
      .map((c) => `${c.category} ×${c.count} ${L(c.valueMinor)}`)
      .join(', ')}.`,
    'Findings (priority order):',
    ...r.findings.map((f) => `- [${f.severity}] ${f.title} — ${f.detail}`)
  ].join('\n')
}
