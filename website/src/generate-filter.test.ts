// Integration test for the AI-powered search filter generation.
// Runs inside workerd via @cloudflare/vitest-pool-workers with the real
// Cloudflare Workers AI binding (no mocks). Verifies the model returns
// a valid ClickHouse boolean condition from natural language input.

import { test, expect } from 'vitest'
import { generateSearchFilter } from './generate-filter.ts'

test('generates a condition for issues view', async () => {
  const condition = await generateSearchFilter({
    view: 'issues',
    searchText: 'show me TypeErrors',
  })
  expect(condition).toBeTruthy()
  expect(condition.toLowerCase()).toContain('typeerror')
}, 30_000)

test('generates a condition for logs view', async () => {
  const condition = await generateSearchFilter({
    view: 'logs',
    searchText: 'logs containing timeout',
  })
  expect(condition).toBeTruthy()
  expect(condition.toLowerCase()).toContain('timeout')
}, 30_000)

test('generates a condition for traces view', async () => {
  const condition = await generateSearchFilter({
    view: 'traces',
    searchText: 'slow spans over 5 seconds',
  })
  expect(condition).toBeTruthy()
  expect(condition).toMatch(/duration/i)
}, 30_000)
