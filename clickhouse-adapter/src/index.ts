// Tinybird API-compatible adapter for generic ClickHouse.
//
// Implements two Tinybird endpoints:
//   POST /v0/events?name={table}  — Events API (ingestion)
//   POST /v0/sql                  — Query API (reads)
//   GET  /v0/sql?q={sql}          — Query API (reads, query in URL)
//
// Auth: Bearer token = base64("clickhouse_user:clickhouse_password")
// The adapter decodes the credentials and uses them to connect to ClickHouse.

import { Spiceflow } from 'spiceflow'
import { cors } from 'spiceflow/cors'
import { env } from 'cloudflare:workers'
import { parseCredentials } from './auth.ts'
import { remapNdjson } from './field-mapping.ts'
import { insertIntoClickHouse, queryClickHouse } from './clickhouse-client.ts'

interface Env {
  CLICKHOUSE_URL: string
  CLICKHOUSE_DATABASE: string
}

function getEnv(): Env {
  return env as unknown as Env
}

const app = new Spiceflow()
  .use(
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['content-type', 'authorization'],
      maxAge: 86400,
    }),
  )

  // ── Events API: NDJSON ingestion ──
  .post('/v0/events', async ({ request }) => {
    const credentials = parseCredentials(
      request.headers.get('authorization'),
    )
    if (!credentials) {
      return new Response('Unauthorized: Bearer token must be base64(user:password)', {
        status: 401,
      })
    }

    const url = new URL(request.url)
    const tableName = url.searchParams.get('name')
    if (!tableName) {
      return new Response('Missing ?name= query parameter', { status: 400 })
    }

    const ndjson = await request.text()
    if (!ndjson.trim()) {
      return new Response('Empty body', { status: 400 })
    }

    const e = getEnv()

    // Remap snake_case NDJSON keys to PascalCase ClickHouse column names
    const remappedNdjson = remapNdjson(ndjson, tableName)

    const result = await insertIntoClickHouse(
      e.CLICKHOUSE_URL,
      e.CLICKHOUSE_DATABASE,
      tableName,
      remappedNdjson,
      credentials,
    )

    if (!result.ok) {
      console.error(result.error)
      return new Response(result.error, { status: 502 })
    }

    return Response.json({ successful_rows: ndjson.trim().split('\n').length, quarantined_rows: 0 })
  })

  // ── Query API: SQL pass-through ──
  .post('/v0/sql', async ({ request }) => {
    const credentials = parseCredentials(
      request.headers.get('authorization'),
    )
    if (!credentials) {
      return new Response('Unauthorized', { status: 401 })
    }

    const e = getEnv()
    const sql = await request.text()

    const result = await queryClickHouse(
      e.CLICKHOUSE_URL,
      e.CLICKHOUSE_DATABASE,
      sql,
      credentials,
    )

    if (!result.ok) {
      return new Response(result.error, { status: 502 })
    }

    return new Response(result.data, {
      headers: { 'content-type': 'application/json' },
    })
  })
  .get('/v0/sql', async ({ request }) => {
    const credentials = parseCredentials(
      request.headers.get('authorization'),
    )
    if (!credentials) {
      return new Response('Unauthorized', { status: 401 })
    }

    const url = new URL(request.url)
    const sql = url.searchParams.get('q')
    if (!sql) {
      return new Response('Missing ?q= query parameter', { status: 400 })
    }

    const e = getEnv()

    const result = await queryClickHouse(
      e.CLICKHOUSE_URL,
      e.CLICKHOUSE_DATABASE,
      sql,
      credentials,
    )

    if (!result.ok) {
      return new Response(result.error, { status: 502 })
    }

    return new Response(result.data, {
      headers: { 'content-type': 'application/json' },
    })
  })

export default {
  fetch(request: Request) {
    return app.handle(request)
  },
}

export { app }
