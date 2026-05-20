// Integration test for the AI-powered search filter generation.
// Runs inside workerd via @cloudflare/vitest-pool-workers with the real
// Cloudflare Workers AI binding (no mocks). Verifies the model returns
// a valid ClickHouse boolean condition from natural language input.

import { test, expect } from 'vitest'
import { generateSearchFilter } from './generate-filter.ts'

test('generates a condition for issues view', async () => {
  const result = await generateSearchFilter({
    view: 'issues',
    searchText: 'show me TypeErrors',
  })
  expect(result.condition).toBeTruthy()
  expect(result.condition.toLowerCase()).toContain('typeerror')
  expect(result.placement).toBe('where')
}, 30_000)

test('generates a condition for logs view', async () => {
  const result = await generateSearchFilter({
    view: 'logs',
    searchText: 'logs containing timeout',
  })
  expect(result.condition).toBeTruthy()
  expect(result.condition.toLowerCase()).toContain('timeout')
  expect(result.placement).toBe('where')
}, 30_000)

test('generates a condition for traces view', async () => {
  const result = await generateSearchFilter({
    view: 'traces',
    searchText: 'traces with more than 10 spans',
  })
  expect(result.condition).toBeTruthy()
  expect(result.placement).toMatch(/^(where|having)$/)
  // The condition should reference SpanCount or count
  expect(result.condition).toMatch(/spancount|count/i)
}, 30_000)

test('generates a condition for trace span-level filter', async () => {
  const result = await generateSearchFilter({
    view: 'traces',
    searchText: 'spans where ServiceName is api-gateway',
  })
  expect(result.condition).toBeTruthy()
  expect(result.condition).toMatch(/servicename/i)
  expect(result.placement).toBe('where')
}, 30_000)
