import type { QueryAdapter } from "./adapter.ts"
import {
  compileFilter,
  extractActiveKeys,
  formatTimestamp,
  ParamCollector,
  type CompiledFilter,
} from "./compiler.ts"
import { RefNotFoundError } from "./errors.ts"
import { LOG_SELECT_COLUMNS, REF_ID_EXPR } from "./ref.ts"
import {
  CompleteKeysRequestSchema,
  CompleteValuesRequestSchema,
  FirstPageRequestSchema,
  LogRefSchema,
  PaginateRequestSchema,
  SuggestFiltersRequestSchema,
} from "./schemas.ts"
import type {
  FieldRef,
  FilterMeta,
  FilterNode,
  FirstPageRequest,
  FirstPageResponse,
  LogEntry,
  LogRef,
  PageResult,
  PaginationCursor,
  QueryLayerOptions,
  ResolveRefResult,
  SuggestedFilter,
  TimeRange,
} from "./types.ts"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cursorFromRows(
  rows: LogEntry[],
  dir: "forward" | "backward",
): PaginationCursor | null {
  if (rows.length === 0) return null
  const last = rows[rows.length - 1]!
  return { ts: last.TimestampNano, refId: last.RefId, dir }
}

function settingsClause(timeout: number): string {
  return `SETTINGS max_execution_time = ${timeout}`
}

const TABLE = "otel_logs"

// ---------------------------------------------------------------------------
// QueryLayer
// ---------------------------------------------------------------------------

export class QueryLayer {
  private timeout: number

  constructor(
    private adapter: QueryAdapter,
    options: QueryLayerOptions = {},
  ) {
    this.timeout = options.defaultTimeout ?? 30
  }

  // -- First-page orchestration -------------------------------------------

  async firstPageLoad(
    req: FirstPageRequest,
    signal: AbortSignal,
  ): Promise<FirstPageResponse> {
    FirstPageRequestSchema.parse(req)

    const compiled = compileFilter(req.filters, req.timeRange)

    const [pageData, filterMeta, suggestions, focusedLog] =
      await Promise.all([
        this.queryLogPage(compiled, null, req.pageSize, "forward", signal),
        this.queryFilterMeta(compiled, signal),
        this.suggestFilters(req.filters, req.timeRange, signal),
        req.focusRef
          ? this.resolveRef(req.focusRef, signal)
          : undefined,
      ])

    const hasMore = pageData.length > req.pageSize
    const logs = hasMore ? pageData.slice(0, req.pageSize) : pageData

    return {
      logs,
      cursor: cursorFromRows(logs, "forward"),
      hasMore,
      filterMeta,
      suggestions,
      focusedLog,
    }
  }

  // -- Pagination ---------------------------------------------------------

  async paginateForward(
    filters: FilterNode,
    timeRange: TimeRange,
    cursor: PaginationCursor,
    pageSize: number,
    signal: AbortSignal,
  ): Promise<PageResult> {
    PaginateRequestSchema.parse({ filters, timeRange, cursor, pageSize })
    return this.paginate(filters, timeRange, cursor, pageSize, "forward", signal)
  }

  async paginateBackward(
    filters: FilterNode,
    timeRange: TimeRange,
    cursor: PaginationCursor,
    pageSize: number,
    signal: AbortSignal,
  ): Promise<PageResult> {
    PaginateRequestSchema.parse({ filters, timeRange, cursor, pageSize })
    return this.paginate(filters, timeRange, cursor, pageSize, "backward", signal)
  }

  private async paginate(
    filters: FilterNode,
    timeRange: TimeRange,
    cursor: PaginationCursor,
    pageSize: number,
    direction: "forward" | "backward",
    signal: AbortSignal,
  ): Promise<PageResult> {
    const compiled = compileFilter(filters, timeRange)
    const data = await this.queryLogPage(compiled, cursor, pageSize, direction, signal)
    const hasMore = data.length > pageSize
    const logs = hasMore ? data.slice(0, pageSize) : data
    if (direction === "backward") logs.reverse()
    return { logs, cursor: cursorFromRows(logs, direction), hasMore }
  }

  // -- Ref resolution -----------------------------------------------------

  async resolveRef(
    ref: LogRef,
    signal: AbortSignal,
  ): Promise<ResolveRefResult> {
    LogRefSchema.parse(ref)

    const p = new ParamCollector()

    // ±2s window around the ref timestamp
    const tsNano = BigInt(ref.ts)
    const windowNs = 2_000_000_000n
    const lo = (tsNano - windowNs).toString()
    const hi = (tsNano + windowNs).toString()

    const sql = `SELECT
    ${LOG_SELECT_COLUMNS}
FROM ${TABLE}
WHERE Timestamp >= fromUnixTimestamp64Nano(${p.add("Int64", lo)})
  AND Timestamp <= fromUnixTimestamp64Nano(${p.add("Int64", hi)})
  AND ${REF_ID_EXPR} = ${p.add("UInt64", ref.refId)}
LIMIT 1
${settingsClause(this.timeout)}`

    const result = await this.adapter.query<LogEntry>({
      sql,
      params: p.params,
      signal,
    })

    if (result.data.length === 0) {
      throw new RefNotFoundError(`${ref.ts}:${ref.refId}`)
    }

    const log = result.data[0]!
    return {
      log,
      cursor: { ts: log.TimestampNano, refId: log.RefId, dir: "forward" },
    }
  }

  // -- Autocomplete -------------------------------------------------------

  async completeKeys(
    services: string[],
    timeRange: TimeRange,
    prefix: string,
    signal: AbortSignal,
  ): Promise<string[]> {
    CompleteKeysRequestSchema.parse({ services, timeRange, prefix })

    const p = new ParamCollector()
    const startParam = p.add("String", formatTimestamp(timeRange.start))
    const endParam = p.add("String", formatTimestamp(timeRange.end))
    const servicesParam = p.add("Array(String)", services)
    const prefixParam = p.add("String", `${prefix}%`)

    const makeQuery = (mapCol: string) => `
SELECT DISTINCT arrayJoin(mapKeys(${mapCol})) AS key
FROM ${TABLE}
WHERE ServiceName IN ${servicesParam}
  AND Timestamp >= ${startParam}
  AND Timestamp <= ${endParam}
  AND key LIKE ${prefixParam}
LIMIT 1000
${settingsClause(this.timeout)}`

    const [logKeys, resKeys] = await Promise.all([
      this.adapter.query<{ key: string }>({
        sql: makeQuery("LogAttributes"),
        params: p.params,
        signal,
      }),
      this.adapter.query<{ key: string }>({
        sql: makeQuery("ResourceAttributes"),
        params: p.params,
        signal,
      }),
    ])

    const seen = new Set<string>()
    const result: string[] = []
    for (const row of logKeys.data) {
      if (!seen.has(row.key)) {
        seen.add(row.key)
        result.push(row.key)
      }
    }
    for (const row of resKeys.data) {
      if (!seen.has(row.key)) {
        seen.add(row.key)
        result.push(row.key)
      }
    }
    return result.sort()
  }

  async completeValues(
    field: FieldRef,
    filters: FilterNode,
    timeRange: TimeRange,
    prefix: string,
    signal: AbortSignal,
  ): Promise<string[]> {
    CompleteValuesRequestSchema.parse({ field, filters, timeRange, prefix })

    const compiled = compileFilter(filters, timeRange)
    const p = new ParamCollector(compiled.paramCount)

    let valueExpr: string
    if (field.source === "top") {
      valueExpr = `toString(${field.column})`
    } else {
      const mapCol =
        field.source === "resource" ? "ResourceAttributes" : "LogAttributes"
      valueExpr = `${mapCol}[${p.add("String", field.key)}]`
    }

    const prefixParam = p.add("String", `${prefix}%`)

    const sql = `SELECT DISTINCT ${valueExpr} AS val
FROM ${TABLE}
${compiled.whereClause}
  AND ${valueExpr} != ''
  AND val LIKE ${prefixParam}
ORDER BY val
LIMIT 50
${settingsClause(this.timeout)}`

    const result = await this.adapter.query<{ val: string }>({
      sql,
      params: { ...compiled.params, ...p.params },
      signal,
    })

    return result.data.map((r) => r.val)
  }

  // -- Contextual suggestions ---------------------------------------------

  async suggestFilters(
    filters: FilterNode,
    timeRange: TimeRange,
    signal: AbortSignal,
  ): Promise<SuggestedFilter[]> {
    SuggestFiltersRequestSchema.parse({ filters, timeRange })

    const compiled = compileFilter(filters, timeRange)
    const activeKeys = extractActiveKeys(filters)
    const p = new ParamCollector(compiled.paramCount)
    const excludeParam = p.add("Array(String)", activeKeys)
    const mergedParams = { ...compiled.params, ...p.params }

    const makeQuery = (
      mapCol: string,
      source: "resource" | "log",
    ) => `SELECT
    key,
    ${source === "log" ? "'log'" : "'resource'"} AS source,
    uniqHLL12(val) AS approx_cardinality
FROM (
    SELECT
        arrayJoin(mapKeys(${mapCol})) AS key,
        ${mapCol}[key] AS val
    FROM ${TABLE}
    ${compiled.whereClause}
    LIMIT 50000
)
WHERE key NOT IN ${excludeParam}
GROUP BY key
HAVING approx_cardinality BETWEEN 2 AND 200
ORDER BY approx_cardinality DESC
LIMIT 15
${settingsClause(this.timeout)}`

    const [logSuggestions, resSuggestions] = await Promise.all([
      this.adapter.query<SuggestedFilter>({
        sql: makeQuery("LogAttributes", "log"),
        params: mergedParams,
        signal,
      }),
      this.adapter.query<SuggestedFilter>({
        sql: makeQuery("ResourceAttributes", "resource"),
        params: mergedParams,
        signal,
      }),
    ])

    return [...logSuggestions.data, ...resSuggestions.data].sort(
      (a, b) => b.approxCardinality - a.approxCardinality,
    )
  }

  // -- Internal query builders --------------------------------------------

  private async queryLogPage(
    compiled: CompiledFilter,
    cursor: PaginationCursor | null,
    pageSize: number,
    direction: "forward" | "backward",
    signal: AbortSignal,
  ): Promise<LogEntry[]> {
    const p = new ParamCollector(compiled.paramCount)
    let cursorClause = ""

    if (cursor) {
      const tsParam = p.add("Int64", cursor.ts)
      const refParam = p.add("UInt64", cursor.refId)
      const cmp = direction === "forward" ? "<" : ">"
      cursorClause = `\n  AND (Timestamp, ${REF_ID_EXPR}) ${cmp} (fromUnixTimestamp64Nano(${tsParam}), ${refParam})`
    }

    const orderDir = direction === "forward" ? "DESC" : "ASC"

    const sql = `SELECT
    ${LOG_SELECT_COLUMNS}
FROM ${TABLE}
${compiled.whereClause}${cursorClause}
ORDER BY Timestamp ${orderDir}, ${REF_ID_EXPR} ${orderDir}
LIMIT ${pageSize + 1}
${settingsClause(this.timeout)}`

    const result = await this.adapter.query<LogEntry>({
      sql,
      params: { ...compiled.params, ...p.params },
      signal,
    })

    return result.data
  }

  private async queryFilterMeta(
    compiled: CompiledFilter,
    signal: AbortSignal,
  ): Promise<FilterMeta> {
    const sql = `SELECT count() AS totalRows
FROM ${TABLE}
${compiled.whereClause}
${settingsClause(this.timeout)}`

    const result = await this.adapter.query<{ totalRows: number }>({
      sql,
      params: compiled.params,
      signal,
    })

    return { totalRows: result.data[0]?.totalRows ?? 0 }
  }
}
