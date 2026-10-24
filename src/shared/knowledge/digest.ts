import { CARD_CATALOGUE, CATALOGUE_AS_OF } from '../cards'
import { formatMoney } from '../money'
import type { MoneyFlow, PaymentAdvice } from '../types'
import { PAYMENT_PRINCIPLES, PLAYBOOK } from './playbook'
import { DISCONTINUED, UPI_APPS } from './upiApps'

const pct = (r: number): string => `${Math.round(r * 1000) / 10}%`

/**
 * The payment knowledge base plus how it applies to this user, as plain text for the AI CFO.
 * `full` adds the whole card catalogue and playbook (for larger cloud models).
 */
export function paymentKnowledgeDigest(input: {
  advice: PaymentAdvice | null
  flow: MoneyFlow | null
  currency: string
  full: boolean
}): string {
  const { advice, flow, full } = input
  const fmt = (m: number): string => formatMoney(m, input.currency)
  const out: string[] = []

  out.push(
    `Knowledge base as of ${CATALOGUE_AS_OF}. Rates are indicative; tell the user to verify current terms.`
  )
  if (advice) {
    out.push('', '## How this user pays (last 12 months)')
    out.push(
      `Reward-eligible spend ≈ ${fmt(advice.annualSpendMinor)}/year; ${advice.upiSharePct}% of it paid by UPI; rewards earned today ≈ ${fmt(advice.todayAnnualRewardMinor)}/year.`
    )
    if (advice.foreignAnnualMinor > 0)
      out.push(`Foreign-currency spend ≈ ${fmt(advice.foreignAnnualMinor)}/year.`)
    out.push(
      `Top categories/year: ${advice.byCategory
        .slice(0, 6)
        .map((c) => `${c.categoryId} ${fmt(c.annualMinor)}`)
        .join(', ')}.`
    )

    out.push('', '## Best-matching cards for this spending (estimates, net of fees, vs today)')
    for (const c of advice.cards.slice(0, 5)) {
      out.push(
        `- ${c.issuer} ${c.name} (${c.network}${c.upi ? ', works on UPI' : ''}): +${fmt(c.netAnnualGainMinor)}/yr; fee ${fmt(c.effectiveFeeMinor)}. ${c.why.join('; ')}.`
      )
    }
    if (advice.combo)
      out.push(
        `Best two-card combo: ${advice.combo.names.join(' + ')} → +${fmt(advice.combo.netAnnualGainMinor)}/yr. Split: ${advice.combo.split.join(' | ')}.`
      )
  }

  if (advice && advice.byCategory.length > 0) {
    out.push('', '## Best cards by category for this user (catalogue rates)')
    for (const { categoryId, annualMinor } of advice.byCategory.slice(0, 6)) {
      const top = [...CARD_CATALOGUE]
        .map((c) => ({ c, r: Math.max(c.categoryRates?.[categoryId] ?? 0, c.baseRate) }))
        .sort((a, b) => b.r - a.r)
        .slice(0, 3)
      out.push(
        `- ${categoryId} (${fmt(annualMinor)}/yr): ${top.map(({ c, r }) => `${c.issuer} ${c.name} ${pct(r)}${c.monthlyCapMinor ? ` (cap ${fmt(c.monthlyCapMinor)}/mo)` : ''}`).join('; ')}`
      )
    }
  }

  if (flow && flow.outgoing.payTips.length > 0) {
    out.push('', `## Better ways to pay at their merchants (${flow.month})`)
    for (const t of flow.outgoing.payTips.slice(0, 10)) {
      out.push(
        `- ${t.merchant} (~${fmt(t.monthlyMinor)}/mo, paid via ${t.current}): best ${t.best.label} ${pct(t.best.rate)}; also ${t.others
          .map((o) => `${o.label} ${pct(o.rate)}`)
          .join(', ')}. Extra ≈ ${fmt(t.monthlyGainMinor)}/mo.`
      )
    }
  }

  out.push('', '## UPI apps')
  for (const a of UPI_APPS)
    out.push(
      `- ${a.name} (${a.owner}): ${a.rewardType}, typically ${pct(a.typicalRate)}, up to ${pct(a.upToRate)}${a.rupayCredit ? '; supports RuPay credit cards' : ''}. Best for: ${a.bestFor}.${a.partners.length ? ` Partners: ${a.partners.join(', ')}.` : ''} ${a.caveats.join(' ')}`
    )

  if (full) {
    out.push('', '## Card catalogue')
    for (const c of CARD_CATALOGUE) {
      const special = [
        ...Object.entries(c.merchantRates ?? {}).map(([k, r]) => `${k} ${pct(r)}`),
        ...Object.entries(c.categoryRates ?? {}).map(([k, r]) => `${k} ${pct(r)}`)
      ]
      out.push(
        `- ${c.issuer} ${c.name} [${c.network}] fee ${fmt(c.annualFeeMinor)}${c.feeWaiverSpendMinor ? ` (waived over ${fmt(c.feeWaiverSpendMinor)}/yr)` : ''}; base ${pct(c.baseRate)}${special.length ? `; ${special.join(', ')}` : ''}${c.upiRate != null ? `; UPI ${pct(c.upiRate)}` : ''}; forex ${c.forexMarkupPct}%${c.lounges ? `; lounges ${c.lounges.domestic} dom/${c.lounges.international} intl` : ''}. ${c.notes.join(' ')}`
      )
    }
    out.push('', '## Where to pay how')
    for (const e of PLAYBOOK)
      out.push(
        `- ${e.label}: ${e.routes.map((r) => `${r.label} ${pct(r.rate)} (${r.how})`).join('; ')}${e.stack ? ` Stack: ${e.stack}` : ''}${e.avoid ? ` Avoid: ${e.avoid}` : ''}`
      )
  }

  out.push('', '## Discontinued — do not recommend')
  for (const d of DISCONTINUED) out.push(`- ${d}`)

  out.push('', '## Principles')
  for (const p of PAYMENT_PRINCIPLES) out.push(`- ${p}`)
  return out.join('\n')
}
