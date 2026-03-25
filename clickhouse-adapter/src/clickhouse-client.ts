// ClickHouse HTTP interface client for INSERT and query operations.
//
// INSERT: POST with JSONEachLine format (NDJSON with PascalCase column names)
// Query:  POST with SQL, returns JSON

import type { ClickHouseCredentials } from './auth.ts'

/**
 * Insert NDJSON rows into a ClickHouse table.
 * The NDJSON must already have PascalCase column names matching the DDL.
 */
export async function insertIntoClickHouse(
  clickhouseUrl: string,
  database: string,
  table: string,
  ndjson: string,
  credentials: ClickHouseCredentials,
): Promise<{ ok: boolean; error?: string }> {
  const query = `INSERT INTO ${database}.${table} FORMAT JSONEachLine`
  const url = `${clickhouseUrl}/?query=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-ClickHouse-User': credentials.user,
      'X-ClickHouse-Key': credentials.password,
    },
    body: ndjson,
  })

  if (!response.ok) {
    const body = await response.text()
    return { ok: false, error: `ClickHouse error ${response.status}: ${body}` }
  }

  return { ok: true }
}

/**
 * Execute a SQL query against ClickHouse and return the result.
 * Returns the raw ClickHouse response body.
 */
export async function queryClickHouse(
  clickhouseUrl: string,
  database: string,
  sql: string,
  credentials: ClickHouseCredentials,
): Promise<{ ok: boolean; data?: string; error?: string }> {
  // Append FORMAT JSON if not already specified
  const trimmedSql = sql.trim().replace(/;$/, '')
  const hasFormat = /FORMAT\s+\w+/i.test(trimmedSql)
  const finalSql = hasFormat ? trimmedSql : `${trimmedSql} FORMAT JSON`

  const url = `${clickhouseUrl}/?database=${encodeURIComponent(database)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-ClickHouse-User': credentials.user,
      'X-ClickHouse-Key': credentials.password,
    },
    body: finalSql,
  })

  const body = await response.text()

  if (!response.ok) {
    return { ok: false, error: `ClickHouse error ${response.status}: ${body}` }
  }

  return { ok: true, data: body }
}
