import { formatMoney } from '../money'
import type { TxSuggestion } from '../types'

/**
 * How a saving is sized from what the user currently pays at a merchant each month:
 * - full: a free alternative replaces it entirely
 * - pct: a cheaper way typically cuts the bill by this share
 */
type Saving = { type: 'full' } | { type: 'pct'; pct: number }

interface CatalogueEntry {
  match: string[]
  /** Only apply to these categories (avoids e.g. "Amazon" Prime vs shopping mix-ups). */
  categories?: string[]
  kind: TxSuggestion['kind']
  title: string
  detail: string
  alternatives: string[]
  saving: Saving
}

const full: Saving = { type: 'full' }
const pct = (p: number): Saving => ({ type: 'pct', pct: p })

/**
 * Hand-picked free or cheaper alternatives for common merchants. Generic, well-known options only —
 * no coupon codes, no securities, nothing that needs credit. Savings are estimates from the user's
 * own spend and always shown as such.
 */
export const SUGGESTION_CATALOGUE: CatalogueEntry[] = [
  // ---- Software & SaaS ----
  {
    match: ['chatgpt', 'openai'],
    kind: 'free',
    title: 'Try the free AI tiers first',
    detail:
      'ChatGPT Free, Gemini and Claude all have free plans that cover everyday questions. Keep one paid plan only if you hit limits daily.',
    alternatives: ['ChatGPT Free', 'Google Gemini', 'Claude Free'],
    saving: full
  },
  {
    match: ['claude', 'anthropic', 'perplexity', 'gemini advanced', 'google one ai'],
    kind: 'free',
    title: 'Use a free AI tier, or keep just one paid assistant',
    detail:
      'Paying for more than one AI assistant is common and rarely needed. Free tiers handle most everyday use.',
    alternatives: ['ChatGPT Free', 'Gemini', 'Claude Free'],
    saving: full
  },
  {
    match: ['adobe'],
    kind: 'free',
    title: 'Free editors cover most Adobe work',
    detail:
      'Photopea runs Photoshop files in the browser, Canva handles social graphics, and DaVinci Resolve is a free pro video editor.',
    alternatives: ['Photopea', 'Canva Free', 'GIMP', 'DaVinci Resolve'],
    saving: full
  },
  {
    match: ['microsoft 365', 'microsoft', 'office 365'],
    categories: ['software', 'subscriptions'],
    kind: 'free',
    title: 'Free office suites do the same job',
    detail:
      'Google Docs, Sheets and Slides are free with 15 GB storage; LibreOffice works offline.',
    alternatives: ['Google Docs & Sheets', 'LibreOffice', 'Office on the web (free)'],
    saving: full
  },
  {
    match: ['dropbox', 'box com', 'pcloud'],
    kind: 'free',
    title: 'Use free cloud storage you already have',
    detail: 'Google Drive gives 15 GB free and OneDrive 5 GB. Clear large old files before paying.',
    alternatives: ['Google Drive (15 GB free)', 'OneDrive (5 GB free)'],
    saving: full
  },
  {
    match: ['notion'],
    kind: 'free',
    title: 'Notion’s free plan is enough for personal use',
    detail: 'The free plan has unlimited pages and blocks for one person.',
    alternatives: ['Notion Free', 'Obsidian (free)', 'Google Keep'],
    saving: full
  },
  {
    match: ['canva'],
    kind: 'free',
    title: 'Drop to Canva Free',
    detail: 'Canva Free has thousands of templates; most personal designs don’t need Pro.',
    alternatives: ['Canva Free', 'Adobe Express Free'],
    saving: full
  },
  {
    match: ['figma'],
    kind: 'free',
    title: 'Figma Starter or Penpot are free',
    detail:
      'Figma’s Starter plan covers personal projects; Penpot is a free open-source alternative.',
    alternatives: ['Figma Starter', 'Penpot'],
    saving: full
  },
  {
    match: ['github'],
    kind: 'free',
    title: 'GitHub Free includes private repos',
    detail: 'Unlimited private repositories and Actions minutes are free for individuals.',
    alternatives: ['GitHub Free'],
    saving: full
  },
  {
    match: ['zoom'],
    kind: 'free',
    title: 'Free video calls without time limits',
    detail: 'Google Meet (free up to 60 min groups, unlimited 1:1) and Jitsi Meet are free.',
    alternatives: ['Google Meet', 'Jitsi Meet', 'Microsoft Teams Free'],
    saving: full
  },
  {
    match: ['grammarly'],
    kind: 'free',
    title: 'Free writing checkers are good enough',
    detail: 'Grammarly’s free tier and LanguageTool catch most spelling and grammar issues.',
    alternatives: ['Grammarly Free', 'LanguageTool'],
    saving: full
  },
  {
    match: ['1password', 'lastpass', 'dashlane'],
    kind: 'free',
    title: 'Switch to a free password manager',
    detail:
      'Bitwarden is free across unlimited devices; Apple Passwords is built into your Mac and iPhone.',
    alternatives: ['Bitwarden', 'Apple Passwords'],
    saving: full
  },
  {
    match: ['nordvpn', 'expressvpn', 'surfshark', 'vpn'],
    categories: ['software', 'subscriptions'],
    kind: 'free',
    title: 'Proton VPN has a free plan',
    detail: 'Proton VPN Free has no data cap. Pay only if you need specific countries or speeds.',
    alternatives: ['Proton VPN Free'],
    saving: full
  },
  {
    match: ['linkedin'],
    categories: ['software', 'subscriptions'],
    kind: 'free',
    title: 'Pause LinkedIn Premium between job searches',
    detail: 'Turn it on only for the months you are actively applying.',
    alternatives: ['LinkedIn Free'],
    saving: full
  },
  {
    match: ['jetbrains'],
    kind: 'cheaper',
    title: 'VS Code is free',
    detail:
      'VS Code with extensions covers most languages; JetBrains also has free Community editions.',
    alternatives: ['VS Code', 'IntelliJ Community', 'PyCharm Community'],
    saving: full
  },
  {
    match: ['slack'],
    categories: ['software'],
    kind: 'free',
    title: 'Slack Free or Discord for small teams',
    detail: 'Small teams rarely need paid Slack; Discord and Slack Free cover chat and calls.',
    alternatives: ['Slack Free', 'Discord', 'Google Chat'],
    saving: full
  },
  {
    match: ['aws', 'amazon web services', 'google cloud', 'digitalocean', 'heroku', 'azure'],
    kind: 'habit',
    title: 'Check for idle cloud resources',
    detail:
      'Stopped-but-billed servers, old snapshots and unused IPs are the usual leaks. Small sites run free on Vercel, Netlify or Cloudflare Pages.',
    alternatives: ['Cloudflare Pages', 'Vercel Hobby', 'Netlify Free'],
    saving: pct(0.3)
  },
  // ---- Streaming & memberships ----
  {
    match: ['netflix'],
    kind: 'cheaper',
    title: 'Drop to a cheaper Netflix plan, or rotate',
    detail:
      'The Mobile/Basic plans cost far less than Premium. Or pause Netflix in months you watch less and switch to another service.',
    alternatives: ['Netflix Mobile/Basic', 'Rotate one service a month'],
    saving: pct(0.5)
  },
  {
    match: ['hotstar', 'disney', 'sonyliv', 'zee5', 'jiocinema', 'jio cinema', 'prime video'],
    kind: 'cheaper',
    title: 'Rotate streaming services instead of stacking them',
    detail:
      'Subscribe for the season you are watching, then cancel. One service at a time is usually enough.',
    alternatives: ['Rotate monthly', 'Free tiers with ads'],
    saving: pct(0.5)
  },
  {
    match: ['amazon prime'],
    categories: ['subscriptions'],
    kind: 'cheaper',
    title: 'Share Prime with your household',
    detail:
      'Prime benefits can be shared with another adult at home; pay annually rather than monthly.',
    alternatives: ['Household sharing', 'Annual plan'],
    saving: pct(0.4)
  },
  {
    match: ['spotify', 'apple music', 'youtube music', 'gaana', 'wynk'],
    kind: 'free',
    title: 'Free music tiers, or split a family plan',
    detail:
      'Spotify Free and JioSaavn have free tiers with ads; a Duo/Family plan split costs much less per person.',
    alternatives: ['Spotify Free', 'JioSaavn Free', 'Duo/Family plan split'],
    saving: pct(0.6)
  },
  {
    match: ['youtube premium', 'youtubepremium', 'google youtube'],
    kind: 'cheaper',
    title: 'Split a YouTube Premium Family plan',
    detail: 'A family plan shared with up to 5 people costs much less per person.',
    alternatives: ['YouTube Premium Family', 'YouTube Free'],
    saving: pct(0.6)
  },
  {
    match: ['kindle unlimited', 'audible', 'scribd'],
    kind: 'free',
    title: 'Read free first',
    detail:
      'Project Gutenberg, public-library apps and free Kindle titles cover a lot before paying monthly.',
    alternatives: ['Project Gutenberg', 'Library apps', 'Free Kindle books'],
    saving: full
  },
  {
    match: ['tata play', 'tataplay', 'dish tv', 'dishtv', 'd2h', 'airtel digital tv', 'sun direct'],
    kind: 'cheaper',
    title: 'Trim or drop the DTH pack',
    detail: 'If you mostly stream, a smaller channel pack (or none) saves the most.',
    alternatives: ['Smaller channel pack', 'Free-to-air', 'Streaming only'],
    saving: pct(0.5)
  },
  {
    match: ['cult fit', 'cultfit', 'curefit', 'gold s gym', 'anytime fitness', 'gym'],
    kind: 'cheaper',
    title: 'Pay per class, or train free',
    detail:
      'If you go less than twice a week, pay-per-session or free home/running routines cost less.',
    alternatives: ['Pay per session', 'Nike Training Club (free)', 'Running / park workouts'],
    saving: pct(0.5)
  },
  // ---- Everyday spending ----
  {
    match: ['swiggy', 'zomato', 'uber eats', 'eatsure', 'magicpin'],
    categories: ['dining'],
    kind: 'habit',
    title: 'Pick up, or cook two more meals a week',
    detail:
      'Delivery, platform and packaging fees add ~20–30% to the menu price. Self-pickup and home cooking cut that.',
    alternatives: ['Self-pickup', 'Cook at home', 'Restaurant direct ordering'],
    saving: pct(0.3)
  },
  {
    match: [
      'starbucks',
      'third wave',
      'blue tokai',
      'costa',
      'cafe coffee day',
      'chaayos',
      'tim hortons'
    ],
    kind: 'cheaper',
    title: 'Brew at home on weekdays',
    detail: 'A home pour-over or instant coffee costs a fraction of a café cup.',
    alternatives: ['Home brew', 'Office coffee'],
    saving: pct(0.6)
  },
  {
    match: ['dominos', 'domino s', 'pizza hut', 'mcdonald', 'kfc', 'burger king', 'subway'],
    kind: 'habit',
    title: 'Use takeaway and in-app offers',
    detail: 'Takeaway skips delivery charges; chains run regular app-only deals.',
    alternatives: ['Takeaway', 'App deals'],
    saving: pct(0.2)
  },
  {
    match: ['blinkit', 'zepto', 'instamart', 'bbnow', 'swiggy instamart', 'flipkart minutes'],
    kind: 'cheaper',
    title: 'Plan one weekly shop instead of quick orders',
    detail:
      'Quick-commerce adds fees and impulse buys. A weekly list at DMart or BigBasket is usually cheaper.',
    alternatives: ['DMart', 'BigBasket scheduled delivery', 'Local kirana'],
    saving: pct(0.15)
  },
  {
    match: ['uber', 'ola', 'blusmart'],
    categories: ['transport'],
    kind: 'cheaper',
    title: 'Compare bike/auto apps and the metro',
    detail: 'Rapido, Namma Yatri and the metro are often much cheaper for short city trips.',
    alternatives: ['Rapido', 'Namma Yatri', 'Metro / bus'],
    saving: pct(0.3)
  },
  {
    match: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'tata cliq'],
    categories: ['shopping'],
    kind: 'habit',
    title: 'Use a 48-hour cart rule and price history',
    detail:
      'Waiting two days removes most impulse buys; sale events and price trackers catch better prices.',
    alternatives: ['48-hour wait', 'Price-history tracker', 'Sale events'],
    saving: pct(0.15)
  },
  {
    match: ['bookmyshow', 'pvr', 'inox', 'cinepolis', 'paytm movies', 'paytm insider', 'district'],
    kind: 'cheaper',
    title: 'Go on discount days and use card offers',
    detail: 'Weekday shows, Tuesday pricing and bank card buy-one-get-one offers cut ticket costs.',
    alternatives: ['Weekday / Tuesday shows', 'Card BOGO offers'],
    saving: pct(0.3)
  },
  {
    match: ['airtel', 'jio', 'vodafone', 'vi ', 'bsnl', 'act fibernet', 'hathway'],
    categories: ['utilities'],
    kind: 'cheaper',
    title: 'Check for a cheaper or annual plan',
    detail:
      'Annual prepaid and bundled family plans usually cost less per month than monthly recharges.',
    alternatives: ['Annual plan', 'Family/bundle plan'],
    saving: pct(0.15)
  }
]

const FEE_RULES: { match: string[]; title: string; detail: string; alternatives: string[] }[] = [
  {
    match: ['late', 'overdue', 'penal', 'penalty'],
    title: 'Avoid this with autopay',
    detail: 'Late fees disappear with autopay for at least the minimum due.',
    alternatives: ['Autopay full amount', 'Calendar reminder']
  },
  {
    match: ['min bal', 'minimum balance', 'non maintenance', 'nmc', 'amb'],
    title: 'Avoid minimum-balance charges',
    detail:
      'Keep the average balance above the limit, or move this account to a zero-balance variant.',
    alternatives: ['Zero-balance account', 'Balance alert']
  },
  {
    match: ['markup', 'forex', 'cross currency', 'dcc', 'intl'],
    title: 'Avoid foreign-exchange markup',
    detail:
      'Pay in the local currency and use a card with low or zero forex markup for foreign spends.',
    alternatives: ['Pay in local currency', 'Low-forex card']
  },
  {
    match: ['atm', 'cash withdrawal fee', 'decline'],
    title: 'Avoid ATM charges',
    detail: 'Stay within free monthly ATM withdrawals and use UPI where possible.',
    alternatives: ['UPI payments', 'Own-bank ATM']
  },
  {
    match: ['finance charge', 'interest', 'int on', 'retail int'],
    title: 'Card interest is the most expensive money',
    detail:
      'Interest is charged when the full card bill isn’t paid. Paying the full statement amount avoids it.',
    alternatives: ['Pay full statement balance', 'Autopay full amount']
  }
]

const lower = (s: string): string =>
  ` ${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

function matches(name: string, needles: string[]): boolean {
  const n = lower(name)
  return needles.some((k) => n.includes(lower(k)))
}

/** Minimum monthly saving worth showing (in minor units of the currency). */
const MIN_SAVING_MINOR = 5_000

/**
 * The saving suggestion for one merchant, sized from what the user pays there per month.
 * Returns null when there's nothing useful to say — the UI then shows nothing.
 */
export function suggestionFor(
  merchant: string,
  description: string,
  categoryId: string | null,
  monthlyMinor: number,
  currency: string
): TxSuggestion | null {
  if (monthlyMinor <= 0) return null
  const fmt = (m: number): string => formatMoney(m, currency)

  if (categoryId === 'fees') {
    const rule =
      FEE_RULES.find((r) => matches(`${merchant} ${description}`, r.match)) ??
      ({
        title: 'Ask your bank to reverse it',
        detail: 'One-off charges are often reversed if you ask, especially the first time.',
        alternatives: ['Request a reversal']
      } as const)
    return {
      kind: 'avoid',
      title: rule.title,
      detail: rule.detail,
      alternatives: [...rule.alternatives],
      monthlySavingMinor: monthlyMinor,
      basis: `${fmt(monthlyMinor)}/month in charges like this`,
      source: 'catalogue'
    }
  }

  const entry = SUGGESTION_CATALOGUE.find(
    (e) =>
      (!e.categories || (categoryId != null && e.categories.includes(categoryId))) &&
      matches(merchant, e.match)
  )
  if (!entry) return null
  const saving =
    entry.saving.type === 'full' ? monthlyMinor : Math.round(monthlyMinor * entry.saving.pct)
  if (saving < MIN_SAVING_MINOR) return null
  return {
    kind: entry.kind,
    title: entry.title,
    detail: entry.detail,
    alternatives: entry.alternatives,
    monthlySavingMinor: saving,
    basis:
      entry.saving.type === 'full'
        ? `You pay about ${fmt(monthlyMinor)}/month here`
        : `About ${Math.round(entry.saving.pct * 100)}% of the ${fmt(monthlyMinor)}/month you spend here`,
    source: 'catalogue'
  }
}

/** Groups used to spot paying twice for the same thing. */
export const OVERLAP_GROUPS: { label: string; match: string[] }[] = [
  {
    label: 'video streaming',
    match: [
      'netflix',
      'hotstar',
      'disney',
      'prime video',
      'sonyliv',
      'zee5',
      'jiocinema',
      'youtube premium',
      'apple tv'
    ]
  },
  { label: 'music', match: ['spotify', 'apple music', 'youtube music', 'gaana', 'wynk'] },
  {
    label: 'AI assistants',
    match: ['chatgpt', 'openai', 'claude', 'anthropic', 'perplexity', 'gemini advanced', 'copilot']
  },
  { label: 'cloud storage', match: ['dropbox', 'icloud', 'google one', 'onedrive', 'pcloud'] }
]

export function overlapGroup(merchant: string): string | null {
  return OVERLAP_GROUPS.find((g) => matches(merchant, g.match))?.label ?? null
}
