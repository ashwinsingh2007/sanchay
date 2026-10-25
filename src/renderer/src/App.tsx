import {
  ArrowDownUp,
  PieChart,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Landmark,
  ListChecks,
  Lock,
  Monitor,
  Mountain,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  Plug,
  Sun,
  Target,
  UserRound,
  Settings,
  Sparkles,
  X
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { addMonths, monthLabel, todayISO, toMonthKey } from '@shared/dates'
import { Logo } from './components/Logo'
import { Spinner } from './components/ui'
import { SidebarAccounts } from './components/SidebarAccounts'
import { ImportWizard } from './pages/ImportWizard'
import { AccountsPage } from './pages/Accounts'
import { AiCfoPage } from './pages/AiCfo'
import { FlowPage } from './pages/Flow'
import { CategoriesPage } from './pages/Categories'
import { RecurringPage } from './pages/Recurring'
import { InvestmentsPage } from './pages/Investments'
import { TodayPage } from './pages/Today'
import { Onboarding } from './pages/Onboarding'
import { SavingsPage } from './pages/Savings'
import { StepsPage } from './pages/Steps'
import { SettingsPage } from './pages/Settings'
import { DataSourcesPage } from './pages/DataSources'
import { StatementsPage } from './pages/Statements'
import { ProfilePage } from './pages/Profile'
import { GoalsPage } from './pages/Goals'
import { FreedomPage } from './pages/Freedom'
import { useTheme, type ThemeMode } from './lib/theme'
import { useUi, type Page } from './lib/store'
import { useQuery } from './lib/hooks'
import { api, cn } from './lib/utils'

const NAV: { page: Page; label: string; icon: ReactNode; group?: string }[] = [
  { page: 'home', label: 'Today', icon: <Sun className="size-4" /> },
  { page: 'ai', label: 'Ask Sanchay', icon: <Sparkles className="size-4" /> },
  { page: 'steps', label: 'Next moves', icon: <ListChecks className="size-4" />, group: 'Plan' },
  { page: 'savings', label: 'Save more', icon: <PiggyBank className="size-4" /> },
  { page: 'goals', label: 'Goals', icon: <Target className="size-4" /> },
  { page: 'freedom', label: 'Freedom', icon: <Mountain className="size-4" /> },
  { page: 'flow', label: 'Transactions', icon: <ArrowDownUp className="size-4" />, group: 'Money' },
  { page: 'categories', label: 'Categories', icon: <PieChart className="size-4" /> },
  { page: 'accounts', label: 'Accounts', icon: <Landmark className="size-4" /> },
  {
    page: 'investments',
    label: 'Investments',
    icon: <TrendingUp className="size-4" />,
    group: 'Wealth'
  },
  { page: 'profile', label: 'Money profile', icon: <UserRound className="size-4" />, group: 'You' },
  { page: 'sources', label: 'Data sources', icon: <Plug className="size-4" /> },
  { page: 'settings', label: 'Settings', icon: <Settings className="size-4" /> }
]

/** Pages whose content follows the selected month. */
const MONTH_PAGES = new Set<Page>(['home', 'steps', 'savings', 'flow', 'categories'])

/** Loads settings, categories and months; keeps months fresh after every data change. */
function useBootstrap(): { ready: boolean; error: string | null } {
  const { setSettings, setCategories, setMonths, setMonth } = useUi.getState()
  const version = useUi((s) => s.version)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getSettings(), api.listCategories(), api.listMonths()])
      .then(([settings, categories, months]) => {
        if (cancelled) return
        setSettings(settings)
        setCategories(categories)
        setMonths(months.months)
        const current = useUi.getState().month
        if (
          !current ||
          (months.months.length > 0 && !months.months.some((m) => m.month === current))
        ) {
          setMonth(months.defaultMonth)
        }
        setReady(true)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [version, setSettings, setCategories, setMonths, setMonth])

  return { ready, error }
}

function MonthSwitcher(): React.JSX.Element {
  const { month, months, setMonth } = useUi()
  const current = month ?? toMonthKey(todayISO())
  const earliest = months[months.length - 1]?.month
  const latest = months[0]?.month ?? current
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface p-0.5 shadow-sm ring-1 ring-line">
      <button
        className="rounded-md p-1.5 text-ink-3 hover:bg-sunken hover:text-ink disabled:opacity-30"
        onClick={() => setMonth(addMonths(current, -1))}
        disabled={!earliest || current <= earliest}
        aria-label="Previous month"
      >
        <ChevronLeft className="size-4" />
      </button>
      <label className="sr-only" htmlFor="month-select">
        Selected month
      </label>
      <select
        id="month-select"
        className="h-7 appearance-none bg-transparent px-1 text-center text-[13px] font-medium text-ink focus:outline-none [&>option]:text-ink"
        value={current}
        onChange={(e) => setMonth(e.target.value)}
      >
        {(months.length ? months.map((m) => m.month) : [current]).map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <button
        className="rounded-md p-1.5 text-ink-3 hover:bg-sunken hover:text-ink disabled:opacity-30"
        onClick={() => setMonth(addMonths(current, 1))}
        disabled={current >= latest}
        aria-label="Next month"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

const THEME_MODES: { mode: ThemeMode; label: string; icon: ReactNode }[] = [
  { mode: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
  { mode: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
  { mode: 'system', label: 'System', icon: <Monitor className="size-3.5" /> }
]

/** Light / Dark / System, at the foot of the sidebar. */
function ThemeSwitch({ vertical = false }: { vertical?: boolean }): React.JSX.Element {
  const { mode, setMode } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'no-drag mt-3 flex w-fit shrink-0 gap-0.5 rounded-full bg-ink/[0.05] p-0.5',
        vertical && 'mx-auto flex-col'
      )}
    >
      {THEME_MODES.map((t) => (
        <button
          key={t.mode}
          role="radio"
          aria-checked={mode === t.mode}
          onClick={() => setMode(t.mode)}
          aria-label={t.label}
          title={t.mode === 'system' ? 'System (follow macOS)' : t.label}
          className={cn(
            'flex size-7 items-center justify-center rounded-full transition-colors',
            mode === t.mode ? 'bg-accent-soft text-accent-ink' : 'text-ink-3 hover:text-ink'
          )}
        >
          {t.icon}
        </button>
      ))}
    </div>
  )
}

const SIDEBAR_KEY = 'cfo-sidebar-collapsed'

/** Sidebar collapsed to an icon rail; remembered per device, toggled with ⌘B. */
function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = (): void =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1')
      } catch {
        /* preference just won't persist */
      }
      return !c
    })
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return [collapsed, toggle]
}

function Toasts(): React.JSX.Element {
  const { toasts, dismissToast } = useUi()
  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'animate-fade-up pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-[13px] shadow-[3px_3px_0_0_var(--color-line-strong)]',
            t.tone === 'error' ? 'bg-negative text-on-color' : 'bg-raised text-ink'
          )}
          role={t.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="opacity-70 hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default function App(): React.JSX.Element {
  const { ready, error } = useBootstrap()
  const { page, go, settings, importOpen } = useUi()
  const { theme, style } = useTheme()
  const sources = useQuery(() => api.listDataSources(false))
  const [collapsed, toggleSidebar] = useSidebarCollapsed()

  if (error)
    return (
      <div className="p-10 text-sm text-negative">Could not open the local database: {error}</div>
    )
  if (!ready || !settings) return <Spinner label="Opening your local data" />

  if (!settings.onboardingComplete) {
    return (
      <>
        <Onboarding />
        {importOpen && <ImportWizard />}
        <Toasts />
      </>
    )
  }

  const pages: Record<Page, ReactNode> = {
    home: <TodayPage />,
    ai: <AiCfoPage />,
    savings: <SavingsPage />,
    steps: <StepsPage />,
    flow: <FlowPage />,
    categories: <CategoriesPage />,
    recurring: <RecurringPage />,
    investments: <InvestmentsPage />,
    accounts: <AccountsPage />,
    goals: <GoalsPage />,
    freedom: <FreedomPage />,
    sources: <DataSourcesPage />,
    statements: <StatementsPage />,
    profile: <ProfilePage />,
    settings: <SettingsPage />
  }
  const connected = (sources.data ?? [])
    .filter((x) => x.connected && x.enabled && x.auth !== 'none')
    .map((x) => x.name)
  const isCloudAi =
    settings.aiProvider === 'claude_code' ||
    settings.aiProvider === 'gemini' ||
    settings.aiProvider === 'anthropic' ||
    settings.aiProvider === 'openai'

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'chrome drag flex shrink-0 flex-col overflow-hidden pb-4 pt-12 text-white transition-[width] duration-200 [&_*:focus-visible]:outline-white',
          // 88px clears the macOS window buttons in the collapsed rail.
          collapsed ? 'w-[88px] px-3' : 'w-[228px] px-3'
        )}
      >
        <div className={cn('mb-4 flex items-center gap-2.5', collapsed ? 'flex-col px-0' : 'px-2')}>
          <Logo className="size-8 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight tracking-tight">Sanchay</p>
              <p className="text-[11px] text-white/70">AI money manager</p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="no-drag rounded-md p-1.5 text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>
        <nav
          className="no-drag -mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-3"
          aria-label="Main"
        >
          {NAV.map((item) => {
            const active = page === item.page || (item.page === 'sources' && page === 'statements')
            return (
              <div key={item.page}>
                {item.group &&
                  (collapsed ? (
                    <div className="mx-2 my-2.5 h-px bg-line" aria-hidden />
                  ) : (
                    <p className="mb-1 mt-3 px-2.5 text-[10.5px] font-semibold eyebrow text-white/50">
                      {item.group.trim()}
                    </p>
                  ))}
                <button
                  onClick={() => go(item.page)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md py-[7px] text-left text-[13.5px] transition-colors',
                    collapsed ? 'justify-center px-0 py-2' : 'px-2.5',
                    active
                      ? 'bg-accent-soft font-medium text-accent-ink'
                      : 'text-ink-2 hover:bg-ink/[0.05] hover:text-ink'
                  )}
                >
                  <span className={active ? 'text-accent-ink' : 'text-ink-3'}>{item.icon}</span>
                  {!collapsed && item.label}
                </button>
              </div>
            )
          })}
          {!collapsed && <SidebarAccounts />}
        </nav>
        {collapsed ? (
          <button
            onClick={() => go('settings')}
            className="no-drag mx-auto mt-3 shrink-0 rounded-lg p-2 text-ink-3 ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
            aria-label="Private by design"
            title="Private by design: statements and payslips stay on this Mac."
          >
            <Lock className="size-4" />
          </button>
        ) : (
          <button
            onClick={() => go('settings')}
            className="no-drag mt-3 shrink-0 rounded-xl bg-surface p-3 text-left ring-1 ring-line transition-colors hover:ring-line-strong"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <Lock className="size-3" aria-hidden /> Private by design
            </p>
            <p className="mt-1 text-[11px] leading-snug text-ink-3">
              Statements and payslips stay on this Mac.
              {isCloudAi &&
                ' Chats send a summary to your AI, with names, IDs and account numbers masked.'}
              {connected.length > 0 && ` Read-only: ${connected.join(', ')}.`}
            </p>
          </button>
        )}
        <ThemeSwitch vertical={collapsed} />
      </aside>

      <div className="bg-app relative flex min-w-0 flex-1 flex-col">
        {/* Window drag handle along the top edge (there is no title bar). Controls under it opt
            out with no-drag; it ignores the mouse so clicks still reach the page. */}
        <div className="drag pointer-events-none absolute inset-x-0 top-0 z-20 h-7" aria-hidden />
        {/* Remount on theme change so charts pick up the new palette. */}
        <main key={`${theme}-${style}`} className="min-h-0 flex-1 overflow-y-auto">
          {page === 'ai' ? (
            <div className="h-full">{pages[page]}</div>
          ) : (
            <div className="mx-auto max-w-[1180px] px-8 py-7">
              {MONTH_PAGES.has(page) && (
                <div className="mb-3 flex justify-end">
                  <MonthSwitcher />
                </div>
              )}
              {pages[page]}
            </div>
          )}
        </main>
      </div>
      {importOpen && <ImportWizard />}
      <Toasts />
    </div>
  )
}
