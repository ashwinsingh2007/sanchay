import type { Db } from '../db/client'
import { LOCAL_TOOLS } from './localTools'
import {
  callSourceTool,
  BUILTIN_SOURCES,
  HIDDEN_TOOLS,
  isBlockedTool,
  isConnected,
  listSourceRows,
  sourceSession
} from './sources'

/**
 * Every tool the AI CFO may call in chat: the app's own data plus each enabled, connected data
 * source. Names are `<source>__<tool>` so one flat list can be handed to any model. Tools that
 * could change something on a server are left out.
 */
export interface HubTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  source: string
  sourceName: string
}

const LOCAL = 'app'
const MAX_RESULT_CHARS = 40_000

const hubName = (source: string, tool: string): string => `${source}__${tool}`.slice(0, 64)

export async function hubTools(db: Db): Promise<HubTool[]> {
  const tools: HubTool[] = LOCAL_TOOLS.map((t) => ({
    name: hubName(LOCAL, t.name),
    description: t.description,
    inputSchema: t.inputSchema,
    source: LOCAL,
    sourceName: 'Sanchay'
  }))
  const rows = listSourceRows(db).filter((r) => r.enabled && isConnected(db, r))
  const sessions = await Promise.all(
    rows.map((r) =>
      sourceSession(db, r.id)
        .then((x) => ({ row: r, tools: x.tools }))
        .catch((e: unknown) => {
          console.warn(`[hub] ${r.id} unavailable`, e instanceof Error ? e.message : e)
          return null
        })
    )
  )
  for (const sess of sessions) {
    if (!sess) continue
    for (const t of sess.tools) {
      if (isBlockedTool(t, sess.row.id) || HIDDEN_TOOLS.has(t.name)) continue
      tools.push({
        name: hubName(sess.row.id, t.name),
        description: `[${sess.row.name}] ${t.description ?? ''}`.trim(),
        inputSchema: t.inputSchema as Record<string, unknown>,
        source: sess.row.id,
        sourceName: sess.row.name
      })
    }
  }
  return tools
}

/** Short label for the chat ("INDmoney · networth holdings"). */
export function toolLabel(name: string): string {
  if (!name.includes('__')) return name === 'WebSearch' ? 'Searching the web' : name
  const [source, ...rest] = name.split('__')
  const tool = rest.join('__').replace(/_/g, ' ')
  const sourceName =
    source === LOCAL ? 'Your data' : (BUILTIN_SOURCES.find((b) => b.id === source)?.name ?? source)
  return `${sourceName} · ${tool}`
}

export async function callHubTool(
  db: Db,
  name: string,
  args: Record<string, unknown>
): Promise<{ text: string; isError: boolean }> {
  const [source, ...rest] = name.split('__')
  const tool = rest.join('__')
  try {
    if (source === LOCAL) {
      const local = LOCAL_TOOLS.find((t) => t.name === tool)
      if (!local) return { text: `Unknown tool ${name}`, isError: true }
      return { text: local.run(db, args), isError: false }
    }
    const row = listSourceRows(db).find((r) => r.id === source)
    if (!row?.enabled) return { text: `${source} is turned off.`, isError: true }
    const result = await callSourceTool(db, row.id, tool, args)
    return {
      text:
        result.text.length > MAX_RESULT_CHARS
          ? `${result.text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)`
          : result.text,
      isError: result.isError
    }
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), isError: true }
  }
}
