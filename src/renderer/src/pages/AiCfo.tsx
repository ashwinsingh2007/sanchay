import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ArrowUp,
  Cloud,
  Cpu,
  Lock,
  PanelRight,
  PiggyBank,
  Plug,
  ReceiptText,
  ShieldCheck,
  Square,
  SquarePen,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  Wrench,
  X
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatMoney } from '@shared/money'
import { isIndia } from '@shared/region'
import type { AiStatus, ChatMessage, Conversation } from '@shared/types'
import { AiSetup } from '../components/AiSetup'
import { Logo } from '../components/Logo'
import { VoiceButton } from '../components/VoiceButton'
import { Button, Card, Spinner } from '../components/ui'
import { useCurrency } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

type Starter = { icon: ReactNode; title: string; prompt: string }

/** The four cards on a new chat, then a few more questions as chips. */
const STARTERS: Record<'india' | 'global', { cards: Starter[]; more: string[] }> = {
  india: {
    cards: [
      {
        icon: <PiggyBank className="size-4" />,
        title: 'Save more',
        prompt: 'Where can I save ₹5,000 next month?'
      },
      {
        icon: <TrendingUp className="size-4" />,
        title: 'Investments',
        prompt: 'Review my portfolio — what should I change?'
      },
      {
        icon: <Target className="size-4" />,
        title: 'Goals',
        prompt: 'Am I on track for my goals?'
      },
      {
        icon: <ShieldCheck className="size-4" />,
        title: 'Protection',
        prompt: 'Am I adequately insured for my family?'
      }
    ],
    more: [
      'Where should I put the idle cash in my savings account?',
      'Which of my mutual funds are underperforming?'
    ]
  },
  global: {
    cards: [
      {
        icon: <PiggyBank className="size-4" />,
        title: 'Save more',
        prompt: 'Where can I save $300 next month?'
      },
      {
        icon: <ReceiptText className="size-4" />,
        title: 'Spending',
        prompt: 'Why did I spend more last month?'
      },
      {
        icon: <Target className="size-4" />,
        title: 'Goals',
        prompt: 'Am I on track for my goals?'
      },
      {
        icon: <ShieldCheck className="size-4" />,
        title: 'Safety net',
        prompt: 'How big should my emergency fund be?'
      }
    ],
    more: ['Which subscriptions should I cut?']
  }
}

/** Renders **bold**, `code` and line breaks safely (no HTML injection). */
function inline(text: string): ReactNode[] {
  return text
    .split(
      /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|(?<!\w)\*[^*\s][^*]*\*(?!\w)|(?<!\w)_[^_\s][^_]*_(?!\w))/g
    )
    .map((part, i) => {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
      if (link)
        // https links open in the system browser (see the window-open handler in main).
        return (
          <a
            key={i}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="text-accent-ink underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            {link[1]}
          </a>
        )
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>
      if (/^`[^`]+`$/.test(part))
        return (
          <code key={i} className="rounded bg-ink/[0.06] px-1 text-[0.92em]">
            {part.slice(1, -1)}
          </code>
        )
      if (/^(\*[^*]+\*|_[^_]+_)$/.test(part))
        return (
          <em key={i} className="text-ink-2">
            {part.slice(1, -1)}
          </em>
        )
      return <Fragment key={i}>{part}</Fragment>
    })
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/** Cells of a `| a | b |` row (outer pipes optional, `\|` stays a literal pipe). */
const tableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))

type Align = 'left' | 'center' | 'right'

function Table({
  header,
  align,
  rows
}: {
  header: string[]
  align: Align[]
  rows: string[][]
}): React.JSX.Element {
  const cls = (i: number): string =>
    align[i] === 'right' ? 'text-right' : align[i] === 'center' ? 'text-center' : 'text-left'
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-[0.93em] leading-snug">
        <thead className="bg-sunken">
          <tr>
            {header.map((h, i) => (
              <th key={i} className={cn('px-3 py-2 font-semibold text-ink-2', cls(i))}>
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-line">
              {header.map((_, ci) => (
                <td key={ci} className={cn('num px-3 py-2 align-top', cls(ci))}>
                  {inline(r[ci] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Minimal markdown: headings, lists, tables, code blocks, rules, paragraphs. */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = (): void => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag
        key={blocks.length}
        className={cn('space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}
      >
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>
    )
    list = null
  }
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!.trimEnd()

    // Fenced code block: everything up to the closing fence, verbatim.
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      while (++n < lines.length && !/^\s*```/.test(lines[n]!)) code.push(lines[n]!)
      blocks.push(
        <pre
          key={blocks.length}
          className="overflow-x-auto rounded-lg bg-ink/[0.05] px-3 py-2 text-[0.88em] leading-snug"
        >
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Table: a pipe row followed by a |---|:--:| separator row.
    const next = lines[n + 1]
    if (line.includes('|') && next !== undefined && TABLE_SEPARATOR.test(next)) {
      flush()
      const header = tableCells(line)
      const align: Align[] = tableCells(next).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'
      )
      const rows: string[][] = []
      n += 1
      while (n + 1 < lines.length && lines[n + 1]!.includes('|') && lines[n + 1]!.trim()) {
        n += 1
        rows.push(tableCells(lines[n]!))
      }
      blocks.push(<Table key={blocks.length} header={header} align={align} rows={rows} />)
      continue
    }

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      blocks.push(<hr key={blocks.length} className="border-line" />)
      continue
    }
    if (bullet || numbered) {
      const ordered = !!numbered
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)![1]!)
      continue
    }
    flush()
    if (!line.trim()) continue
    if (heading)
      blocks.push(
        <p key={blocks.length} className="font-semibold">
          {inline(heading[1]!)}
        </p>
      )
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="space-y-2">{blocks}</div>
}

function Bubble({
  m,
  streaming = false,
  tools = []
}: {
  m: Pick<ChatMessage, 'role' | 'content'>
  streaming?: boolean
  /** Data sources the AI is reading while it answers. */
  tools?: string[]
}): React.JSX.Element {
  // Your messages sit in a soft bubble on the right; Sanchay answers in plain, full-width text.
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sunken px-4 py-2.5 text-[15px] leading-relaxed text-ink"
          data-selectable
        >
          {m.content}
        </div>
      </div>
    )
  }
  return (
    <div className="text-[15px] leading-7 text-ink" data-selectable>
      {tools.length > 0 && (
        <div className={cn('flex flex-wrap gap-1.5', m.content && 'mb-3')}>
          {tools.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-3"
            >
              <Wrench className="size-3" /> {t}
            </span>
          ))}
        </div>
      )}
      {m.content ? <Markdown text={m.content} /> : null}
      {streaming && (
        <span
          className="ml-0.5 inline-block size-2.5 animate-pulse rounded-full bg-accent align-middle"
          aria-label="Thinking"
        />
      )}
    </div>
  )
}

/** Groups conversations like other chat apps: Today, Yesterday, Previous 7 days, Older. */
function groupByDate(list: Conversation[]): [string, Conversation[]][] {
  const day = 86_400_000
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const groups: [string, Conversation[]][] = [
    ['Today', []],
    ['Yesterday', []],
    ['Previous 7 days', []],
    ['Older', []]
  ]
  for (const c of list) {
    const t = Date.parse(c.updatedAt)
    const g =
      t >= start.getTime()
        ? 0
        : t >= start.getTime() - day
          ? 1
          : t >= start.getTime() - 7 * day
            ? 2
            : 3
    groups[g]![1].push(c)
  }
  return groups.filter(([, items]) => items.length > 0)
}

/** Slides in from the right: your conversations, the AI that's answering, and chat options. */
function ChatPanel({
  open,
  onOpenChange,
  status,
  conversations,
  activeId,
  onOpen,
  onDelete,
  onNewChat,
  onChangeAi
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: AiStatus
  conversations: Conversation[]
  activeId: string | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onNewChat: () => void
  onChangeAi: () => void
}): React.JSX.Element {
  const go = useUi((s) => s.go)
  const close = (fn: () => void) => (): void => {
    onOpenChange(false)
    fn()
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgb(20_18_17/0.25)]" />
        <DialogPrimitive.Content className="panel-in fixed inset-y-0 right-0 z-50 flex w-[340px] flex-col border-l border-line bg-surface shadow-lg focus:outline-none">
          <div className="no-drag flex items-center justify-between px-5 pb-3 pt-5">
            <DialogPrimitive.Title className="text-[15px] font-semibold">
              Chats
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Your conversations with Sanchay, and chat options.
          </DialogPrimitive.Description>
          <div className="px-3">
            <button
              onClick={close(onNewChat)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13.5px] font-medium hover:bg-sunken"
            >
              <SquarePen className="size-4 text-ink-2" /> New chat
            </button>
          </div>
          <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-2" aria-label="Conversations">
            {conversations.length === 0 && (
              <p className="px-3 py-2 text-[12.5px] text-ink-3">
                Your conversations will appear here.
              </p>
            )}
            {groupByDate(conversations).map(([label, items]) => (
              <div key={label} className="mb-3">
                <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  {label}
                </p>
                {items.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'group flex items-center rounded-lg pr-1 transition-colors',
                      c.id === activeId ? 'bg-accent-soft text-accent-ink' : 'hover:bg-sunken'
                    )}
                  >
                    <button
                      onClick={close(() => onOpen(c.id))}
                      className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[13px]"
                      title={c.title}
                    >
                      {c.title}
                    </button>
                    <button
                      onClick={() => onDelete(c.id)}
                      className="rounded-md p-1 text-ink-3 opacity-0 hover:text-hot group-hover:opacity-100"
                      aria-label={`Delete “${c.title}”`}
                      title="Delete chat"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </nav>
          <div className="space-y-1 border-t border-line p-3">
            <div className="mb-1 flex items-center gap-2 px-2 text-[12px] text-ink-3">
              {status.isCloud ? <Cloud className="size-3" /> : <Lock className="size-3" />}
              <span className="truncate">
                {status.providers.find((p) => p.id === status.provider)?.name ?? 'AI'} ·{' '}
                {status.model}
                {status.isCloud ? ' · identifiers masked' : ''}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { icon: <Cpu className="size-4" />, label: 'Change AI', fn: onChangeAi },
                {
                  icon: <UserRound className="size-4" />,
                  label: 'Profile',
                  fn: () => go('profile')
                },
                { icon: <Plug className="size-4" />, label: 'Sources', fn: () => go('sources') }
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={close(b.fn)}
                  className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11.5px] text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  {b.icon}
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function AiCfoPage(): React.JSX.Element {
  const toast = useUi((s) => s.toast)
  const currency = useCurrency()
  const india = isIndia(currency)
  const draft = useUi((s) => s.aiDraft)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<{
    requestId: string
    text: string
    tools: string[]
  } | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [panel, setPanel] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // The live stream is tracked in a ref so deltas that arrive before React re-renders aren't lost.
  const streamRef = useRef<{ requestId: string; text: string; tools: string[] } | null>(null)

  const chatId = useUi((s) => s.chatId)
  const setChatId = useUi((s) => s.setChatId)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const refreshConversations = (): void => void api.listConversations().then(setConversations)

  useEffect(() => {
    void api.getAiStatus().then(setStatus)
    refreshConversations()
  }, [])

  // Load the open conversation (unless we're the ones streaming into it).
  useEffect(() => {
    if (streamRef.current) return
    if (!chatId) {
      setMessages([])
      return
    }
    void api.listChat(chatId).then(setMessages)
  }, [chatId])

  useEffect(() => {
    return window.cfoEvents.onAi((e) => {
      const cur = streamRef.current
      if (!cur || e.requestId !== cur.requestId) return
      if (e.type === 'delta') {
        cur.text += e.text
        setPending({ ...cur })
      } else if (e.type === 'tool') {
        cur.tools = [...cur.tools, e.label]
        setPending({ ...cur })
      } else if (e.type === 'done') {
        streamRef.current = null
        setMessages((ms) => [...ms, e.message])
        setPending(null)
        refreshConversations()
      } else if (e.type === 'error') {
        streamRef.current = null
        setPending(null)
        toast(e.error, 'error')
      }
    })
  }, [toast])

  // Pre-fill (or send) prompts from "Ask Sanchay" buttons and the Today page.
  const sendRef = useRef<(text: string) => Promise<void>>(async () => undefined)
  useEffect(() => {
    if (draft === null || !status?.ready) return
    const autoSend = useUi.getState().aiSend
    useUi.setState({ aiDraft: null, aiSend: false })
    if (autoSend) void sendRef.current(draft)
    else {
      setInput(draft)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [draft, status?.ready])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending?.text])

  async function send(text: string): Promise<void> {
    const t = text.trim()
    if (!t || pending) return
    setInput('')
    try {
      const { requestId, userMessage, conversationId } = await api.sendChat({
        conversationId: chatId,
        text: t
      })
      streamRef.current = { requestId, text: '', tools: [] }
      if (conversationId !== chatId) {
        setChatId(conversationId)
        refreshConversations()
      }
      setMessages((ms) => [...ms, userMessage])
      setPending({ requestId, text: '', tools: [] })
    } catch (e) {
      setInput(t)
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  sendRef.current = send

  if (!status) return <Spinner label="Waking up Sanchay" />

  if (!status.ready || showSetup) {
    return (
      <div className="mx-auto max-w-[980px] px-8 py-8">
        <h1 className="font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-tight">
          Set up Sanchay’s AI
        </h1>
        <p className="mt-1 text-[14px] text-ink-2">
          Pick where your AI runs. On-device keeps every byte on this Mac.
        </p>
        <Card className="mt-5 p-5">
          <AiSetup
            onReady={(s) => {
              setStatus(s)
              setShowSetup(false)
            }}
          />
        </Card>
        {status.ready && (
          <Button variant="ghost" className="mt-3" onClick={() => setShowSetup(false)}>
            Back to chat
          </Button>
        )}
      </div>
    )
  }

  const empty = messages.length === 0 && !pending
  const newChat = (): void => {
    if (pending) return
    setChatId(null)
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const composer = (
    <form
      className="rounded-2xl border border-line-strong bg-surface p-2 shadow-sm focus-within:border-accent/60"
      onSubmit={(e) => {
        e.preventDefault()
        void send(input)
      }}
    >
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send(input)
          }
        }}
        rows={1}
        placeholder="Ask Sanchay anything…"
        aria-label="Message Sanchay"
        className="block max-h-48 min-h-[44px] w-full resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed outline-none placeholder:text-ink-3 focus-visible:outline-none"
        style={{ fieldSizing: 'content' } as React.CSSProperties}
      />
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="flex items-center gap-1 px-1.5 text-[11.5px] text-ink-3">
          {status.isCloud ? <Cloud className="size-3" /> : <Lock className="size-3" />}
          {status.model}
        </span>
        <div className="flex items-center gap-1.5">
          <VoiceButton
            disabled={!!pending}
            onText={(t) => {
              setInput((cur) => (cur.trim() ? `${cur.trim()} ${t}` : t))
              inputRef.current?.focus()
            }}
          />
          {pending ? (
            <button
              type="button"
              onClick={() => void api.cancelChat(pending.requestId)}
              className="flex size-9 items-center justify-center rounded-xl bg-ink text-surface"
              aria-label="Stop"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="gloss-btn flex size-9 items-center justify-center rounded-xl disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  )

  return (
    <div className="relative flex h-full flex-col">
      <div className="no-drag absolute right-5 top-4 z-10 flex items-center gap-1">
        {messages.length > 0 && (
          <button
            onClick={newChat}
            className="rounded-lg p-2 text-ink-3 hover:bg-sunken hover:text-ink"
            aria-label="New chat"
            title="New chat"
          >
            <SquarePen className="size-4" />
          </button>
        )}
        <button
          onClick={() => setPanel(true)}
          className="rounded-lg p-2 text-ink-3 hover:bg-sunken hover:text-ink"
          aria-label="Chat options"
          title="Chat options"
        >
          <PanelRight className="size-4" />
        </button>
      </div>
      <ChatPanel
        open={panel}
        onOpenChange={setPanel}
        status={status}
        conversations={conversations}
        activeId={chatId}
        onOpen={(id) => !pending && setChatId(id)}
        onDelete={(id) =>
          void api.deleteConversation(id).then(() => {
            if (id === chatId) setChatId(null)
            refreshConversations()
          })
        }
        onNewChat={newChat}
        onChangeAi={() => setShowSetup(true)}
      />

      {empty ? (
        // A new chat opens as a welcome from Sanchay; the first question switches to the full chat.
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-8 pb-12 pt-14">
          <div className="my-auto w-full max-w-[760px]">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="absolute -inset-5 rounded-full bg-accent/15 blur-2xl" aria-hidden />
                <Logo className="relative size-16 rounded-[18px] shadow-lg" />
              </div>
              <p className="mt-5 text-[12px] font-medium uppercase tracking-[0.14em] text-accent-ink">
                Your personal money manager
              </p>
              <h1 className="mt-1.5 font-[family-name:var(--font-display)] text-[34px] font-semibold tracking-tight">
                Hi, I&apos;m Sanchay. How can I help?
              </h1>
              <p className="mt-2 max-w-[520px] text-[14.5px] leading-relaxed text-ink-2">
                {india
                  ? 'I know your statements, your INDmoney portfolio and your profile, and I can look up live prices.'
                  : 'I know your statements, your goals and what you have told me.'}{' '}
                Ask me anything about your money, in your own words.
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-3">
                {status.isCloud ? <Cloud className="size-3" /> : <Lock className="size-3" />}
                {status.isCloud
                  ? 'Names and account numbers are masked before anything is sent'
                  : 'Private: everything stays on this Mac'}
              </span>
            </div>
            <div className="mt-7">{composer}</div>
            <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {(india ? STARTERS.india : STARTERS.global).cards.map((c) => {
                const prompt = india
                  ? c.prompt
                  : c.prompt.replace('$300', formatMoney(30_000, currency))
                return (
                  <button
                    key={c.title}
                    onClick={() => void send(prompt)}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
                  >
                    <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                      {c.icon}
                    </span>
                    <span className="text-[13px] font-semibold text-ink">{c.title}</span>
                    <span className="text-[12.5px] leading-snug text-ink-3 group-hover:text-ink-2">
                      {prompt}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {(india ? STARTERS.india : STARTERS.global).more.map((q) => (
                <button
                  key={q}
                  onClick={() => void send(q)}
                  className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="mt-6 text-center text-[11px] text-ink-3">
              Type, or tap the mic to talk.{' '}
              {india ? 'Not SEBI-registered investment advice.' : 'Not investment advice.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1180px] space-y-8 px-8 pb-10 pt-8">
              {messages.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
              {pending && (
                <Bubble
                  m={{ role: 'assistant', content: pending.text.trim() }}
                  tools={pending.tools}
                  streaming
                />
              )}
            </div>
          </div>
          <div className="px-8 pb-4">
            <div className="mx-auto max-w-[1180px]">
              {composer}
              <p className="mt-2 text-center text-[11px] text-ink-3">
                AI can make mistakes — check the numbers.{' '}
                {india ? 'Not SEBI-registered investment advice.' : 'Not investment advice.'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
