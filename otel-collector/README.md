# otel-collector

OTLP HTTP/JSON collector for [Strada](https://github.com/remorses/strada). Runs as a Cloudflare Worker. Receives OpenTelemetry traces, logs, and metrics from any OTel SDK and stores them in Tinybird.

## JSON only — no protobuf, no gRPC

This collector only accepts **OTLP HTTP/JSON** format. It does not support protobuf or gRPC encoding.

The OTel JS SDK defaults to `http/protobuf`. You must explicitly switch to JSON by either:
- Using the `-http` exporter packages (which send JSON)
- Setting the `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` environment variable

## Quick start (Node.js)

### 1. Install dependencies

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/exporter-logs-otlp-http \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/sdk-metrics \
  @opentelemetry/sdk-logs
```

### 2. Create instrumentation file

Create `instrumentation.ts` (must be loaded before your app code):

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { Resource } from '@opentelemetry/resources'

// Replace with your Strada ingest URL
const STRADA_URL = 'https://acme-ingest.stradametrics.com'

const resource = new Resource({
  'service.name': 'my-api',
})

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({
    url: `${STRADA_URL}/v1/traces`,
    headers: { 'x-api-key': process.env.STRADA_API_KEY! },
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${STRADA_URL}/v1/metrics`,
      headers: { 'x-api-key': process.env.STRADA_API_KEY! },
    }),
    exportIntervalMillis: 10_000,
  }),
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: `${STRADA_URL}/v1/logs`,
      headers: { 'x-api-key': process.env.STRADA_API_KEY! },
    }),
  ),
  instrumentations: [getNodeAutoInstrumentations()],
})

sdk.start()
```

### 3. Load instrumentation before your app

```bash
STRADA_API_KEY=sk_live_xxx node --import ./instrumentation.ts app.ts
```

Or with `tsx`:

```bash
STRADA_API_KEY=sk_live_xxx tsx --import ./instrumentation.ts app.ts
```

## Environment variable configuration

Instead of passing URLs programmatically, you can use OTel environment variables:

```bash
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=https://acme-ingest.stradametrics.com
export OTEL_EXPORTER_OTLP_HEADERS=x-api-key=sk_live_xxx
export OTEL_SERVICE_NAME=my-api
```

With these set, the SDK auto-appends `/v1/traces`, `/v1/logs`, `/v1/metrics` to the base endpoint.

## Exporter packages

The OTel JS SDK has separate npm packages for each wire format:

| Package | Format | Works with Strada? |
|---|---|---|
| `@opentelemetry/exporter-trace-otlp-http` | HTTP/JSON | Yes |
| `@opentelemetry/exporter-trace-otlp-proto` | HTTP/Protobuf | No |
| `@opentelemetry/exporter-trace-otlp-grpc` | gRPC | No |

Same pattern for metrics (`exporter-metrics-otlp-*`) and logs (`exporter-logs-otlp-*`). Always use the `-http` variants.

## Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/v1/traces` | Receive trace spans |
| POST | `/v1/logs` | Receive log records |
| POST | `/v1/metrics` | Receive metrics (gauge, sum, histogram, exponential histogram) |

## Multi-tenancy

Tenant identity comes from the hostname. No configuration needed in the SDK — just point it at the right subdomain:

```
https://acme-ingest.stradametrics.com     → tenant "acme"
https://mycompany-ingest.stradametrics.com → tenant "mycompany"
https://ingest.yourdomain.com              → empty tenant (self-hosted)
```

## Auth

Every request must include an `x-api-key` header:
- `sk_*` — server key, for backend SDKs
- `pk_*` — browser key, requires valid `Origin` header

## Links

- [OTel JS SDK docs](https://opentelemetry.io/docs/languages/js/)
- [OTel JS Exporters](https://opentelemetry.io/docs/languages/js/exporters/)
- [OTLP Exporter Configuration](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/)
- [`@opentelemetry/exporter-trace-otlp-http`](https://www.npmjs.com/package/@opentelemetry/exporter-trace-otlp-http)
- [`@opentelemetry/exporter-metrics-otlp-http`](https://www.npmjs.com/package/@opentelemetry/exporter-metrics-otlp-http)
- [`@opentelemetry/exporter-logs-otlp-http`](https://www.npmjs.com/package/@opentelemetry/exporter-logs-otlp-http)
