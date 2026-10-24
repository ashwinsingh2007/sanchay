import { describe, expect, it } from 'vitest'
import type { ProfileEntry } from '../types'
import { NOTE_PREFIX, PROFILE_QUESTIONS, SKIPPED, isAnswered, profileDigest } from './profile'

const entry = (key: string, value: string, source: ProfileEntry['source'] = 'questionnaire') => ({
  key,
  value,
  source,
  updatedAt: '2026-10-24T00:00:00.000Z'
})

describe('profileDigest', () => {
  it('lists answers, chat notes and what is still unknown', () => {
    const text = profileDigest([
      entry('loans', 'Home loan ₹40L at 8.5%'),
      entry('risk', SKIPPED),
      entry(`${NOTE_PREFIX}1`, 'Bonus of ₹3L expected in March', 'chat')
    ])
    expect(text).toContain('Do you have any loans? Home loan ₹40L at 8.5%')
    expect(text).toContain('(from chat, 2026-10-24) Bonus of ₹3L expected in March')
    expect(text).toContain('- risk: How do you feel about investment ups and downs? (user skipped)')
    expect(text).not.toContain('- loans:')
  })

  it('treats skipped and blank answers as unanswered', () => {
    expect(isAnswered(entry('age', SKIPPED))).toBe(false)
    expect(isAnswered(entry('age', '  '))).toBe(false)
    expect(isAnswered(entry('age', '32'))).toBe(true)
  })

  it('asks every question when nothing is known', () => {
    const text = profileDigest([])
    expect(text).toContain('Nothing shared yet.')
    for (const q of PROFILE_QUESTIONS) expect(text).toContain(`- ${q.key}:`)
  })
})
