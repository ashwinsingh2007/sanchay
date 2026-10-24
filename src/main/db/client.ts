import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { SEED_CATEGORIES } from '../../shared/categories'
import { DEFAULT_CURRENCY } from '../../shared/money'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

// drizzle-kit generated migrations, bundled into the main process at build time.
const migrationFiles = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
  )
  const applied = new Set(
    (sqlite.prepare('SELECT name FROM __migrations').all() as { name: string }[]).map((r) => r.name)
  )
  const pending = Object.keys(migrationFiles)
    .sort()
    .filter((path) => !applied.has(path.split('/').pop()!))

  for (const path of pending) {
    const name = path.split('/').pop()!
    const statements = migrationFiles[path]!.split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    sqlite.transaction(() => {
      for (const stmt of statements) sqlite.exec(stmt)
      sqlite
        .prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)')
        .run(name, new Date().toISOString())
    })()
  }
}

function seed(sqlite: Database.Database): void {
  const insertCategory = sqlite.prepare(
    'INSERT OR IGNORE INTO categories (id, name, kind, color, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  const setColor = sqlite.prepare('UPDATE categories SET color = ? WHERE id = ?')
  sqlite.transaction(() => {
    for (const c of SEED_CATEGORIES) {
      insertCategory.run(c.id, c.name, c.kind, c.color, c.sortOrder)
      // Colours follow the app's palette (users can't edit them), so keep them current.
      setColor.run(c.color, c.id)
    }
    sqlite
      .prepare('INSERT OR IGNORE INTO user_settings (id, primary_currency) VALUES (1, ?)')
      .run(DEFAULT_CURRENCY)
  })()
}

export function openDatabase(file: string): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  runMigrations(sqlite)
  seed(sqlite)
  return { sqlite, db: drizzle(sqlite, { schema }) }
}
