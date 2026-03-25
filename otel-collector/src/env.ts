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

  // ── Table names (optional, sensible defaults) ──

  TRACES_DATASOURCE: string
  LOGS_DATASOURCE: string
  GAUGE_DATASOURCE: string
  SUM_DATASOURCE: string
  HISTOGRAM_DATASOURCE: string
  EXPONENTIAL_HISTOGRAM_DATASOURCE: string
  ERRORS_DATASOURCE: string
}

export const env: Env = {
  TINYBIRD_ENDPOINT: process.env.TINYBIRD_ENDPOINT,
  TINYBIRD_TOKEN: process.env.TINYBIRD_TOKEN,

  CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
  CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE || 'default',
  CLICKHOUSE_USER: process.env.CLICKHOUSE_USER || 'default',
  CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD || '',

  TRACES_DATASOURCE: process.env.TRACES_DATASOURCE || 'otel_traces',
  LOGS_DATASOURCE: process.env.LOGS_DATASOURCE || 'otel_logs',
  GAUGE_DATASOURCE: process.env.GAUGE_DATASOURCE || 'otel_metrics_gauge',
  SUM_DATASOURCE: process.env.SUM_DATASOURCE || 'otel_metrics_sum',
  HISTOGRAM_DATASOURCE: process.env.HISTOGRAM_DATASOURCE || 'otel_metrics_histogram',
  EXPONENTIAL_HISTOGRAM_DATASOURCE: process.env.EXPONENTIAL_HISTOGRAM_DATASOURCE || 'otel_metrics_exponential_histogram',
  ERRORS_DATASOURCE: process.env.ERRORS_DATASOURCE || 'otel_errors',
}
