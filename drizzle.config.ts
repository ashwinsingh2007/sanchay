import { defineConfig } from 'drizzle-kit'

// Only used at development time to generate SQL migrations from the schema.
// The app itself never reads this file.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations'
})
