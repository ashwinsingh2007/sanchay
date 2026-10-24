import { safeStorage } from 'electron'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'

/**
 * API keys for optional cloud providers. Encrypted with macOS Keychain-backed safeStorage before
 * being written to SQLite; never sent to the renderer.
 */
export function setSecret(db: Db, name: string, value: string | null): void {
  if (!value) {
    db.delete(s.secrets).where(eq(s.secrets.name, name)).run()
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage (Keychain) is not available, so the API key cannot be saved.')
  }
  const encrypted = safeStorage.encryptString(value).toString('base64')
  db.insert(s.secrets)
    .values({ name, encrypted, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: s.secrets.name,
      set: { encrypted, updatedAt: new Date().toISOString() }
    })
    .run()
}

export function getSecret(db: Db, name: string): string | null {
  const row = db.select().from(s.secrets).where(eq(s.secrets.name, name)).get()
  if (!row) return null
  try {
    return safeStorage.decryptString(Buffer.from(row.encrypted, 'base64'))
  } catch {
    return null
  }
}

export function hasSecret(db: Db, name: string): boolean {
  return !!db.select({ name: s.secrets.name }).from(s.secrets).where(eq(s.secrets.name, name)).get()
}
