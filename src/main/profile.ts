import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { NOTE_PREFIX, PROFILE_QUESTIONS } from '../shared/domain/profile'
import type { ProfileEntry } from '../shared/types'
import type { Db } from './db/client'
import * as s from './db/schema'

/** The CFO profile: setup answers plus facts the AI CFO saved from chat. */
export function listProfile(db: Db): ProfileEntry[] {
  return db.select().from(s.cfoProfile).orderBy(asc(s.cfoProfile.updatedAt)).all()
}

export function setProfileAnswer(
  db: Db,
  key: string,
  value: string,
  source: ProfileEntry['source']
): ProfileEntry {
  if (!PROFILE_QUESTIONS.some((q) => q.key === key) && !key.startsWith(NOTE_PREFIX))
    throw new Error(`Unknown profile question: ${key}`)
  const entry: ProfileEntry = {
    key,
    value: value.trim(),
    source,
    updatedAt: new Date().toISOString()
  }
  db.insert(s.cfoProfile)
    .values(entry)
    .onConflictDoUpdate({
      target: s.cfoProfile.key,
      set: { value: entry.value, source, updatedAt: entry.updatedAt }
    })
    .run()
  return entry
}

export function addProfileNote(db: Db, value: string): ProfileEntry {
  return setProfileAnswer(db, `${NOTE_PREFIX}${randomUUID()}`, value, 'chat')
}

export function deleteProfileEntry(db: Db, key: string): void {
  db.delete(s.cfoProfile).where(eq(s.cfoProfile.key, key)).run()
}
