// Server-side SQL tagged template for querying project data from RSC pages/loaders.
//
// Returns rows with numeric values already coerced from strings to numbers.
// Uses the same backend resolution as the query API route (executeBackendQuery)
// but without an HTTP round-trip — calls the function directly.
//
// Usage in a page handler or loader:
//
//   const sql = createSql({ projectId, userId })
//   const rows = await sql`
//     SELECT ServiceName, count() AS errors
//     FROM otel_errors
//     GROUP BY ServiceName
//     ORDER BY errors DESC
//     LIMIT 10
//   `
//   // rows = [{ ServiceName: "api", errors: 1523 }, ...]
//   //                                ^^^^ number, not string

import { executeBackendQuery } from '../query-backend.ts'
import { getAccessibleProject } from '../db.ts'

const NUMERIC_TYPE_RE = /Int|Float|Decimal/

interface CreateSqlOptions {
  projectId: string
  userId: string
}

type SqlRow = Record<string, string | number>

/**
 * Create a SQL tagged template function scoped to a project.
 * The returned function sends queries directly to the project's backend
 * (Tinybird or ClickHouse) with project isolation enforced automatically.
 */
export function createSql({ projectId, userId }: CreateSqlOptions) {
  return async function sql(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<SqlRow[]> {
    const sqlString = buildSqlString(strings, values)

    const proj = await getAccessibleProject({ userId, projectId })
    if (!proj) throw new Error('Project not found or not accessible')

    const dbConfig = proj.database
    if (!dbConfig) throw new Error('No database configured for this project')

    const result = await executeBackendQuery({
      dbConfig,
      project: {
        id: projectId,
        tinybirdJwt: proj.tinybirdJwt,
        tinybirdJwtDatasources: proj.tinybirdJwtDatasources,
      },
      sql: `${sqlString} FORMAT JSON`,
    })

    const data = result.data ?? []
    if (data.length === 0) return []

    const numericColumns = new Set(
      (result.meta ?? [])
        .filter((m) => NUMERIC_TYPE_RE.test(m.type))
        .map((m) => m.name),
    )

    return data.map((row) => coerceRow(row, numericColumns))
  }
}

function buildSqlString(strings: TemplateStringsArray, values: unknown[]): string {
  let result = ''
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < values.length) {
      result += String(values[i])
    }
  }
  return result.trim()
}

function coerceRow(row: Record<string, unknown>, numericColumns: Set<string>): SqlRow {
  const result: SqlRow = {}
  for (const [key, value] of Object.entries(row)) {
    if (numericColumns.has(key)) {
      result[key] = Number(value)
    } else {
      result[key] = value == null ? '' : String(value)
    }
  }
  return result
}
