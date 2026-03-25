# Strada

Open-source OpenTelemetry observability stack on top of Tinybird. Goal is to reimplement the core value of Sentry (error tracking, tracing, logs, metrics) but based on the OpenTelemetry standard instead of Sentry's proprietary bloated SDK. Users send OTEL data via standard SDKs, we store it in Tinybird, they query it with SQL.

## Architecture

- **otel-tinybird**: Cloudflare Worker (Spiceflow) that receives OTLP HTTP/JSON and forwards to Tinybird Events API as NDJSON
- **Multi-tenancy**: shared Tinybird tables with a `tenant_id` column. Auth is enforced via Tinybird JWTs with `DATASOURCES:READ` + `filter` scoped to `tenant_id`. Users can create new projects freely without invalidating JWTs since the JWT is tenant-scoped, not project-scoped
- **Tenant isolation**: JWT filters use `tenant_id` only. Each tenant (org/user) can have multiple projects. The `project_id` column exists in tables for app-level filtering but is NOT in the JWT — project access control is handled in the app DB, not Tinybird
- **Query layer**: Tinybird Query API (`/v0/sql`) with JWT row-level filtering, NOT the ClickHouse HTTP interface (which doesn't support JWTs or row filtering)

## Reference schema

The Tinybird OTel template (https://github.com/tinybirdco/tinybird-otel-template) is the base inspiration for our OTel schema and SQL query examples. Our `tinybird/datasources/` files are derived from it with multi-tenancy additions. Use it as reference for column names, types, indexes, sorting keys, and example queries against OTel data in ClickHouse.

## Tinybird

We target **Tinybird Forward** (the new CLI-based experience), not Classic. Forward is the actively developed version.

**Classic vs Forward differences that matter to us:**
- Forward dropped `sql_filter` on static tokens. Use JWT `filter` instead
- Forward JWTs support `DATASOURCES:READ` scope with `filter` field (Classic JWTs only had `PIPES:READ`)
- Forward uses `tb deploy` instead of `tb push`

### Tinybird docs

- Concepts: https://www.tinybird.co/docs/forward/get-started/concepts
- Architecture: https://www.tinybird.co/docs/forward/get-started/architecture
- Data sources: https://www.tinybird.co/docs/forward/get-data-in/data-sources
- Events API (ingestion): https://www.tinybird.co/docs/forward/get-data-in/events-api
- Pipes: https://www.tinybird.co/docs/forward/work-with-data/pipes
- Endpoints: https://www.tinybird.co/docs/forward/work-with-data/publish-data/endpoints
- Materialized views: https://www.tinybird.co/docs/forward/work-with-data/optimize/materialized-views
- Query API (arbitrary SQL): https://www.tinybird.co/docs/api-reference/query-api
- Tokens overview: https://www.tinybird.co/docs/forward/administration/tokens
- Static tokens: https://www.tinybird.co/docs/forward/administration/tokens/static-tokens
- JWTs: https://www.tinybird.co/docs/forward/administration/tokens/jwt
- ClickHouse interface (read-only, no JWT support): https://www.tinybird.co/docs/forward/work-with-data/publish-data/clickhouse-interface
- SQL reference: https://www.tinybird.co/docs/sql-reference
- Datasource files: https://www.tinybird.co/docs/forward/dev-reference/datafiles/datasource-files
- Pipe files: https://www.tinybird.co/docs/forward/dev-reference/datafiles/pipe-files
- CLI commands: https://www.tinybird.co/docs/forward/dev-reference/commands
- Limits: https://www.tinybird.co/docs/forward/pricing/limits
- Local dev: https://www.tinybird.co/docs/forward/test-and-deploy/local
- Deployments: https://www.tinybird.co/docs/forward/test-and-deploy/deployments
- Template functions: https://www.tinybird.co/docs/forward/dev-reference/template-functions
- Multi-tenant guide with Clerk: https://www.tinybird.co/docs/forward/work-with-data/publish-data/guides/multitenant-real-time-apis-with-clerk-and-tinybird

### Multi-tenancy approach

All tables have a `project_id` column as the first key in `ORDER BY` so ClickHouse granule skipping makes per-project queries fast. Partitioning is by month only (`PARTITION BY toYYYYMM(timestamp)`) to avoid partition explosion.

For reads, backend generates a short-lived JWT per user session:

```json
{
  "workspace_id": "<workspace_id>",
  "name": "user_<user_id>",
  "exp": 1234567890,
  "scopes": [
    {
      "type": "DATASOURCES:READ",
      "resource": "traces",
      "filter": "tenant_id = 'tenant_abc'"
    },
    {
      "type": "DATASOURCES:READ",
      "resource": "logs",
      "filter": "tenant_id = 'tenant_abc'"
    }
  ],
  "limits": { "rps": 10 }
}
```

The `filter` is enforced server-side by Tinybird on every query to `/v0/sql`. Users can write arbitrary SQL and the filter is always appended. The JWT is signed with the workspace admin token and can't be tampered with.

The ClickHouse HTTP interface (`clickhouse.*.tinybird.co`) does NOT support JWTs or row-level filtering. All user-facing queries must go through Tinybird's Query API (`/v0/sql`).
