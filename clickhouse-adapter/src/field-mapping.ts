// Field name mappings from Tinybird NDJSON (snake_case) to ClickHouse columns (PascalCase).
//
// Derived from the Tinybird datasource files in tinybird/datasources/.
// Each `json:$.field_name` → `ColumnName` mapping is extracted here.
//
// Most mappings are simple snake_to_Pascal, but some are non-trivial:
//   start_time → Timestamp (traces)
//   flags → TraceFlags (logs) vs Flags (metrics)
//   metric_attributes → Attributes (all metrics)
//   start_timestamp → StartTimeUnix (all metrics)
//   timestamp → TimeUnix (metrics) vs Timestamp (logs, errors)

// ─── Per-table mappings ───

export const TRACES_MAPPING: Record<string, string> = {
  tenant_id: 'TenantId',
  start_time: 'Timestamp',
  trace_id: 'TraceId',
  span_id: 'SpanId',
  parent_span_id: 'ParentSpanId',
  trace_state: 'TraceState',
  span_name: 'SpanName',
  span_kind: 'SpanKind',
  service_name: 'ServiceName',
  resource_schema_url: 'ResourceSchemaUrl',
  resource_attributes: 'ResourceAttributes',
  scope_schema_url: 'ScopeSchemaUrl',
  scope_name: 'ScopeName',
  scope_version: 'ScopeVersion',
  scope_attributes: 'ScopeAttributes',
  duration: 'Duration',
  status_code: 'StatusCode',
  status_message: 'StatusMessage',
  span_attributes: 'SpanAttributes',
  events_timestamp: 'EventsTimestamp',
  events_name: 'EventsName',
  events_attributes: 'EventsAttributes',
  links_trace_id: 'LinksTraceId',
  links_span_id: 'LinksSpanId',
  links_trace_state: 'LinksTraceState',
  links_attributes: 'LinksAttributes',
}

export const LOGS_MAPPING: Record<string, string> = {
  tenant_id: 'TenantId',
  timestamp: 'Timestamp',
  // TimestampTime is derived from Timestamp in ClickHouse DDL (DEFAULT toDateTime(Timestamp))
  trace_id: 'TraceId',
  span_id: 'SpanId',
  flags: 'TraceFlags',
  severity_text: 'SeverityText',
  severity_number: 'SeverityNumber',
  service_name: 'ServiceName',
  body: 'Body',
  resource_schema_url: 'ResourceSchemaUrl',
  resource_attributes: 'ResourceAttributes',
  scope_schema_url: 'ScopeSchemaUrl',
  scope_name: 'ScopeName',
  scope_version: 'ScopeVersion',
  scope_attributes: 'ScopeAttributes',
  log_attributes: 'LogAttributes',
  event_name: 'EventName',
}

export const ERRORS_MAPPING: Record<string, string> = {
  tenant_id: 'TenantId',
  timestamp: 'Timestamp',
  trace_id: 'TraceId',
  span_id: 'SpanId',
  service_name: 'ServiceName',
  exception_type: 'ExceptionType',
  exception_message: 'ExceptionMessage',
  exception_stacktrace: 'ExceptionStacktrace',
  exception_frames: 'ExceptionFrames',
  fingerprint: 'Fingerprint',
  fingerprint_hash: 'FingerprintHash',
  mechanism_type: 'MechanismType',
  mechanism_handled: 'MechanismHandled',
  debug_id: 'DebugId',
  level: 'Level',
  release: 'Release',
  environment: 'Environment',
  tags: 'Tags',
  resource_attributes: 'ResourceAttributes',
  scope_attributes: 'ScopeAttributes',
  source_signal: 'SourceSignal',
}

// Shared across all 4 metric tables (gauge, sum, histogram, exponential_histogram).
// The non-trivial mappings: metric_attributes → Attributes, start_timestamp → StartTimeUnix,
// timestamp → TimeUnix, flags → Flags (not TraceFlags like in logs).
const BASE_METRICS_MAPPING: Record<string, string> = {
  tenant_id: 'TenantId',
  resource_attributes: 'ResourceAttributes',
  resource_schema_url: 'ResourceSchemaUrl',
  scope_name: 'ScopeName',
  scope_version: 'ScopeVersion',
  scope_attributes: 'ScopeAttributes',
  scope_dropped_attr_count: 'ScopeDroppedAttrCount',
  scope_schema_url: 'ScopeSchemaUrl',
  service_name: 'ServiceName',
  metric_name: 'MetricName',
  metric_description: 'MetricDescription',
  metric_unit: 'MetricUnit',
  metric_attributes: 'Attributes',
  start_timestamp: 'StartTimeUnix',
  timestamp: 'TimeUnix',
  flags: 'Flags',
  exemplars_trace_id: 'ExemplarsTraceId',
  exemplars_span_id: 'ExemplarsSpanId',
  exemplars_timestamp: 'ExemplarsTimestamp',
  exemplars_value: 'ExemplarsValue',
  exemplars_filtered_attributes: 'ExemplarsFilteredAttributes',
}

export const GAUGE_MAPPING: Record<string, string> = {
  ...BASE_METRICS_MAPPING,
  value: 'Value',
}

export const SUM_MAPPING: Record<string, string> = {
  ...BASE_METRICS_MAPPING,
  value: 'Value',
  aggregation_temporality: 'AggregationTemporality',
  is_monotonic: 'IsMonotonic',
}

export const HISTOGRAM_MAPPING: Record<string, string> = {
  ...BASE_METRICS_MAPPING,
  count: 'Count',
  sum: 'Sum',
  bucket_counts: 'BucketCounts',
  explicit_bounds: 'ExplicitBounds',
  min: 'Min',
  max: 'Max',
  aggregation_temporality: 'AggregationTemporality',
}

export const EXPONENTIAL_HISTOGRAM_MAPPING: Record<string, string> = {
  ...BASE_METRICS_MAPPING,
  count: 'Count',
  sum: 'Sum',
  scale: 'Scale',
  zero_count: 'ZeroCount',
  positive_offset: 'PositiveOffset',
  positive_bucket_counts: 'PositiveBucketCounts',
  negative_offset: 'NegativeOffset',
  negative_bucket_counts: 'NegativeBucketCounts',
  min: 'Min',
  max: 'Max',
  aggregation_temporality: 'AggregationTemporality',
}

// ─── Table name → mapping lookup ───

const TABLE_MAPPINGS: Record<string, Record<string, string>> = {
  otel_traces: TRACES_MAPPING,
  otel_logs: LOGS_MAPPING,
  otel_errors: ERRORS_MAPPING,
  otel_metrics_gauge: GAUGE_MAPPING,
  otel_metrics_sum: SUM_MAPPING,
  otel_metrics_histogram: HISTOGRAM_MAPPING,
  otel_metrics_exponential_histogram: EXPONENTIAL_HISTOGRAM_MAPPING,
}

export function getMappingForTable(
  tableName: string,
): Record<string, string> | null {
  return TABLE_MAPPINGS[tableName] ?? null
}

/**
 * Remap a single NDJSON row's keys from snake_case to PascalCase using
 * the given mapping. Unknown keys are passed through unchanged.
 */
export function remapRow(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const mappedKey = mapping[key] ?? key
    result[mappedKey] = value
  }
  return result
}

/**
 * Remap an entire NDJSON string (one JSON object per line).
 * Returns the remapped NDJSON string.
 */
export function remapNdjson(ndjson: string, tableName: string): string {
  const mapping = getMappingForTable(tableName)
  if (!mapping) return ndjson // Unknown table, pass through

  const lines = ndjson.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      const row = JSON.parse(trimmed) as Record<string, unknown>
      result.push(JSON.stringify(remapRow(row, mapping)))
    } catch {
      // Invalid JSON line, pass through
      result.push(trimmed)
    }
  }

  return result.join('\n') + '\n'
}
