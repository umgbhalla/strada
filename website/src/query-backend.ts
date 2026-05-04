// Shared helpers for querying and writing to Tinybird or ClickHouse.
//
// Both the API routes (api.ts) and the alert cron (alert-check.ts) need to
// execute SQL queries and insert rows against the user's configured backend.
// This file centralizes the if-tinybird/if-clickhouse branching so callers
// don't copy-paste the same fetch logic.
//
// The otel-collector has its own Backend abstraction (backend.ts) for ingest.
// That handles NDJSON streaming and field remapping for all signal types.
// This file is simpler: it covers SQL reads and single-row writes that the
// website control plane needs (issue state, alert checks, query bridge).

import { getOrCreateProjectJwt } from './db.ts'

// ── Types ──────────────────────────────────────────────────────────

export interface DbConfig {
  backend: string
  tinybirdEndpoint: string | null
  tinybirdAdminToken: string | null
  tinybirdReadToken?: string | null
  clickhouseUrl: string | null
  clickhouseDatabase: string | null
  clickhouseUser: string | null
  clickhousePassword: string | null
}

export interface ProjectJwtInfo {
  id: string
  tinybirdJwt: string | null
  tinybirdJwtDatasources: string | null
}

export interface QueryResult {
  data?: Record<string, unknown>[]
  rows?: number
  meta?: { name: string; type: string }[]
  statistics?: { elapsed: number; rows_read: number; bytes_read: number }
  raw?: string
  contentType?: string
}

// ── Query execution ────────────────────────────────────────────────

/**
 * Execute a SQL query against the configured backend.
 * For Tinybird, uses a project-scoped JWT (auto-generated if needed).
 * For ClickHouse, uses basic auth headers.
 *
 * Returns the parsed JSON response. Throws on HTTP errors.
 */
export async function executeBackendQuery(ctx: {
  dbConfig: DbConfig
  project: ProjectJwtInfo
  sql: string
}): Promise<QueryResult> {
  const { dbConfig, project, sql } = ctx

  if (dbConfig.backend === 'tinybird') {
    if (!dbConfig.tinybirdEndpoint || !dbConfig.tinybirdAdminToken) {
      throw new Error('tinybird not configured')
    }
    const jwt = await getOrCreateProjectJwt({
      projectId: project.id,
      tinybirdEndpoint: dbConfig.tinybirdEndpoint,
      tinybirdAdminToken: dbConfig.tinybirdAdminToken,
      tinybirdJwt: project.tinybirdJwt,
      tinybirdJwtDatasources: project.tinybirdJwtDatasources,
    })
    const res = await fetch(`${dbConfig.tinybirdEndpoint}/v0/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ q: sql }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Tinybird query failed: ${res.status} ${text}`)
    }
    return await res.json()
  }

  if (dbConfig.backend === 'clickhouse') {
    if (!dbConfig.clickhouseUrl) {
      throw new Error('clickhouse not configured')
    }
    const endpoint = `${dbConfig.clickhouseUrl}/?database=${encodeURIComponent(dbConfig.clickhouseDatabase || 'default')}&query=${encodeURIComponent(sql)}`
    const res = await fetch(endpoint, {
      headers: {
        'X-ClickHouse-User': dbConfig.clickhouseUser || 'default',
        'X-ClickHouse-Key': dbConfig.clickhousePassword || '',
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`ClickHouse query failed: ${res.status} ${text}`)
    }
    return await res.json()
  }

  throw new Error(`unknown backend "${dbConfig.backend}"`)
}

// ── Row insertion ──────────────────────────────────────────────────

/**
 * Insert a single row into a table. The row must use PascalCase keys matching
 * the ClickHouse/Tinybird column names (ProjectId, FingerprintHash, etc.).
 *
 * - Tinybird: POST /v0/events with wait=true for read-after-write consistency.
 *   Uses the admin token (not the project JWT) since Events API needs write access.
 * - ClickHouse: INSERT INTO {table} FORMAT JSONEachRow with auth headers.
 *
 * Throws on HTTP errors or quarantined rows (Tinybird).
 */
export async function insertBackendRow(ctx: {
  dbConfig: DbConfig
  table: string
  row: Record<string, unknown>
}): Promise<void> {
  const { dbConfig, table, row } = ctx
  const body = JSON.stringify(row)

  if (dbConfig.backend === 'tinybird') {
    if (!dbConfig.tinybirdEndpoint || !dbConfig.tinybirdAdminToken) {
      throw new Error('tinybird not configured')
    }
    const res = await fetch(`${dbConfig.tinybirdEndpoint}/v0/events?name=${table}&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-ndjson',
        Authorization: `Bearer ${dbConfig.tinybirdAdminToken}`,
      },
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`Failed to write to Tinybird table "${table}": ${res.status} ${text}`)
      throw new Error(`failed to write to ${table}`)
    }
    const resBody = await res.json().catch(() => null) as null | {
      successful_rows?: number
      quarantined_rows?: number
    }
    if (resBody && ((resBody.quarantined_rows ?? 0) > 0 || (resBody.successful_rows ?? 0) !== 1)) {
      console.error(`Tinybird write warning for table "${table}": ${JSON.stringify(resBody)}`)
      throw new Error(`failed to write to ${table}`)
    }
    return
  }

  if (dbConfig.backend === 'clickhouse') {
    if (!dbConfig.clickhouseUrl) {
      throw new Error('clickhouse not configured')
    }
    const insertSql = `INSERT INTO ${table} FORMAT JSONEachRow`
    const endpoint = `${dbConfig.clickhouseUrl}/?database=${encodeURIComponent(dbConfig.clickhouseDatabase || 'default')}&query=${encodeURIComponent(insertSql)}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ClickHouse-User': dbConfig.clickhouseUser || 'default',
        'X-ClickHouse-Key': dbConfig.clickhousePassword || '',
      },
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`Failed to write to ClickHouse table "${table}": ${res.status} ${text}`)
      throw new Error(`failed to write to ${table}`)
    }
    return
  }

  throw new Error(`unknown backend "${dbConfig.backend}"`)
}

// ── ProjectId filter helper ────────────────────────────────────────

/**
 * Returns a SQL fragment for explicit ProjectId filtering.
 * Tinybird handles this via JWT row-level filtering, so returns empty string.
 * ClickHouse needs an explicit WHERE clause.
 *
 * Usage:
 *   const pf = projectFilter(dbConfig, projectId)
 *   const sql = `SELECT ... FROM table WHERE ${pf}FingerprintHash = '...'`
 *   // Tinybird:   "... WHERE FingerprintHash = '...'"
 *   // ClickHouse: "... WHERE ProjectId = '01...' AND FingerprintHash = '...'"
 */
export function projectFilter(dbConfig: DbConfig, projectId: string): string {
  return dbConfig.backend === 'clickhouse' ? `ProjectId = '${projectId}' AND ` : ''
}
