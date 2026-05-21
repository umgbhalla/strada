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

import { getLogger } from '@strada.sh/sdk'
import { getOrCreateProjectJwt } from './db.ts'

const logger = getLogger('query-backend')

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

// ── ProjectId isolation ─────────────────────────────────────────────
//
// Both backends enforce project isolation, but via different mechanisms:
//
// - Tinybird: JWT row-level filtering. The JWT has `filter: "ProjectId = '...'"`,
//   and Tinybird wraps every query in a subquery internally.
//
// - ClickHouse: uses `additional_table_filters` setting (available since v22.7).
//   This tells ClickHouse to inject a WHERE filter on every read from the listed
//   tables, including inside subqueries and JOINs. It works at the engine level
//   so there's no SQL rewriting, no regex, and no edge cases with aliases, JOINs,
//   EXTRACT FROM, or user-provided SQL.
//
// Callers never mention ProjectId in their SQL. It's handled automatically.

/** All Strada tables that have a ProjectId column and need project-scoped filtering. */
const STRADA_TABLES = [
  'otel_traces',
  'otel_logs',
  'otel_errors',
  'otel_metrics_gauge',
  'otel_metrics_sum',
  'otel_metrics_histogram',
  'otel_metrics_exponential_histogram',
  'otel_analytics_pages',
  'otel_analytics_sessions',
  'otel_users',
  'otel_issue_state',
]

/** Escape a string for use inside a ClickHouse single-quoted string literal. */
function chEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Build the ClickHouse `additional_table_filters` setting value for a project.
 * Returns the map literal: {'otel_errors': 'ProjectId = \'xxx\'', ...}
 *
 * This setting tells ClickHouse to inject `WHERE ProjectId = '...'` on every
 * read from the listed tables. It works transparently with JOINs, subqueries,
 * aliases, and any SQL the user writes.
 *
 * Used by both executeBackendQuery (internal queries) and the query bridge
 * (user-facing arbitrary SQL).
 */
export function buildClickHouseTableFilters(projectId: string): string {
  const filter = `ProjectId = '${chEscape(projectId)}'`
  const entries = STRADA_TABLES
    .map((t) => `'${chEscape(t)}': '${chEscape(filter)}'`)
    .join(', ')
  return `{${entries}}`
}

/**
 * Append `additional_table_filters` SETTINGS to a SQL query for ClickHouse.
 *
 * ClickHouse syntax requires SETTINGS before FORMAT:
 *   SELECT ... SETTINGS key = value FORMAT JSON
 *
 * This function detects a trailing FORMAT clause and inserts SETTINGS before it.
 * If no FORMAT clause is found, SETTINGS is appended at the end.
 *
 * Any user-provided `additional_table_filters` in the SQL is stripped to prevent
 * overriding the server-enforced project filter.
 */
export function appendProjectFilterSettings(sql: string, projectId: string): string {
  const setting = `additional_table_filters = ${buildClickHouseTableFilters(projectId)}`

  // Strip any user-provided additional_table_filters to prevent bypass.
  // Also clean up a leftover empty SETTINGS keyword if it was the only setting.
  let cleaned = sql.replace(/additional_table_filters\s*=\s*\{[^}]*\},?\s*/gi, '')
  cleaned = cleaned.replace(/\bSETTINGS\s*(?=FORMAT\b|$)/i, '')

  // Detect trailing FORMAT clause: FORMAT <word> at the end of the SQL
  const formatMatch = cleaned.match(/\s+FORMAT\s+\w+\s*$/i)

  // Check if there's an existing SETTINGS clause (after stripping our target setting)
  const hasSettings = /\bSETTINGS\s/i.test(formatMatch ? cleaned.slice(0, cleaned.length - formatMatch[0].length) : cleaned)

  if (formatMatch) {
    const formatIdx = cleaned.length - formatMatch[0].length
    const beforeFormat = cleaned.slice(0, formatIdx)
    const formatClause = cleaned.slice(formatIdx)
    if (hasSettings) {
      return `${beforeFormat}, ${setting}${formatClause}`
    }
    return `${beforeFormat} SETTINGS ${setting}${formatClause}`
  }

  if (hasSettings) {
    return `${cleaned}, ${setting}`
  }
  return `${cleaned} SETTINGS ${setting}`
}

// ── Query execution ────────────────────────────────────────────────

/**
 * Execute a SQL query against the configured backend.
 *
 * **Project isolation is automatic.** Callers should NOT include ProjectId
 * in their SQL. For Tinybird, the JWT filter handles it. For ClickHouse,
 * this function wraps table references with ProjectId-filtered subqueries.
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
    const filteredSql = appendProjectFilterSettings(sql, project.id)
    const endpoint = `${dbConfig.clickhouseUrl}/?database=${encodeURIComponent(dbConfig.clickhouseDatabase || 'default')}&query=${encodeURIComponent(filteredSql)}`
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
      logger.error({ message: `failed to write to Tinybird table "${table}"`, status: res.status, response: text })
      throw new Error(`failed to write to ${table}`)
    }
    const resBody = await res.json().catch(() => null) as null | {
      successful_rows?: number
      quarantined_rows?: number
    }
    if (resBody && ((resBody.quarantined_rows ?? 0) > 0 || (resBody.successful_rows ?? 0) !== 1)) {
      logger.error({ message: `Tinybird write warning for table "${table}"`, result: JSON.stringify(resBody) })
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
      logger.error({ message: `failed to write to ClickHouse table "${table}"`, status: res.status, response: text })
      throw new Error(`failed to write to ${table}`)
    }
    return
  }

  throw new Error(`unknown backend "${dbConfig.backend}"`)
}

