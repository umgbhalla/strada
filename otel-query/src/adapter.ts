/** Request passed to the adapter to execute a ClickHouse query. */
export interface QueryRequest {
  /** SQL string with optional `{name:Type}` parameter placeholders. */
  sql: string
  /** Parameter values keyed by name. The adapter is responsible for sending these to ClickHouse. */
  params?: Record<string, { type: string; value: unknown }>
  /** Optional abort signal for cancellation. Wired into the HTTP request by the adapter. */
  signal?: AbortSignal
}

/** Typed result returned by the adapter after executing a query. */
export interface QueryResult<T> {
  data: T[]
  meta?: Array<{ name: string; type: string }>
  rows?: number
  statistics?: { elapsed: number; rows_read: number; bytes_read: number }
}

/**
 * Adapter interface for executing ClickHouse queries.
 *
 * Implementations handle transport (HTTP interface, TCP client, etc.),
 * authentication, response format negotiation, parameter binding, and
 * cancellation. The query layer builds parameterised SQL and delegates
 * execution entirely to the adapter.
 */
export interface QueryAdapter {
  query<T = Record<string, unknown>>(request: QueryRequest): Promise<QueryResult<T>>
}
