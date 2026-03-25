// OTel collector — receives OTLP HTTP/JSON and forwards to Tinybird or ClickHouse.
//
// Supports two backends, selected by environment variables:
//   - Tinybird: set TINYBIRD_ENDPOINT + TINYBIRD_TOKEN
//   - ClickHouse: set CLICKHOUSE_URL (+ CLICKHOUSE_DATABASE, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD)
//
// Multi-tenancy: tenant_id is extracted from the hostname.
// Each tenant gets a subdomain: {tenant}-ingest.stradametrics.com
// The worker parses the hostname to get the tenant_id and injects it
// into every NDJSON row. No KV or DB lookup needed.

import { Spiceflow } from 'spiceflow'
import { cors } from 'spiceflow/cors'
import { env } from './env.ts'
import { getTenantId } from './get-tenant-id.ts'
import { transformTraces } from './transform-traces.ts'
import { transformLogs } from './transform-logs.ts'
import { transformMetrics } from './transform-metrics.ts'
import { createBackend } from './backend.ts'
import { extractErrorsFromTraces, extractErrorsFromLogs } from './extract-errors.ts'
import type { ExportTraceServiceRequest, ExportLogsServiceRequest, ExportMetricsServiceRequest } from './otlp-types.ts'

const app = new Spiceflow()
  .use(
    cors({
      origin: '*',
      allowMethods: ['POST'],
      allowHeaders: ['content-type'],
      maxAge: 86400,
    }),
  )
  .post('/v1/traces', async ({ request, waitUntil }) => {
    const tenantId = getTenantId(request)
    const body = (await request.json()) as ExportTraceServiceRequest
    const backend = createBackend()

    const ndjson = transformTraces(body, tenantId)
    if (ndjson) {
      waitUntil(
        backend.send(env.TRACES_DATASOURCE, 'traces', ndjson),
      )
    }

    // Extract exceptions from span events and write to otel_errors
    const errorsNdjson = extractErrorsFromTraces(body, tenantId)
    if (errorsNdjson) {
      waitUntil(
        backend.send(env.ERRORS_DATASOURCE, 'errors', errorsNdjson),
      )
    }

    return {}
  })
  .post('/v1/logs', async ({ request, waitUntil }) => {
    const tenantId = getTenantId(request)
    const body = (await request.json()) as ExportLogsServiceRequest
    const backend = createBackend()

    const ndjson = transformLogs(body, tenantId)
    if (ndjson) {
      waitUntil(
        backend.send(env.LOGS_DATASOURCE, 'logs', ndjson),
      )
    }

    // Extract exceptions from log attributes and write to otel_errors
    const errorsNdjson = extractErrorsFromLogs(body, tenantId)
    if (errorsNdjson) {
      waitUntil(
        backend.send(env.ERRORS_DATASOURCE, 'errors', errorsNdjson),
      )
    }

    return {}
  })
  .post('/v1/metrics', async ({ request, waitUntil }) => {
    const tenantId = getTenantId(request)
    const body = (await request.json()) as ExportMetricsServiceRequest
    const backend = createBackend()
    const payloads = transformMetrics(body, tenantId, {
      gauge: env.GAUGE_DATASOURCE,
      sum: env.SUM_DATASOURCE,
      histogram: env.HISTOGRAM_DATASOURCE,
      exponentialHistogram: env.EXPONENTIAL_HISTOGRAM_DATASOURCE,
    })

    const toSend = payloads.filter((p) => p.ndjson.length > 0)
    if (toSend.length > 0) {
      waitUntil(
        Promise.all(
          toSend.map((p) => backend.send(p.datasource, p.signal, p.ndjson)),
        ),
      )
    }

    return {}
  })

export default {
  fetch(request: Request) {
    return app.handle(request)
  },
}

export { app }
