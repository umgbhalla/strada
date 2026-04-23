import { expect, test } from 'vitest'
import { deployTinybirdResources, getDeploymentManagedReadToken, TinybirdClient } from './tinybird.ts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function getInputUrl(input: string | URL | Request) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

test('deployTinybirdResources removes stale deployments and promotes the new one', async () => {
  const calls: string[] = []

  const client = new TinybirdClient({
    baseUrl: 'https://api.tinybird.co',
    token: 'tb_token',
    fetch: (async (input, init) => {
      const url = new URL(getInputUrl(input))
      const method = init?.method ?? 'GET'
      calls.push(`${method} ${url.pathname}`)

      if (method === 'GET' && url.pathname === '/v1/deployments') {
        return jsonResponse({
          deployments: [
            { id: 'stale', status: 'draft', live: false },
            { id: 'live', status: 'live', live: true },
          ],
        })
      }

      if (method === 'DELETE' && url.pathname === '/v1/deployments/stale') {
        return new Response(null, { status: 204 })
      }

      if (method === 'POST' && url.pathname === '/v1/deploy') {
        return jsonResponse({
          result: 'success',
          deployment: { id: 'dep_1', status: 'pending' },
        })
      }

      if (method === 'GET' && url.pathname === '/v1/deployments/dep_1') {
        return jsonResponse({
          result: 'ok',
          deployment: { id: 'dep_1', status: 'data_ready' },
        })
      }

      if (method === 'POST' && url.pathname === '/v1/deployments/dep_1/set-live') {
        return new Response(null, { status: 200 })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}`)
    }) as typeof fetch,
  })

  const result = await deployTinybirdResources({
    client,
    datasources: [{ name: 'otel_traces', content: 'SCHEMA >' }],
    pipes: [],
    pollIntervalMs: 0,
    maxPollAttempts: 1,
  })

  expect(result).toMatchInlineSnapshot(`
    {
      "deploymentId": "dep_1",
      "result": "updated",
    }
  `)
  expect(calls).toMatchInlineSnapshot(`
    [
      "GET /v1/deployments",
      "DELETE /v1/deployments/stale",
      "POST /v1/deploy",
      "GET /v1/deployments/dep_1",
      "POST /v1/deployments/dep_1/set-live",
    ]
  `)
})

test('deployTinybirdResources returns no_changes without polling or promotion', async () => {
  const calls: string[] = []

  const client = new TinybirdClient({
    baseUrl: 'https://api.tinybird.co',
    token: 'tb_token',
    fetch: (async (input, init) => {
      const url = new URL(getInputUrl(input))
      const method = init?.method ?? 'GET'
      calls.push(`${method} ${url.pathname}`)

      if (method === 'GET' && url.pathname === '/v1/deployments') {
        return jsonResponse({ deployments: [] })
      }

      if (method === 'POST' && url.pathname === '/v1/deploy') {
        return jsonResponse({ result: 'no_changes' })
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}`)
    }) as typeof fetch,
  })

  const result = await deployTinybirdResources({
    client,
    datasources: [{ name: 'otel_logs', content: 'SCHEMA >' }],
    pipes: [],
    pollIntervalMs: 0,
  })

  expect(result).toMatchInlineSnapshot(`
    {
      "result": "no_changes",
    }
  `)
  expect(calls).toMatchInlineSnapshot(`
    [
      "GET /v1/deployments",
      "POST /v1/deploy",
    ]
  `)
})

test('getDeploymentManagedReadToken returns a useful error when the managed token is missing', async () => {
  const client = new TinybirdClient({
    baseUrl: 'https://api.tinybird.co',
    token: 'tb_token',
    fetch: (async (input) => {
      const url = new URL(getInputUrl(input))
      if (url.pathname === '/v0/tokens') {
        return jsonResponse({
          tokens: [
            { token: 'abc', name: 'custom-token', scopes: [] },
          ],
        })
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    }) as typeof fetch,
  })

  const result = await getDeploymentManagedReadToken(client)

  expect(result).toMatchInlineSnapshot(
    '[Error: Tinybird deployment succeeded but the deployment-managed STRADA_READ_TOKEN was not found. Make sure the datasource files define TOKEN STRADA_READ_TOKEN READ.]',
  )
})
