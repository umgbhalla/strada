# otel-query

Isomorphic query layer for browsing OpenTelemetry logs stored in ClickHouse. Translates a structured filter AST into parameterised ClickHouse SQL, handles keyset pagination, stable log ref IDs for deep-linking, and filter autocomplete/suggestions.

No HTTP, no rendering, no stored state. Provide a `QueryAdapter` that executes SQL against ClickHouse (or anything wire-compatible) and this package does the rest.

## Adapter

Everything goes through a single interface:

```typescript
import type { QueryAdapter, QueryRequest, QueryResult } from "otel-query"

const adapter: QueryAdapter = {
  async query<T>(request: QueryRequest): Promise<QueryResult<T>> {
    // request.sql    — SQL with {name:Type} parameter placeholders
    // request.params — { p0: { type: "String", value: "ERROR" }, ... }
    // request.signal — AbortSignal for cancellation
    //
    // Send to ClickHouse HTTP interface, @clickhouse/client, Tinybird /v0/sql, etc.
    // Return { data: T[] }
  },
}
```

The adapter owns transport, auth, format negotiation, and parameter binding. The query layer never interpolates user values into SQL — all values go through `{name:Type}` placeholders.

## QueryLayer

```typescript
import { QueryLayer } from "otel-query"

const ql = new QueryLayer(adapter, { defaultTimeout: 30 })
```

### First page load

Fires logs page, total count, filter suggestions, and optional ref resolution in parallel:

```typescript
const result = await ql.firstPageLoad(
  {
    filters: {
      kind: "and",
      children: [
        { kind: "compare", field: { source: "top", column: "SeverityText" }, op: "eq", value: "ERROR" },
        { kind: "exists", field: { source: "log", key: "http.method" } },
      ],
    },
    timeRange: { start: "2024-01-01T00:00:00Z", end: "2024-01-02T00:00:00Z" },
    pageSize: 50,
  },
  abortController.signal,
)
// result.logs, result.cursor, result.hasMore, result.filterMeta, result.suggestions
```

### Pagination

Keyset pagination on `(Timestamp, RefId)` — no OFFSET, stable across concurrent inserts:

```typescript
const next = await ql.paginateForward(filters, timeRange, result.cursor, 50, signal)
const prev = await ql.paginateBackward(filters, timeRange, result.cursor, 50, signal)
```

### Deep-linking with ref IDs

Every returned log row includes a computed `RefId` (`xxHash64` of its immutable fields). Encode it into an opaque URL-safe token, then resolve it later:

```typescript
import { encodeLogRef, decodeLogRef } from "otel-query"

// Create a shareable token (22 chars, base64url, no padding)
const token = encodeLogRef(log.TimestampNano, log.RefId)

// Resolve it back — finds the row in a tight ±2s window
const ref = decodeLogRef(token)
const resolved = await ql.resolveRef(ref, signal)
// resolved.log — the log entry
// resolved.cursor — seed for paginating from that point
```

### Autocomplete

```typescript
// Key completion: what attribute keys exist?
const keys = await ql.completeKeys(["api-gateway"], timeRange, "http", signal)
// ["http.method", "http.status_code", "http.url", ...]

// Value completion: what values does this key have?
const values = await ql.completeValues(
  { source: "log", key: "http.method" },
  filters, timeRange, "G", signal,
)
// ["GET"]
```

### Filter suggestions

Surfaces useful "next filters" by estimating per-key cardinality within the current result set:

```typescript
const suggestions = await ql.suggestFilters(filters, timeRange, signal)
// [{ key: "http.status_code", source: "log", approxCardinality: 5 }, ...]
```

## Filter AST

All filters are a recursive `FilterNode` tree. The compiler normalises, validates, and emits parameterised SQL — callers never write raw SQL.

```typescript
type FilterNode =
  | { kind: "compare"; field: FieldRef; op: CompareOp; value: Scalar }
  | { kind: "exists"; field: FieldRef }
  | { kind: "not_exists"; field: FieldRef }
  | { kind: "contains"; field: FieldRef; value: string }
  | { kind: "in"; field: FieldRef; values: Scalar[] }
  | { kind: "and"; children: FilterNode[] }
  | { kind: "or"; children: FilterNode[] }
  | { kind: "not"; child: FilterNode }
  | { kind: "fulltext"; query: string }

// Fields abstract over top-level columns and Map attribute access
type FieldRef =
  | { source: "top"; column: TopLevelColumn }   // → SeverityText
  | { source: "resource"; key: string }          // → ResourceAttributes['k8s.pod.name']
  | { source: "log"; key: string }               // → LogAttributes['http.method']
```

### Safety rails

- **Mandatory time range** on every query (ensures partition pruning)
- **IN-list cap** at 1,000 values
- **`SETTINGS max_execution_time`** on every query (default 30s)
- **All user values parameterised** via `{name:Type}` — never interpolated

## Cancellation

Every method takes an `AbortSignal`. Aborting closes the HTTP connection to ClickHouse, which stops the query server-side. Parallel queries in `firstPageLoad` share the same signal — aborting cancels all of them.

```typescript
const ac = new AbortController()
const promise = ql.firstPageLoad(req, ac.signal)

// User navigates away or changes filters:
ac.abort()
```

## Using the compiler directly

For advanced use cases, the filter compiler is exported separately:

```typescript
import { compileFilter, ParamCollector, emitFilter } from "otel-query"

// Compile a full WHERE clause with time range
const { whereClause, params, paramCount } = compileFilter(filterNode, timeRange)

// Or emit just the filter fragment
const p = new ParamCollector()
const sql = emitFilter(filterNode, p)
// sql = "SeverityText = {p0:String}"
// p.params = { p0: { type: "String", value: "ERROR" } }
```

## ClickHouse schema

Expects the standard OTel ClickHouse exporter schema for `otel_logs`:

```sql
CREATE TABLE otel_logs (
    Timestamp       DateTime64(9),
    TraceId         String,
    SpanId          String,
    SeverityNumber  UInt8,
    SeverityText    LowCardinality(String),
    Body            String,
    ServiceName     LowCardinality(String),
    ResourceAttributes  Map(LowCardinality(String), String),
    LogAttributes       Map(LowCardinality(String), String),
    ...
) ENGINE = MergeTree
ORDER BY (ServiceName, Timestamp)
PARTITION BY toDate(Timestamp)
```
