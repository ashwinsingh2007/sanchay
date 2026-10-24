import type { RedactTerm } from '../shared/domain/redact'
import { getSalaryProfile } from './analysis'
import type { Db } from './db/client'

/** Names to hide from cloud models on top of the always-masked identifiers. */
export function redactTerms(db: Db): RedactTerm[] {
  const employer = getSalaryProfile(db)?.employer
  return employer ? [{ value: employer, label: '[employer]' }] : []
}
