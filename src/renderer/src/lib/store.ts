import { create } from 'zustand'
import type { Category, ParsedCsv, TransactionFilter, UserFinancialSettings } from '@shared/types'
import type { MonthInfo } from '@shared/types'

export type ImportKind = 'statement' | 'payslip'

export type Page =
  | 'home'
  | 'ai'
  | 'savings'
  | 'steps'
  | 'flow'
  | 'categories'
  | 'recurring'
  | 'investments'
  | 'accounts'
  | 'goals'
  | 'freedom'
  | 'sources'
  | 'statements'
  | 'profile'
  | 'settings'

interface Toast {
  id: number
  message: string
  tone: 'default' | 'error'
}

interface UiState {
  page: Page
  month: string | null
  months: MonthInfo[]
  settings: UserFinancialSettings | null
  categories: Category[]
  /** Bumped after any mutation so screens refetch. */
  version: number
  importOpen: boolean
  importKind: ImportKind
  importInitial: ParsedCsv | null
  transactionPreset: TransactionFilter | null
  /** Prompt to pre-fill in the AI CFO composer when navigating there. */
  aiDraft: string | null
  /** Send the draft straight away instead of just pre-filling it. */
  aiSend: boolean
  /** The open AI CFO conversation (null = a new one). Kept while you move around the app. */
  chatId: string | null
  setChatId: (id: string | null) => void
  askAi: (prompt: string, send?: boolean) => void
  toasts: Toast[]

  go: (page: Page, preset?: TransactionFilter | null) => void
  setMonth: (month: string) => void
  setMonths: (months: MonthInfo[]) => void
  setSettings: (settings: UserFinancialSettings) => void
  setCategories: (categories: Category[]) => void
  bump: () => void
  openImport: (initial?: ParsedCsv | null, kind?: ImportKind) => void
  closeImport: () => void
  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

let toastId = 0

export const useUi = create<UiState>((set) => ({
  page: 'home',
  month: null,
  months: [],
  settings: null,
  categories: [],
  version: 0,
  importOpen: false,
  importKind: 'statement',
  importInitial: null,
  transactionPreset: null,
  aiDraft: null,
  aiSend: false,
  // Questions asked from elsewhere in the app start their own conversation.
  askAi: (prompt, send = false) => set({ page: 'ai', aiDraft: prompt, aiSend: send, chatId: null }),
  chatId: null,
  setChatId: (chatId) => set({ chatId }),
  toasts: [],

  go: (page, preset = null) => set({ page, transactionPreset: preset }),
  setMonth: (month) => set({ month }),
  setMonths: (months) => set({ months }),
  setSettings: (settings) => set({ settings }),
  setCategories: (categories) => set({ categories }),
  bump: () => set((s) => ({ version: s.version + 1 })),
  openImport: (initial = null, kind = 'statement') =>
    set({ importOpen: true, importInitial: initial, importKind: kind }),
  closeImport: () => set({ importOpen: false, importInitial: null }),
  toast: (message, tone = 'default') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
