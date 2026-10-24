import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { StreamArgs } from './providers'

/**
 * Uses the Claude Code CLI already installed and signed in on this Mac, so the AI CFO runs on the
 * user's Claude subscription without an API key. Each call is a one-shot `claude -p` with every
 * tool, hook, plugin and MCP server switched off; it only answers from the prompt we send.
 */
const run = promisify(execFile)
const CANDIDATES = [
  join(homedir(), '.local/bin/claude'),
  join(homedir(), '.claude/local/claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude'
]
const STATUS_TTL_MS = 30_000
/** Name of the app's tool bridge inside Claude Code; its tools appear as mcp__cfo__<tool>. */
const MCP_NAME = 'cfo'

export interface ClaudeCodeStatus {
  path: string | null
  loggedIn: boolean
}

let cached: { at: number; status: ClaudeCodeStatus } | null = null

async function findCli(): Promise<string | null> {
  const known = CANDIDATES.find((p) => existsSync(p))
  if (known) return known
  // Apps opened from Finder get a minimal PATH, so ask a login shell.
  try {
    const { stdout } = await run('/bin/zsh', ['-lc', 'command -v claude'], { timeout: 4000 })
    const path = stdout.trim()
    return path && existsSync(path) ? path : null
  } catch {
    return null
  }
}

export async function claudeCodeStatus(): Promise<ClaudeCodeStatus> {
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.status
  const path = await findCli()
  let loggedIn = false
  if (path) {
    try {
      const { stdout } = await run(path, ['auth', 'status'], { timeout: 8000 })
      loggedIn = (JSON.parse(stdout) as { loggedIn?: boolean }).loggedIn === true
    } catch {
      loggedIn = false
    }
  }
  cached = { at: Date.now(), status: { path, loggedIn } }
  return cached.status
}

/** Flattens the chat history into one prompt, since each CLI call starts fresh. */
function toPrompt(messages: StreamArgs['messages']): string {
  if (messages.length === 1) return messages[0]!.content
  const turns = messages.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`).join('\n\n')
  return `Conversation so far:\n\n${turns}\n\nReply to the last user message.`
}

export async function streamClaudeCode(a: StreamArgs): Promise<void> {
  const { path, loggedIn } = await claudeCodeStatus()
  if (!path) throw new Error('Claude Code is not installed on this Mac.')
  if (!loggedIn) throw new Error('Sign in to Claude Code first: run `claude auth login`.')

  // An empty working directory, so no project CLAUDE.md or settings are picked up.
  const cwd = join(tmpdir(), 'personal-cfo-claude')
  mkdirSync(cwd, { recursive: true })
  const allowed = [...(a.webSearch ? ['WebSearch'] : []), ...(a.tools ? [`mcp__${MCP_NAME}`] : [])]
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    '--model',
    a.model,
    '--system-prompt',
    a.system,
    '--tools',
    a.webSearch ? 'WebSearch' : '',
    ...(a.tools
      ? [
          '--mcp-config',
          JSON.stringify({
            mcpServers: {
              [MCP_NAME]: {
                type: 'http',
                url: a.tools.bridge.url,
                headers: { Authorization: `Bearer ${a.tools.bridge.token}` }
              }
            }
          })
        ]
      : []),
    ...(allowed.length ? ['--allowedTools', allowed.join(',')] : [])
  ]

  await new Promise<void>((resolve, reject) => {
    const child = spawn(path, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let buffer = ''
    let stderr = ''
    let failure: string | null = null
    const onAbort = (): void => {
      child.kill()
    }
    a.signal.addEventListener('abort', onAbort, { once: true })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        let j: {
          type?: string
          is_error?: boolean
          result?: string
          event?: {
            type?: string
            delta?: { type?: string; text?: string }
            content_block?: { type?: string; name?: string }
          }
        }
        try {
          j = JSON.parse(line)
        } catch {
          continue
        }
        const d = j.event?.delta
        if (
          j.type === 'stream_event' &&
          j.event?.type === 'content_block_delta' &&
          d?.type === 'text_delta' &&
          d.text
        )
          a.onText(d.text)
        else if (
          j.type === 'stream_event' &&
          j.event?.type === 'content_block_start' &&
          j.event.content_block?.type === 'tool_use' &&
          j.event.content_block.name
        ) {
          const name = j.event.content_block.name
          a.tools?.onTool(name.replace(`mcp__${MCP_NAME}__`, ''))
          // Keep text from before and after the tool call apart.
          a.onText('\n\n')
        } else if (j.type === 'result' && j.is_error) failure = j.result || 'Claude Code failed.'
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      a.signal.removeEventListener('abort', onAbort)
      if (a.signal.aborted) reject(new Error('Cancelled'))
      else if (failure) reject(new Error(`Claude Code: ${failure}`))
      else if (code !== 0)
        reject(new Error(`Claude Code exited (${code}): ${stderr.trim().slice(0, 300)}`))
      else resolve()
    })
    child.stdin.end(toPrompt(a.messages))
  })
}
