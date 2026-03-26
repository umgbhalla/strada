// Field name remapping from snake_case NDJSON to PascalCase ClickHouse columns.
//
// Most fields convert automatically via snakeToPascal():
//   trace_id → TraceId, span_name → SpanName, bucket_counts → BucketCounts, etc.
//
// A few fields have non-trivial mappings where the JSON key doesn't match the
// OTel ClickHouse column name after case conversion. These are listed as
// per-signal exceptions below.
//
// tenant_id is always stripped — self-hosted ClickHouse runs single-tenant.

// ─── Signal types ───

export type SignalKind =
  | "traces"
  | "logs"
  | "errors"
  | "metrics_gauge"
  | "metrics_sum"
  | "metrics_histogram"
  | "metrics_exponential_histogram";

// ─── Case conversion ───

/** Convert snake_case to PascalCase: "trace_id" → "TraceId", "body" → "Body" */
export function snakeToPascal(s: string): string {
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// ─── Exceptions per signal ───
// Keys that don't follow simple snake_to_pascal conversion.
// Map from snake_case JSON key → PascalCase ClickHouse column.
// Use `null` to drop a field (not in the target schema).

const TRACES_EXCEPTIONS: Record<string, string | null> = {
  start_time: "Timestamp", // OTel stores span start as Timestamp, not StartTime
  end_time: null, // Not in OTel ClickHouse schema (derivable from Timestamp + Duration)
};

const LOGS_EXCEPTIONS: Record<string, string | null> = {
  flags: "TraceFlags", // OTel logs call it TraceFlags, not Flags
};

const ERRORS_EXCEPTIONS: Record<string, string | null> = {
  // No exceptions beyond the shared ones
};

const METRICS_EXCEPTIONS: Record<string, string | null> = {
  metric_attributes: "Attributes", // OTel metrics use Attributes, not MetricAttributes
  start_timestamp: "StartTimeUnix", // OTel metrics use StartTimeUnix, not StartTimestamp
  timestamp: "TimeUnix", // OTel metrics use TimeUnix, not Timestamp
};

// ─── Shared drops ───
// Fields stripped from all signals before INSERT.
const ALWAYS_DROP = new Set(["tenant_id"]);

// ─── Signal → exceptions lookup ───

function getExceptions(signal: SignalKind): Record<string, string | null> {
  switch (signal) {
    case "traces":
      return TRACES_EXCEPTIONS;
    case "logs":
      return LOGS_EXCEPTIONS;
    case "errors":
      return ERRORS_EXCEPTIONS;
    default:
      // All metric types share the same exceptions
      return METRICS_EXCEPTIONS;
  }
}

// ─── Public API ───

export function getMappingForSignal(signal: SignalKind) {
  return getExceptions(signal);
}

/**
 * Remap a single NDJSON row's keys from snake_case to PascalCase.
 * Uses automatic case conversion with per-signal exceptions.
 * Drops tenant_id and any field mapped to null.
 */
export function remapRow(row: Record<string, unknown>, signal: SignalKind): Record<string, unknown> {
  const exceptions = getExceptions(signal);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (ALWAYS_DROP.has(key)) continue;

    if (key in exceptions) {
      const mapped = exceptions[key];
      if (mapped != null) {
        result[mapped] = value;
      }
      // null means drop
      continue;
    }

    result[snakeToPascal(key)] = value;
  }

  return result;
}

/**
 * Remap an entire NDJSON string (one JSON object per line) for a given signal.
 */
export function remapNdjson(ndjson: string, signal: SignalKind): string {
  const lines = ndjson.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const row = JSON.parse(trimmed) as Record<string, unknown>;
      result.push(JSON.stringify(remapRow(row, signal)));
    } catch {
      result.push(trimmed);
    }
  }

  return result.join("\n") + "\n";
}
