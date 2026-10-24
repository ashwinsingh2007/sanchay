import { create } from 'zustand'

/**
 * Light (default), dark, or following macOS. The choice is a per-device preference, so it lives in
 * localStorage; the stylesheet keys everything off `html[data-theme]` (always light or dark).
 */
export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'
/** Visual personality on top of the same tokens and meanings (see DESIGN.md). */
export type Style =
  | 'paper'
  | 'studio'
  | 'ocean'
  | 'graphite'
  | 'terminal'
  | 'neo'
  | 'catppuccin'
  | 'nord'
  | 'dracula'
  | 'rosepine'
  | 'tokyonight'
  | 'solarized'
  | 'gruvbox'
  | 'glass'
  | 'material'
  | 'fluent'
  | 'swiss'
  | 'aero'
  | 'neumorph'

const KEY = 'cfo-theme'
const STYLE_KEY = 'cfo-style'
/** Name, one-line feel and light-theme preview colours (sidebar, canvas, card, accent). */
export const STYLE_META: Record<
  Style,
  { name: string; note: string; preview: [string, string, string, string] }
> = {
  paper: {
    name: 'Paper',
    note: 'Warm neutrals, plum, soft serif titles',
    preview: ['#ebe7df', '#f5f3ef', '#fdfcfa', '#7a3b6c']
  },
  studio: {
    name: 'Studio',
    note: 'Neutral zinc, teal, calm',
    preview: ['#e9e9ec', '#f4f4f5', '#ffffff', '#0f766e']
  },
  ocean: {
    name: 'Ocean',
    note: 'Cool blue-slate, sky blue',
    preview: ['#e4ebf2', '#f4f7fa', '#ffffff', '#0b6aa2']
  },
  graphite: {
    name: 'Graphite',
    note: 'Pure greys, violet, tool-like',
    preview: ['#ececec', '#f6f6f6', '#ffffff', '#6e56cf']
  },
  terminal: {
    name: 'Terminal',
    note: 'TradingView-like, blue, dense',
    preview: ['#e3e8f2', '#f0f3fa', '#ffffff', '#2962ff']
  },
  neo: {
    name: 'Neo',
    note: 'CRED NeoPOP: black, neon lime, hard edges',
    preview: ['#0d0d0d', '#f3f3ee', '#ffffff', '#e5fe40']
  },
  catppuccin: {
    name: 'Catppuccin',
    note: 'Soothing pastels (Latte / Mocha)',
    preview: ['#e6e9ef', '#eff1f5', '#ffffff', '#8839ef']
  },
  nord: {
    name: 'Nord',
    note: 'Arctic blues and greys',
    preview: ['#e5e9f0', '#eceff4', '#f8f9fb', '#5e81ac']
  },
  dracula: {
    name: 'Dracula',
    note: 'Purple night, pink and green',
    preview: ['#21222c', '#282a36', '#303241', '#bd93f9']
  },
  rosepine: {
    name: 'Rosé Pine',
    note: 'Muted rose and pine (Dawn / Moon)',
    preview: ['#f2e9e1', '#faf4ed', '#fffaf3', '#d7827e']
  },
  tokyonight: {
    name: 'Tokyo Night',
    note: 'City lights at night',
    preview: ['#16161e', '#1a1b26', '#1f2335', '#bb9af7']
  },
  solarized: {
    name: 'Solarized',
    note: 'The classic balanced palette',
    preview: ['#eee8d5', '#fdf6e3', '#fffbf0', '#268bd2']
  },
  gruvbox: {
    name: 'Gruvbox',
    note: 'Retro warm browns',
    preview: ['#f2e5bc', '#fbf1c7', '#f9f5d7', '#af3a03']
  },
  glass: {
    name: 'Liquid Glass',
    note: 'Apple-style frosted glass',
    preview: ['#dfe8f7', '#e9eef8', '#f5f7fc', '#0a84ff']
  },
  material: {
    name: 'Material You',
    note: 'Google: tonal, pill buttons',
    preview: ['#f3edf7', '#fef7ff', '#f7f2fa', '#6750a4']
  },
  fluent: {
    name: 'Fluent',
    note: 'Microsoft: neutral layers',
    preview: ['#f0f0f0', '#fafafa', '#ffffff', '#0f6cbd']
  },
  swiss: {
    name: 'Swiss',
    note: 'Editorial black and white, bold type',
    preview: ['#f2f2f2', '#ffffff', '#ffffff', '#111111']
  },
  aero: {
    name: 'Frutiger Aero',
    note: 'Y2K sky blue and glossy aqua',
    preview: ['#d9f0ff', '#bfe6ff', '#ffffff', '#0a8ae0']
  },
  neumorph: {
    name: 'Neumorphism',
    note: 'Soft extruded shapes (low contrast)',
    preview: ['#e6e9ef', '#e6e9ef', '#e6e9ef', '#5b6cf0']
  }
}
const STYLES = Object.keys(STYLE_META) as Style[]

/** CSS variable behind each chart colour. */
const VARS = {
  accent: '--color-cold',
  /** Investments / wealth. */
  cold: '--color-cold',
  /** Income, savings, gains. */
  cool: '--color-cool',
  /** Spending. */
  warm: '--color-warm',
  /** Overspending, losses. */
  hot: '--color-hot',
  prev: '--color-ink-3',
  grid: '--color-line',
  dotStroke: '--color-surface',
  refLine: '--color-line-strong',
  hoverFill: '--color-sunken',
  tick: '--color-ink-3',
  empty: '--color-sunken'
} as const

let cache: Record<keyof typeof VARS, string> | null = null

/**
 * Colours for SVG charts, which can't use CSS variables in presentation attributes. Read from the
 * stylesheet on first use after each theme change, so charts and CSS never drift apart.
 */
export const PAL = new Proxy({} as Record<keyof typeof VARS, string>, {
  get(_t, key: keyof typeof VARS) {
    if (!cache) {
      // Tokens can be expressions (color-mix, var()); paint them on a probe element so the
      // browser resolves each to a concrete colour that SVG attributes accept.
      const probe = document.createElement('span')
      probe.style.display = 'none'
      document.body.appendChild(probe)
      cache = Object.fromEntries(
        Object.entries(VARS).map(([k, v]) => {
          probe.style.color = `var(${v})`
          return [k, getComputedStyle(probe).color || '#888']
        })
      ) as Record<keyof typeof VARS, string>
      probe.remove()
    }
    return cache[key]
  }
})

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'system' ? v : 'light'
  } catch {
    return 'light'
  }
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const resolve = (mode: ThemeMode): Theme =>
  mode === 'system' ? (darkQuery.matches ? 'dark' : 'light') : mode

function readStyle(): Style {
  try {
    const s = localStorage.getItem(STYLE_KEY) as Style | null
    return s && STYLES.includes(s) ? s : 'paper'
  } catch {
    return 'paper'
  }
}

function apply(theme: Theme, style: Style): void {
  document.documentElement.dataset['theme'] = theme
  document.documentElement.dataset['style'] = style
  cache = null
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* preference just won't persist */
  }
}

export const useTheme = create<{
  /** What the user picked. */
  mode: ThemeMode
  /** What is showing now (system resolved to light or dark). */
  theme: Theme
  style: Style
  setMode: (m: ThemeMode) => void
  setStyle: (s: Style) => void
}>((set, get) => {
  const mode = read()
  const initial = { mode, theme: resolve(mode), style: readStyle() }
  apply(initial.theme, initial.style)
  // Follow macOS when it switches between light and dark.
  darkQuery.addEventListener('change', () => {
    if (get().mode !== 'system') return
    const theme = resolve('system')
    apply(theme, get().style)
    set({ theme })
  })
  return {
    ...initial,
    setMode: (mode) => {
      save(KEY, mode)
      const theme = resolve(mode)
      apply(theme, get().style)
      set({ mode, theme })
    },
    setStyle: (style) => {
      save(STYLE_KEY, style)
      apply(get().theme, style)
      set({ style })
    }
  }
})
