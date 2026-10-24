import { useState } from 'react'
import {
  Ban,
  CheckCircle2,
  FileText,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  Unplug,
  Upload
} from 'lucide-react'
import { formatDate } from '@shared/dates'
import type { DataSourceAuth, DataSourceInfo } from '@shared/types'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Segmented,
  Spinner
} from '../components/ui'
import { useMutation, useQuery } from '../lib/hooks'
import { useUi } from '../lib/store'
import { api, cn } from '../lib/utils'

/** MCP servers the AI CFO can read from while you chat. */
export function DataSourcesPage(): React.JSX.Element {
  const sources = useQuery(() => api.listDataSources(true))
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Your CFO"
        title="Data sources"
        description="Connect where your money lives and where market data comes from. Your AI CFO reads from these while you chat — read-only, nothing can be traded or changed."
      />
      {!sources.data ? (
        <Spinner label="Checking your data sources" />
      ) : (
        <div className="space-y-8">
          <Group title="Your money" note="Statements, INDmoney and soon your inbox.">
            <StatementsCard />
            {sources.data
              .filter((s) => s.group === 'money')
              .map((s) => (
                <SourceCard key={s.id} source={s} />
              ))}
            <ComingSoonCard
              title="Gmail"
              about="Finds bank, card and CAS statements in your inbox, unlocks them and imports them automatically — read-only, and only those emails."
            />
          </Group>
          <Group
            title="Brokers"
            note="Official connectors. Your CFO can only read — orders, exits and conversions are blocked."
          >
            {sources.data
              .filter((s) => s.group === 'broker')
              .map((s) => (
                <SourceCard key={s.id} source={s} />
              ))}
          </Group>
          <Group title="Market research" note="Live prices, fundamentals and news for your CFO.">
            {sources.data
              .filter((s) => s.group === 'market')
              .map((s) => (
                <SourceCard key={s.id} source={s} />
              ))}
          </Group>
          <Group title="Your own" note="Any other MCP server.">
            {sources.data
              .filter((s) => s.group === 'custom')
              .map((s) => (
                <SourceCard key={s.id} source={s} />
              ))}
            <AddSource />
          </Group>
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  note,
  children
}: {
  title: string
  note: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="text-[12.5px] text-ink-3">{note}</p>
      </div>
      {children}
    </section>
  )
}

function ComingSoonCard({ title, about }: { title: string; about: string }): React.JSX.Element {
  return (
    <Card className="opacity-75">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title} <Badge tone="outline">Coming soon</Badge>
          </span>
        }
        description={about}
      />
      <div className="pb-5" />
    </Card>
  )
}

/** Bank and card statements are a data source too: the history lives on its own page. */
function StatementsCard(): React.JSX.Element {
  const go = useUi((s) => s.go)
  const openImport = useUi((s) => s.openImport)
  const list = useQuery(() => api.listImportSources())
  const n = list.data?.length ?? 0
  const accounts = new Set((list.data ?? []).map((s) => s.accountName)).size
  const latest = (list.data ?? []).reduce<string | null>(
    (a, s) => (s.dateRangeEnd && (!a || s.dateRangeEnd > a) ? s.dateRangeEnd : a),
    null
  )
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FileText className="size-4" /> Bank &amp; card statements
            {n > 0 && <Badge tone="positive">{n} uploaded</Badge>}
          </span>
        }
        description={
          n > 0
            ? `${accounts} account${accounts === 1 ? '' : 's'}${latest ? ` · latest up to ${formatDate(latest)}` : ''}. Read on this Mac — never uploaded anywhere.`
            : 'PDF or CSV from any bank or card. Read on this Mac — never uploaded anywhere.'
        }
      />
      <div className="flex gap-2 p-5 pt-3">
        <Button
          variant="primary"
          size="sm"
          icon={<Upload className="size-3.5" />}
          onClick={() => openImport()}
        >
          Upload statement
        </Button>
        {n > 0 && (
          <Button size="sm" onClick={() => go('statements')}>
            Manage statements →
          </Button>
        )}
      </div>
    </Card>
  )
}

function SourceCard({ source: s }: { source: DataSourceInfo }): React.JSX.Element {
  const mutate = useMutation()
  const [busy, setBusy] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const run = (key: string, fn: () => Promise<unknown>, ok?: string): void => {
    setBusy(key)
    void mutate(fn, ok).finally(() => setBusy(null))
  }
  const usable = s.tools?.filter((t) => !t.blocked) ?? []
  const blocked = s.tools?.filter((t) => t.blocked) ?? []

  return (
    <Card className={cn(!s.enabled && 'opacity-70')}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {s.name}
            {s.connected && s.enabled ? (
              <Badge tone="positive">Connected</Badge>
            ) : !s.connected ? (
              <Badge tone="outline">Not connected</Badge>
            ) : (
              <Badge tone="neutral">Off</Badge>
            )}
          </span>
        }
        description={s.about ?? s.url}
        action={
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={s.enabled}
              onChange={(e) =>
                run('toggle', () =>
                  api.setDataSourceEnabled({ id: s.id, enabled: e.target.checked })
                )
              }
            />
            Use in chat
          </label>
        }
      />
      <div className="space-y-3 p-5 pt-3">
        {s.error && (
          <p className="text-[12.5px] text-negative">
            {s.connected ? s.error : 'Sign-in expired — sign in again to keep your data fresh.'}
          </p>
        )}
        {!s.connected && s.auth === 'token' && (
          <Field label="Access token" htmlFor={`tok-${s.id}`}>
            <Input
              id={`tok-${s.id}`}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste the token from the provider"
            />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!s.connected ? (
            <Button
              variant="primary"
              size="sm"
              loading={busy === 'connect'}
              icon={<Link2 className="size-3.5" />}
              disabled={s.auth === 'token' && token.trim().length < 8}
              onClick={() =>
                run(
                  'connect',
                  () =>
                    api.connectDataSource({
                      id: s.id,
                      ...(token.trim() ? { token: token.trim() } : {})
                    }),
                  `${s.name} connected`
                )
              }
            >
              {busy === 'connect' && (s.auth === 'oauth' || s.auth === 'session')
                ? 'Finish sign-in in your browser…'
                : s.auth === 'oauth' || s.auth === 'session'
                  ? `Sign in to ${s.name}`
                  : 'Connect'}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                loading={busy === 'refresh'}
                icon={<RefreshCw className="size-3.5" />}
                onClick={() => run('refresh', () => api.listDataSources(true))}
              >
                Check connection
              </Button>
              {s.auth !== 'none' && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === 'disconnect'}
                  icon={<Unplug className="size-3.5" />}
                  onClick={() =>
                    run(
                      'disconnect',
                      () => api.disconnectDataSource(s.id),
                      `${s.name} disconnected`
                    )
                  }
                >
                  Disconnect
                </Button>
              )}
            </>
          )}
          {!s.builtin && (
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'remove'}
              icon={<Trash2 className="size-3.5" />}
              onClick={() => run('remove', () => api.removeDataSource(s.id), `${s.name} removed`)}
            >
              Remove
            </Button>
          )}
        </div>
        {s.tools && (
          <details>
            <summary className="cursor-pointer text-[12.5px] text-ink-2">
              {usable.length} tools your CFO can use
              {blocked.length > 0 && ` · ${blocked.length} blocked (could change data)`}
            </summary>
            <ul className="mt-2 grid gap-1.5 text-[12px] md:grid-cols-2">
              {s.tools.map((t) => (
                <li key={t.name} className="flex items-start gap-1.5">
                  {t.blocked ? (
                    <Ban className="mt-0.5 size-3 shrink-0 text-negative" aria-label="Blocked" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-positive" />
                  )}
                  <span className="min-w-0">
                    <code className={cn('text-ink', t.blocked && 'line-through')}>{t.name}</code>
                    {t.description && (
                      <span className="block truncate text-ink-3" title={t.description}>
                        {t.description}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  )
}

function AddSource(): React.JSX.Element {
  const mutate = useMutation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [auth, setAuth] = useState<Exclude<DataSourceAuth, 'session'>>('oauth')
  if (!open)
    return (
      <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
        Add a data source (MCP server)
      </Button>
    )
  return (
    <Card>
      <CardHeader
        title="Add a data source"
        description="Any remote MCP server (Streamable HTTP), e.g. a market-data or news provider. Only its read-only tools are used."
      />
      <div className="grid gap-3 p-5 pt-4 md:grid-cols-2">
        <Field label="Name" htmlFor="src-name">
          <Input
            id="src-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. TradingView"
          />
        </Field>
        <Field label="Server URL" htmlFor="src-url">
          <Input
            id="src-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
          />
        </Field>
        <div className="md:col-span-2">
          <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">How it signs in</p>
          <Segmented
            label="Sign-in method"
            value={auth}
            onChange={setAuth}
            options={[
              { value: 'oauth', label: 'Browser sign-in' },
              { value: 'token', label: 'Access token' },
              { value: 'none', label: 'No sign-in' }
            ]}
          />
        </div>
        <div className="flex gap-2 md:col-span-2">
          <Button
            variant="primary"
            disabled={!name.trim() || !/^https?:\/\//.test(url.trim())}
            onClick={() =>
              void mutate(
                () => api.addDataSource({ name: name.trim(), url: url.trim(), auth }),
                `${name.trim()} added — connect it below`
              ).then((r) => {
                if (r) {
                  setOpen(false)
                  setName('')
                  setUrl('')
                }
              })
            }
          >
            Add
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  )
}
