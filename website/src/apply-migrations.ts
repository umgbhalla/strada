// Setup file that applies D1 migrations before tests run inside workerd.
// Runs per test file. applyD1Migrations() is idempotent.
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
