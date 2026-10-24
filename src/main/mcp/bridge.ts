import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { app } from 'electron'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Db } from '../db/client'
import { callHubTool, hubTools } from './hub'
import { redact } from '../../shared/domain/redact'
import { redactTerms } from '../redaction'

/**
 * A private MCP server on 127.0.0.1 that hands the tool hub to Claude Code (`claude -p
 * --mcp-config`). It only answers requests carrying a random per-launch bearer token.
 */
export interface Bridge {
  url: string
  token: string
}

let bridge: Promise<Bridge> | null = null

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(raw ? JSON.parse(raw) : undefined)
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function mcpServer(db: Db): Server {
  const server = new Server(
    { name: 'personal-ai-cfo', version: app.getVersion() },
    { capabilities: { tools: {} } }
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await hubTools(db)).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: 'object' }
    }))
  }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { text: raw, isError } = await callHubTool(
      db,
      req.params.name,
      (req.params.arguments ?? {}) as Record<string, unknown>
    )
    // Claude Code sends these to Anthropic, so mask identifiers (amounts are untouched).
    const text = redact(raw, redactTerms(db))
    return { content: [{ type: 'text', text }], isError }
  })
  return server
}

export function ensureBridge(db: Db): Promise<Bridge> {
  bridge ??= new Promise<Bridge>((resolve, reject) => {
    const token = randomBytes(24).toString('hex')
    const http: HttpServer = createServer((req, res) => {
      if (req.headers.authorization !== `Bearer ${token}` || !req.url?.startsWith('/mcp')) {
        res.writeHead(401).end()
        return
      }
      void (async () => {
        // Stateless: a fresh server + transport per request.
        const server = mcpServer(db)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        res.on('close', () => {
          void transport.close()
          void server.close()
        })
        try {
          await server.connect(transport)
          const body = req.method === 'POST' ? await readBody(req) : undefined
          await transport.handleRequest(req, res, body)
        } catch (e) {
          console.error('[bridge] request failed', e)
          if (!res.headersSent) res.writeHead(500).end()
        }
      })()
    })
    http.on('error', (e) => {
      bridge = null
      reject(e)
    })
    http.listen(0, '127.0.0.1', () => {
      const { port } = http.address() as AddressInfo
      resolve({ url: `http://127.0.0.1:${port}/mcp`, token })
    })
  })
  return bridge
}
