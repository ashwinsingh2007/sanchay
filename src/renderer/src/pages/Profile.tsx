import { useEffect, useState } from 'react'
import { MessageSquare, SkipForward, Trash2 } from 'lucide-react'
import {
  isAnswered,
  NOTE_PREFIX,
  PROFILE_QUESTIONS,
  SKIPPED,
  type ProfileQuestion
} from '@shared/domain/profile'
import type { ProfileEntry } from '@shared/types'
import { Badge, Button, Card, CardHeader, PageHeader, Progress, Spinner } from '../components/ui'
import { useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

const SECTIONS = ['You', 'Debt', 'Protection', 'Assets', 'Plans'] as const

/** What your AI CFO should know beyond statements. Every question is optional. */
export function ProfilePage(): React.JSX.Element {
  const profile = useQuery(() => api.listProfile())
  const [entries, setEntries] = useState<ProfileEntry[] | null>(null)
  useEffect(() => {
    if (profile.data) setEntries(profile.data)
  }, [profile.data])
  if (!entries) return <Spinner />

  const byKey = new Map(entries.map((e) => [e.key, e]))
  const answered = PROFILE_QUESTIONS.filter((q) => isAnswered(byKey.get(q.key))).length
  const notes = entries.filter((e) => e.key.startsWith(NOTE_PREFIX))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Your CFO"
        title="CFO profile"
        description="The things statements and INDmoney can't show. Answer what you like, skip the rest — you can also just tell your AI CFO in chat and it will remember."
      />
      <Card>
        <div className="flex items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium">
              {answered} of {PROFILE_QUESTIONS.length} answered
            </p>
            <div className="mt-2">
              <Progress
                value={(answered / PROFILE_QUESTIONS.length) * 100}
                label="Profile answered"
              />
            </div>
          </div>
        </div>
      </Card>
      {SECTIONS.map((section) => (
        <Card key={section}>
          <CardHeader title={section} />
          <div className="divide-y divide-line px-5 pb-2">
            {PROFILE_QUESTIONS.filter((q) => q.section === section).map((q) => (
              <QuestionRow key={q.key} q={q} entry={byKey.get(q.key)} onSaved={setEntries} />
            ))}
          </div>
        </Card>
      ))}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <MessageSquare className="size-4" /> Remembered from chat
            </span>
          }
          description="Facts your AI CFO saved while you talked."
        />
        <ul className="divide-y divide-line px-5 pb-3">
          {notes.length === 0 && (
            <li className="py-3 text-[13px] text-ink-3">
              Nothing yet. Try telling the AI CFO “I have a ₹20L home loan at 8.6%”.
            </li>
          )}
          {notes.map((n) => (
            <li key={n.key} className="flex items-start gap-3 py-2.5 text-[13px]">
              <span className="flex-1">{n.value}</span>
              <span className="text-[11.5px] text-ink-3">{n.updatedAt.slice(0, 10)}</span>
              <button
                className="text-ink-3 hover:text-negative"
                aria-label="Forget this"
                onClick={() => void api.deleteProfileEntry(n.key).then(setEntries)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function QuestionRow({
  q,
  entry,
  onSaved
}: {
  q: ProfileQuestion
  entry: ProfileEntry | undefined
  onSaved: (entries: ProfileEntry[]) => void
}): React.JSX.Element {
  const toast = useUi((s) => s.toast)
  const saved = entry && entry.value !== SKIPPED ? entry.value : ''
  const [value, setValue] = useState(saved)
  useEffect(() => setValue(saved), [saved])
  const dirty = value.trim() !== saved

  const save = (v: string): void => {
    void api
      .saveProfileAnswer({ key: q.key, value: v })
      .then((e) => {
        onSaved(e)
        if (v !== SKIPPED) toast('Saved')
      })
      .catch((err: unknown) => toast(err instanceof Error ? err.message : String(err), 'error'))
  }

  return (
    <div className="grid gap-2 py-3.5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] md:items-start">
      <div>
        <p className="text-[13.5px] font-medium">{q.question}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
          {entry?.source === 'chat' && <Badge tone="outline">from chat</Badge>}
          {entry?.value === SKIPPED && <Badge tone="neutral">skipped</Badge>}
        </p>
      </div>
      <div className="space-y-2">
        {q.options && (
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <button
                key={o}
                onClick={() => {
                  setValue(o)
                  save(o)
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                  saved === o
                    ? 'border-accent bg-accent text-on-color'
                    : 'border-line-strong text-ink-2 hover:border-accent/50 hover:text-ink'
                )}
              >
                {o}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && dirty && save(value)}
            placeholder={q.hint}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[13px] outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          {dirty ? (
            <Button size="sm" variant="primary" onClick={() => save(value)}>
              Save
            </Button>
          ) : (
            !saved &&
            entry?.value !== SKIPPED && (
              <Button
                size="sm"
                variant="ghost"
                icon={<SkipForward className="size-3.5" />}
                onClick={() => save(SKIPPED)}
              >
                Skip
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
