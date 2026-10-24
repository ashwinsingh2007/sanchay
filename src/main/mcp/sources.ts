import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { app, shell } from 'electron'
import { eq } from 'drizzle-orm'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  UnauthorizedError,
  type OAuthClientProvider
} from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { DataSourceGroup, DataSourceInfo } from '../../shared/types'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { getSecret, hasSecret, setSecret } from '../ai/secrets'

/**
 * Remote MCP servers the AI CFO reads from. Each one signs in with OAuth (browser + PKCE), a
 * pasted bearer token, or nothing. Credentials live in the Keychain-backed secrets table.
 */
type SourceRow = typeof s.dataSources.$inferSelect

const CALLBACK_PORT = 33418
const REDIRECT_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`
const SIGN_IN_TIMEOUT_MS = 5 * 60_000
const TOOLS_TTL_MS = 10 * 60_000

export const BUILTIN_SOURCES: (Omit<SourceRow, 'createdAt' | 'enabled' | 'builtin'> & {
  about: string
  group: DataSourceGroup
})[] = [
  {
    id: 'indmoney',
    name: 'INDmoney',
    url: 'https://mcp.indmoney.com/mcp',
    auth: 'oauth',
    tokenAuthMethod: 'client_secret_post',
    group: 'money',
    about:
      'Your portfolio: net worth, holdings, SIPs, savings accounts, card dues — plus live prices, analyst ratings, news and fund rankings.'
  },
  // Brokers: official MCP servers. Only their read tools reach the AI (see isBlockedTool).
  {
    id: 'zerodha',
    name: 'Zerodha Kite',
    url: 'https://mcp.kite.trade/mcp',
    auth: 'session',
    tokenAuthMethod: 'none',
    group: 'broker',
    about: 'Holdings, positions, mutual funds and margins. Kite asks you to log in again each day.'
  },
  {
    id: 'groww',
    name: 'Groww',
    url: 'https://mcp.groww.in/mcp/',
    auth: 'oauth',
    tokenAuthMethod: 'client_secret_basic',
    group: 'broker',
    about: 'Stock and mutual fund holdings, positions and P&L.'
  },
  {
    id: 'dhan',
    name: 'Dhan',
    url: 'https://mcp.dhan.co/mcp',
    auth: 'oauth',
    tokenAuthMethod: 'none',
    group: 'broker',
    about: 'Holdings, positions and funds.'
  },
  {
    id: 'upstox',
    name: 'Upstox',
    url: 'https://mcp.upstox.com/mcp',
    auth: 'oauth',
    tokenAuthMethod: 'none',
    group: 'broker',
    about: 'Holdings, positions and orders (read-only). Upstox renews access daily.'
  },
  {
    id: 'fyers',
    name: 'FYERS',
    url: 'https://mcp.fyers.in/mcp',
    auth: 'session',
    tokenAuthMethod: 'none',
    group: 'broker',
    about: 'Holdings, mutual funds, positions, realised and tax P&L.'
  },
  {
    id: 'kotakneo',
    name: 'Kotak Neo',
    url: 'https://neo.kotaksecurities.com/mcp-server/mcp',
    auth: 'session',
    tokenAuthMethod: 'none',
    group: 'broker',
    about: 'Holdings and positions. Sign-in uses a QR code in the Kotak Neo app.'
  },
  {
    id: 'tapetide',
    name: 'Tapetide',
    url: 'https://mcp.tapetide.com/mcp',
    auth: 'oauth',
    tokenAuthMethod: 'none',
    group: 'market',
    about:
      'Indian stock research: financials, screeners, analyst forecasts, FII/DII flows, shareholding, earnings-call and market news.'
  },
  {
    id: 'tradingview',
    name: 'TradingView',
    url: 'https://mcp.tradingview.com/mcp',
    auth: 'oauth',
    tokenAuthMethod: 'none',
    group: 'market',
    about:
      'Quotes and price history, screener, fundamentals, news, filings and calendars (beta; needs an Essential plan or higher; data is delayed). Log in at tradingview.com in your browser first — their sign-in page currently blocks desktop apps.'
  }
]

const groupOf = (id: string): DataSourceGroup =>
  BUILTIN_SOURCES.find((b) => b.id === id)?.group ?? 'custom'

/** Tools that could change something are never offered to the AI. */
const WRITE_TOOL =
  /^(save|add|remove|delete|update|create|place|cancel|modify|set|submit|buy|sell|transfer|redeem|send|post|write)_/

/** Brokers: an allowlist. Only tools that clearly read are offered (no orders, exits, conversions). */
const BROKER_READ_TOOL = /^(get|search|list|fetch|lookup|calculate)_/

export function isBlockedTool(
  tool: Pick<Tool, 'name' | 'annotations'>,
  sourceId?: string
): boolean {
  if (sourceId && groupOf(sourceId) === 'broker') return !BROKER_READ_TOOL.test(tool.name)
  if (tool.annotations?.readOnlyHint === true) return false
  if (tool.annotations?.destructiveHint === true) return true
  return WRITE_TOOL.test(tool.name)
}

const secretName = (id: string, kind: 'client' | 'tokens' | 'token'): string => `${id}_${kind}`

function readJsonSecret<T>(db: Db, name: string): T | undefined {
  const raw = getSecret(db, name)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/** Adds the built-in sources on first run. */
export function ensureBuiltinSources(db: Db): void {
  for (const b of BUILTIN_SOURCES) {
    db.insert(s.dataSources)
      .values({
        id: b.id,
        name: b.name,
        url: b.url,
        auth: b.auth,
        tokenAuthMethod: b.tokenAuthMethod,
        enabled: true,
        builtin: true,
        createdAt: new Date().toISOString()
      })
      .onConflictDoNothing()
      .run()
  }
}

export function listSourceRows(db: Db): SourceRow[] {
  return db.select().from(s.dataSources).all()
}

export function getSourceRow(db: Db, id: string): SourceRow {
  const row = db.select().from(s.dataSources).where(eq(s.dataSources.id, id)).get()
  if (!row) throw new Error('Unknown data source')
  return row
}

export function isConnected(db: Db, row: SourceRow): boolean {
  if (row.auth === 'oauth') return hasSecret(db, secretName(row.id, 'tokens'))
  if (row.auth === 'token') return hasSecret(db, secretName(row.id, 'token'))
  if (row.auth === 'session') return sessionReady.has(row.id) && live.has(row.id)
  return true
}

// ---------- OAuth ----------

class SourceAuth implements OAuthClientProvider {
  private verifier: string | null = null
  private expectedState: string | null = null
  /** Resolves with the authorization code once the browser redirects back. */
  code: Promise<string> | null = null

  constructor(
    private readonly db: Db,
    private readonly row: SourceRow,
    private readonly interactive: boolean
  ) {}

  get redirectUrl(): string {
    return redirectFor(this.row.id)
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Sanchay',
      redirect_uris: [redirectFor(this.row.id)],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.row.tokenAuthMethod
    }
  }

  state(): string {
    this.expectedState = randomBytes(16).toString('hex')
    return this.expectedState
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const info = readJsonSecret<
      OAuthClientInformationMixed & { client_secret_expires_at?: number }
    >(this.db, secretName(this.row.id, 'client'))
    // Some servers (Groww) issue client secrets that expire daily: register again when stale.
    const expires = info?.client_secret_expires_at
    if (expires && expires * 1000 < Date.now() + 60_000) return undefined
    return info
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    setSecret(this.db, secretName(this.row.id, 'client'), JSON.stringify(info))
  }

  tokens(): OAuthTokens | undefined {
    return readJsonSecret(this.db, secretName(this.row.id, 'tokens'))
  }

  saveTokens(tokens: OAuthTokens): void {
    setSecret(this.db, secretName(this.row.id, 'tokens'), JSON.stringify(tokens))
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    if (!this.interactive) throw new UnauthorizedError(`${this.row.name} sign-in expired.`)
    this.code = waitForCallback(() => this.expectedState, redirectFor(this.row.id))
    this.code.catch(() => undefined)
    await shell.openExternal(url.toString())
  }

  saveCodeVerifier(verifier: string): void {
    this.verifier = verifier
  }

  codeVerifier(): string {
    if (!this.verifier) throw new Error('Missing PKCE verifier')
    return this.verifier
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all' || scope === 'client')
      setSecret(this.db, secretName(this.row.id, 'client'), null)
    if (scope === 'all' || scope === 'tokens')
      setSecret(this.db, secretName(this.row.id, 'tokens'), null)
    if (scope === 'all' || scope === 'verifier') this.verifier = null
  }
}

/** One-shot loopback server that catches the OAuth redirect from the system browser. */
function waitForCallback(expectedState: () => string | null, redirectUrl: string): Promise<string> {
  const target = new URL(redirectUrl)
  return new Promise((resolve, reject) => {
    const servers: Server[] = []
    const finish = (err: Error | null, code?: string): void => {
      clearTimeout(timer)
      for (const s of servers) s.close()
      if (err) reject(err)
      else resolve(code!)
    }
    const timer = setTimeout(
      () => finish(new Error('Sign-in timed out. Try again.')),
      SIGN_IN_TIMEOUT_MS
    )
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      const url = new URL(req.url ?? '/', redirectUrl)
      if (url.pathname !== target.pathname) {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const ok = !!code && url.searchParams.get('state') === expectedState()
      res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Sanchay</title><body style="font:15px -apple-system,sans-serif;background:#000;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><p>${ok ? 'Connected. You can close this tab and return to Sanchay.' : 'Sign-in failed. Return to the app and try again.'}</p></body>`
      )
      if (ok) finish(null, code)
      else finish(new Error(error ? `Sign-in failed: ${error}` : 'Sign-in failed.'))
    }
    // "localhost" may resolve to IPv4 or IPv6 in the browser: listen on both loopbacks.
    const hosts = target.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [target.hostname]
    hosts.forEach((host, i) => {
      const s = createServer(handler)
      servers.push(s)
      // The IPv6 loopback is optional; only the first listener's failure is fatal.
      s.on('error', (e) => (i === 0 ? finish(e) : undefined))
      s.listen(Number(target.port), host)
    })
  })
}

/**
 * Where the browser sends the user back after sign-in. Groww only accepts its pre-approved
 * redirect list, which includes a loopback address for desktop clients, so use that one.
 */
const REDIRECTS: Record<string, string> = {
  groww: 'http://localhost:52155/oauth/callback'
}
const redirectFor = (id: string): string => REDIRECTS[id] ?? REDIRECT_URL

// ---------- Connections ----------

/**
 * fetch that always identifies the app. Some servers' CDNs (TradingView's CloudFront) reject
 * requests without a User-Agent with a bare "request could not be satisfied" 403.
 */
const appFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  if (!headers.has('user-agent'))
    headers.set('user-agent', `PersonalAICFO/${app.getVersion()} (+MCP client)`)
  return fetch(input, { ...init, headers })
}

function newSession(
  db: Db,
  row: SourceRow,
  auth: SourceAuth | null
): { client: Client; transport: StreamableHTTPClientTransport } {
  const token = row.auth === 'token' ? getSecret(db, secretName(row.id, 'token')) : null
  return {
    client: new Client({ name: 'personal-ai-cfo', version: app.getVersion() }),
    transport: new StreamableHTTPClientTransport(new URL(row.url), {
      fetch: appFetch,
      ...(auth ? { authProvider: auth } : {}),
      ...(token ? { requestInit: { headers: { authorization: `Bearer ${token}` } } } : {})
    })
  }
}

/** Connects to a source. `interactive` allows opening the browser to sign in. */
export async function connectSource(db: Db, id: string, interactive: boolean): Promise<Client> {
  const row = getSourceRow(db, id)
  const auth = row.auth === 'oauth' ? new SourceAuth(db, row, interactive) : null
  const first = newSession(db, row, auth)
  try {
    await first.client.connect(first.transport)
    return first.client
  } catch (e) {
    if (!(e instanceof UnauthorizedError) || !auth?.code) throw e
    await first.transport.finishAuth(await auth.code)
    const second = newSession(db, row, auth)
    await second.client.connect(second.transport)
    return second.client
  }
}

/** Login-link sources whose current connection has been signed in. */
const sessionReady = new Set<string>()

/** Long-lived clients and tool lists, so chat doesn't reconnect on every tool call. */
const live = new Map<string, { client: Client; tools: Tool[]; at: number }>()
const lastError = new Map<string, string>()

export function dropClient(id: string): void {
  const entry = live.get(id)
  live.delete(id)
  sessionReady.delete(id)
  void entry?.client.close().catch(() => undefined)
}

export async function sourceSession(
  db: Db,
  id: string,
  opts: { interactive?: boolean; fresh?: boolean } = {}
): Promise<{ client: Client; tools: Tool[] }> {
  const cached = live.get(id)
  // Login-link sessions live on one connection: never recycle it while it's signed in.
  if (cached && !opts.fresh && (sessionReady.has(id) || Date.now() - cached.at < TOOLS_TTL_MS))
    return cached
  if (cached) dropClient(id)
  try {
    const client = await connectSource(db, id, opts.interactive ?? false)
    const { tools } = await client.listTools()
    const entry = { client, tools, at: Date.now() }
    live.set(id, entry)
    lastError.delete(id)
    return entry
  } catch (e) {
    const row = getSourceRow(db, id)
    if (e instanceof UnauthorizedError && row.auth === 'oauth')
      setSecret(db, secretName(id, 'tokens'), null)
    lastError.set(id, e instanceof Error ? e.message : String(e))
    throw e
  }
}

/** Calls a tool, reconnecting once if the server dropped the session. */
export async function callSourceTool(
  db: Db,
  id: string,
  name: string,
  args: Record<string, unknown>
): Promise<{ text: string; isError: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const { client, tools } = await sourceSession(db, id, { fresh: attempt > 0 })
    const tool = tools.find((t) => t.name === name)
    if (!tool) return { text: `Unknown tool ${name}`, isError: true }
    if (isBlockedTool(tool, id))
      return {
        text: 'This tool can change data and is disabled in Sanchay.',
        isError: true
      }
    try {
      const result = await client.callTool({ name, arguments: args })
      return { text: resultText(result), isError: result.isError === true }
    } catch (e) {
      if (attempt > 0) throw e
    }
  }
}

/**
 * Joins a tool result into one string. Prefers structured JSON, and unwraps servers (INDmoney)
 * that put a JSON document inside `{ "result": "<json string>" }`.
 */
export function resultText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const structured = result.structuredContent as Record<string, unknown> | undefined
  if (structured) {
    const keys = Object.keys(structured)
    const inner = keys.length === 1 ? structured[keys[0]!] : undefined
    if (typeof inner === 'string') {
      try {
        return JSON.stringify(JSON.parse(inner))
      } catch {
        return inner
      }
    }
    return JSON.stringify(structured)
  }
  const content = (result.content ?? []) as { type: string; text?: string }[]
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('\n')
}

// ---------- Managing sources ----------

export async function describeSources(db: Db, probe: boolean): Promise<DataSourceInfo[]> {
  const rows = listSourceRows(db)
  return Promise.all(
    rows.map(async (row) => {
      const connected = isConnected(db, row)
      let tools: Tool[] | null = live.get(row.id)?.tools ?? null
      if (probe && connected && row.enabled && !tools) {
        tools = await sourceSession(db, row.id)
          .then((x) => x.tools)
          .catch(() => null)
      }
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        auth: row.auth,
        group: groupOf(row.id),
        enabled: row.enabled,
        builtin: row.builtin,
        connected: isConnected(db, row),
        about: BUILTIN_SOURCES.find((b) => b.id === row.id)?.about ?? null,
        tools:
          tools?.map((t) => ({
            name: t.name,
            description: (t.description ?? '').trim().split('\n')[0] ?? '',
            blocked: isBlockedTool(t, row.id) || HIDDEN_TOOLS.has(t.name)
          })) ?? null,
        error: lastError.get(row.id) ?? null
      }
    })
  )
}

export async function signInSource(db: Db, id: string, token?: string | null): Promise<void> {
  const row = getSourceRow(db, id)
  if (row.auth === 'token') {
    if (!token?.trim()) throw new Error('Paste the access token first.')
    setSecret(db, secretName(id, 'token'), token.trim())
  }
  dropClient(id)
  const session = await sourceSession(db, id, { interactive: true, fresh: true })
  if (row.auth === 'session') await sessionLogin(row, session)
}

/** Sign-in plumbing the AI never needs to see. */
export const HIDDEN_TOOLS = new Set(['login', 'logout', 'logout_user'])
const SESSION_LOGIN_TIMEOUT_MS = 4 * 60_000

/**
 * Login-link servers (Kite, FYERS, Kotak Neo): ask the server for a login URL, open it in the
 * browser, then wait until a read call succeeds on this same connection.
 */
async function sessionLogin(
  row: SourceRow,
  session: { client: Client; tools: Tool[] }
): Promise<void> {
  if (!session.tools.some((t) => t.name === 'login'))
    throw new Error(`${row.name} didn't offer a login step.`)
  const result = await session.client.callTool({ name: 'login', arguments: {} })
  const text = resultText(result)
  const url = /https:\/\/[^\s"'<>)\]]+/.exec(text)?.[0]
  if (!url) throw new Error(`${row.name}: ${text.slice(0, 200) || 'no login link returned.'}`)
  await shell.openExternal(url)
  const probe = session.tools.find((t) => /^get_(profile|holdings|funds)$/.test(t.name))
  const deadline = Date.now() + SESSION_LOGIN_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    if (!probe) break
    try {
      const r = await session.client.callTool({ name: probe.name, arguments: {} })
      if (!r.isError && !/log ?in|session|unauthori[sz]ed/i.test(resultText(r).slice(0, 300))) {
        sessionReady.add(row.id)
        return
      }
    } catch {
      /* not yet */
    }
  }
  if (!probe) {
    sessionReady.add(row.id)
    return
  }
  throw new Error(`${row.name} sign-in wasn't completed. Try again.`)
}

export async function signOutSource(db: Db, id: string): Promise<void> {
  const row = getSourceRow(db, id)
  dropClient(id)
  const tokens = readJsonSecret<OAuthTokens>(db, secretName(id, 'tokens'))
  const client = readJsonSecret<{ client_id: string; client_secret?: string }>(
    db,
    secretName(id, 'client')
  )
  if (row.auth === 'oauth' && tokens && client) {
    // Best effort: ask the server to revoke the grant (RFC 7009 at the conventional path).
    await appFetch(new URL('/revoke', row.url), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: tokens.refresh_token ?? tokens.access_token,
        client_id: client.client_id,
        ...(client.client_secret ? { client_secret: client.client_secret } : {})
      }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => undefined)
  }
  setSecret(db, secretName(id, 'tokens'), null)
  setSecret(db, secretName(id, 'token'), null)
  lastError.delete(id)
}

export function addSource(
  db: Db,
  input: { name: string; url: string; auth: 'oauth' | 'token' | 'none' }
): string {
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12) || 'mcp'
  const taken = new Set(listSourceRows(db).map((r) => r.id))
  let id = slug
  while (taken.has(id) || id === 'app') id = `${slug}${randomUUID().slice(0, 4)}`
  db.insert(s.dataSources)
    .values({
      id,
      name: input.name.trim(),
      url: input.url.trim(),
      auth: input.auth,
      tokenAuthMethod: 'none',
      enabled: true,
      builtin: false,
      createdAt: new Date().toISOString()
    })
    .run()
  return id
}

export async function removeSource(db: Db, id: string): Promise<void> {
  const row = getSourceRow(db, id)
  if (row.builtin) throw new Error('Built-in sources can be turned off, not removed.')
  await signOutSource(db, id)
  setSecret(db, secretName(id, 'client'), null)
  db.delete(s.dataSources).where(eq(s.dataSources.id, id)).run()
}

export function setSourceEnabled(db: Db, id: string, enabled: boolean): void {
  getSourceRow(db, id)
  db.update(s.dataSources).set({ enabled }).where(eq(s.dataSources.id, id)).run()
  if (!enabled) dropClient(id)
}
