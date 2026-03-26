// Input types — inferred from zod schemas (source of truth in schemas.ts)
export {
  TOP_LEVEL_COLUMNS,
  type CompareOp,
  type FieldRef,
  type FilterNode,
  type FirstPageRequest,
  type LogRef,
  type PaginationCursor,
  type Scalar,
  type TimeRange,
  type TopLevelColumn,
} from "./schemas.ts"

import type { PaginationCursor } from "./schemas.ts"

// ---------------------------------------------------------------------------
// Output types (no runtime validation needed)
// ---------------------------------------------------------------------------

export interface CompiledQuery {
  sql: string
  params: Record<string, { type: string; value: unknown }>
}

export interface LogEntry {
  Timestamp: string
  TimestampNano: string
  RefId: string
  TraceId: string
  SpanId: string
  SeverityNumber: number
  SeverityText: string
  Body: string
  ServiceName: string
  ResourceAttributes: Record<string, string>
  LogAttributes: Record<string, string>
}

export interface FilterMeta {
  totalRows: number
}

export interface SuggestedFilter {
  key: string
  source: "resource" | "log"
  approxCardinality: number
}

export interface ResolveRefResult {
  log: LogEntry
  cursor: PaginationCursor
}

export interface FirstPageResponse {
  logs: LogEntry[]
  cursor: PaginationCursor | null
  hasMore: boolean
  filterMeta: FilterMeta
  suggestions: SuggestedFilter[]
  focusedLog?: ResolveRefResult
}

export interface PageResult {
  logs: LogEntry[]
  cursor: PaginationCursor | null
  hasMore: boolean
}

export interface QueryLayerOptions {
  /** ClickHouse max_execution_time in seconds. Default 30. */
  defaultTimeout?: number
}
