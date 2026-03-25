# clickhouse-adapter

Implements the Tinybird Events API and Query API against a generic ClickHouse server. This lets the `otel-collector` worker (and any future Strada services) work with self-hosted ClickHouse without any changes — just point `TINYBIRD_ENDPOINT` at this adapter instead of Tinybird.

## Architecture

```
otel-collector → clickhouse-adapter → ClickHouse
  (unchanged)    (this package)        (self-hosted)
```

The otel-collector always speaks Tinybird's protocol. For hosted Tinybird, it talks directly to `api.us-east.aws.tinybird.co`. For self-hosted ClickHouse, it talks to this adapter which translates and forwards.

## Auth: credentials-in-token

The adapter is fully stateless — it stores no ClickHouse credentials. Instead, the Bearer token IS the ClickHouse credentials, encoded as `base64("user:password")`.

```
# How it works:

1. User configures otel-collector:
   TINYBIRD_ENDPOINT=https://my-adapter.example.com
   TINYBIRD_TOKEN=ZGVmYXVsdDpteXBhc3N3b3Jk        ← base64("default:mypassword")

2. otel-collector sends:
   POST /v0/events?name=otel_traces
   Authorization: Bearer ZGVmYXVsdDpteXBhc3N3b3Jk
   Content-Type: application/x-ndjson
   {"tenant_id":"acme","trace_id":"abc123",...}

3. Adapter decodes the Bearer token:
   base64decode("ZGVmYXVsdDpteXBhc3N3b3Jk") → "default:mypassword"
   → user: "default", password: "mypassword"

4. Adapter remaps NDJSON field names (snake_case → PascalCase):
   {"tenant_id":"acme",...} → {"TenantId":"acme",...}

5. Adapter inserts into ClickHouse:
   POST http://clickhouse:8123/?query=INSERT INTO default.otel_traces FORMAT JSONEachLine
   X-ClickHouse-User: default
   X-ClickHouse-Key: mypassword
   {"TenantId":"acme","TraceId":"abc123",...}
```

This design means:
- No secrets stored on the adapter
- The adapter can serve any ClickHouse user — different tokens = different ClickHouse users
- Works with ClickHouse's native user/password auth

## Field name remapping

The otel-collector produces NDJSON with snake_case keys (matching Go conventions). ClickHouse columns use PascalCase (OTel community convention). The adapter remaps field names per-table before inserting.

The mappings are defined in `src/field-mapping.ts`, derived from the Tinybird `.datasource` files' `json:$.field_name` → `ColumnName` definitions.

Most mappings are simple snake_to_Pascal, but some are non-trivial:

| Table | JSON key | ClickHouse column |
|-------|----------|------------------|
| otel_traces | `start_time` | `Timestamp` |
| otel_logs | `flags` | `TraceFlags` |
| otel_metrics_* | `metric_attributes` | `Attributes` |
| otel_metrics_* | `start_timestamp` | `StartTimeUnix` |
| otel_metrics_* | `timestamp` | `TimeUnix` |

When the schema changes, update both the Tinybird `.datasource` files AND `field-mapping.ts`.

## Endpoints

**`POST /v0/events?name={table}`** — Tinybird Events API (ingestion)
- Accepts `application/x-ndjson` body
- Remaps field names snake_case → PascalCase
- Inserts via ClickHouse HTTP interface with `FORMAT JSONEachLine`
- Returns `{"successful_rows": N, "quarantined_rows": 0}` matching Tinybird's response format

**`POST /v0/sql`** and **`GET /v0/sql?q={sql}`** — Tinybird Query API (reads)
- Passes SQL through to ClickHouse HTTP interface
- Appends `FORMAT JSON` if not already specified
- Returns ClickHouse's JSON response directly

## Config

```env
CLICKHOUSE_URL=http://localhost:8123    # ClickHouse HTTP interface
CLICKHOUSE_DATABASE=default             # Target database
```

No secrets needed — ClickHouse credentials come from the Bearer token.

## Setup for self-hosted ClickHouse

1. Run `clickhouse.sql` against your ClickHouse server to create tables
2. Deploy this adapter (Cloudflare Worker or Node.js)
3. Configure otel-collector:
   ```env
   TINYBIRD_ENDPOINT=https://your-adapter-url.com
   TINYBIRD_TOKEN=<base64 of "clickhouse_user:clickhouse_password">
   ```

Generate the token: `echo -n "default:mypassword" | base64`
