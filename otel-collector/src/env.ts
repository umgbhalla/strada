// Type-safe environment variable access.
//
// All env vars are read once from process.env and exposed as a typed object.
// Uses process.env for portability (Cloudflare Workers with nodejs_compat_v2,
// Node.js, Bun).

interface Env {
  // ── Backend selection (one of these groups must be set) ──

  /** Tinybird API endpoint. e.g. "https://api.us-east.aws.tinybird.co" */
  TINYBIRD_ENDPOINT: string | undefined
  /** Tinybird API token with APPEND on all datasources */
  TINYBIRD_TOKEN: string | undefined

  /** ClickHouse HTTP interface URL. e.g. "http://localhost:8123" */
  CLICKHOUSE_URL: string | undefined
  /** ClickHouse target database. Defaults to "default" */
  CLICKHOUSE_DATABASE: string
  /** ClickHouse user. Defaults to "default" */
  CLICKHOUSE_USER: string
  /** ClickHouse password */
  CLICKHOUSE_PASSWORD: string
}

export const env: Env = {
  TINYBIRD_ENDPOINT: process.env.TINYBIRD_ENDPOINT,
  TINYBIRD_TOKEN: process.env.TINYBIRD_TOKEN,

  CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
  CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE || 'default',
  CLICKHOUSE_USER: process.env.CLICKHOUSE_USER || 'default',
  CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD || '',
}

/** Standard OTel table names. */
export const datasources = {
  traces: 'otel_traces',
  logs: 'otel_logs',
  errors: 'otel_errors',
  gauge: 'otel_metrics_gauge',
  sum: 'otel_metrics_sum',
  histogram: 'otel_metrics_histogram',
  exponentialHistogram: 'otel_metrics_exponential_histogram',
} as const
