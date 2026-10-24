/**
 * Regenerates the anonymised development fixtures from the deterministic sample generator.
 *   npm run fixture
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateSampleStatements } from '../src/shared/sampleData.ts'

const [bank, card] = generateSampleStatements('2026-09-30')
const dir = join(import.meta.dirname, '..', 'fixtures')
writeFileSync(join(dir, 'sample-bank-statement.csv'), bank!.csv)
writeFileSync(join(dir, 'sample-credit-card.csv'), card!.csv)
console.log('Wrote fixtures/sample-bank-statement.csv and fixtures/sample-credit-card.csv')
