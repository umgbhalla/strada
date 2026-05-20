// Integration test for the AI-powered search filter generation.
// Runs inside workerd via @cloudflare/vitest-pool-workers with the real
// Cloudflare Workers AI binding (no mocks). Verifies the model returns
// valid ClickHouse SQL fragments from natural language input.

import { test, expect } from 'vitest'
import { generateSearchFilter } from './generate-filter.ts'

test('generates a where for issues view', async () => {
  const result = await generateSearchFilter({
    view: 'issues',
    searchText: 'show me TypeErrors',
  })
  expect(result.where).toBeTruthy()
  expect(result.where.toLowerCase()).toContain('typeerror')
}, 30_000)

test('generates a where for logs view', async () => {
  const result = await generateSearchFilter({
    view: 'logs',
    searchText: 'logs containing timeout',
  })
  expect(result.where).toBeTruthy()
  expect(result.where.toLowerCase()).toContain('timeout')
}, 30_000)

test('generates having for traces with span count filter', async () => {
  const result = await generateSearchFilter({
    view: 'traces',
    searchText: 'traces with more than 10 spans',
  })
  // Should have either a where with date filter or a having with SpanCount
  expect(result.where || result.having).toBeTruthy()
  // The having should reference SpanCount or count for the aggregate filter
  expect(result.having).toMatch(/spancount|count/i)
}, 30_000)

test('generates where for trace span-level filter', async () => {
  const result = await generateSearchFilter({
    view: 'traces',
    searchText: 'spans where ServiceName is api-gateway',
  })
  expect(result.where).toBeTruthy()
  expect(result.where).toMatch(/servicename/i)
}, 30_000)
