/**
 * The AI CFO's investing playbook for India: which instrument does which job, how each is taxed,
 * and the order of operations a planner follows. Curated from public rules (Income-tax Act,
 * SEBI/AMFI categorisation) and common Indian financial-planning practice; tax figures are as of
 * FY 2025-26 and must be re-checked against the latest Budget before quoting.
 */
export const INVESTING_AS_OF = 'FY 2025-26 rules (re-check any Budget 2026 changes with web search)'

export const INVESTING_PLAYBOOK = `## Order of operations (do these in order)
1. Pay credit cards in full; clear loans above ~9–10% interest before investing.
2. Emergency fund: 6 months of typical spending (more with dependents or unstable income) in a savings/sweep-in FD or a liquid / money-market fund (direct plan).
3. Protection: pure term life cover ≈ 10–15× annual income if anyone depends on you; health cover — family floater (₹10L+ in metros) plus a super top-up. Don't mix insurance with investing (endowment, money-back, ULIP): compare surrender vs paid-up before stopping one.
4. Money needed within ~3 years: no equity. Arbitrage funds (equity-taxed, low risk), liquid/money-market or short-duration debt funds, FDs.
5. Long-term money (5+ years): mostly low-cost, diversified equity — a Nifty 50 / Nifty 500 / total-market index fund as the core, optionally a flexi-cap fund; direct plans only (0.5–1% a year cheaper than regular).
6. Rebalance once a year, or when an asset class drifts 5–10 points from target. Deploy large lump sums via STP over 6–12 months.

## Diversification guard-rails
- One stock ≤ 10% of the stock portfolio; one sector ≤ 25–30%. PSU, oil & gas and metal stocks tend to move together.
- 4–6 mutual funds usually cover everything; many funds in the same category overlap heavily.
- ELSS: each instalment is locked for 3 years; more than 1–2 ELSS funds is clutter. ELSS only helps tax if you file under the old regime (80C, ₹1.5L).

## Tax (resident individuals, ${INVESTING_AS_OF})
- Listed shares, equity funds and arbitrage funds: STCG (held ≤ 12 months) 20%; LTCG 12.5% on gains above ₹1.25L a year.
- Debt funds bought on/after 1 Apr 2023 (and funds with ≤ 35% equity): gains taxed at your slab rate whatever the holding period.
- FD, RD and savings interest: slab rate. 80TTA (₹10k savings interest) and 80C/80D only under the old regime.
- New regime is the default; employer NPS contribution (80CCD(2)) still deductible there.
- NPS: 80CCD(1B) extra ₹50k under the old regime; 60% of the corpus can be withdrawn tax-free at 60.
- PPF: ₹500–₹1.5L a year, 15 years, tax-free (EEE).
- Gold: new Sovereign Gold Bond issues have been discontinued; use gold ETFs or gold funds for 5–10% gold.

## How to recommend
- Name specific funds only after fetching their current data (INDmoney fund details: category, expense ratio, rank, returns). Prefer direct-plan index or large flexi-cap funds with low cost and long records.
- Never recommend leverage, F&O, small-cap concentration or chasing last year's winners.
- Say what would change the advice (a loan, a house purchase, a job change).`
