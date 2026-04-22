# @strada.sh/sdk

**OpenTelemetry-first error tracking, tracing, logs, metrics, and browser analytics for Strada.**

Import from `@strada.sh/sdk` in every runtime. The package uses export conditions so browsers get the browser runtime and servers get the Node runtime.

```ts
import { initStrada, captureException, trace } from "@strada.sh/sdk"

initStrada({
  service: "frontend",
  endpoint: "https://my-project-ingest.strada.sh",
  environment: "production",
  version: "1.0.0",
})

const tracer = trace.getTracer("app")

const span = tracer.startSpan("checkout")
span.setAttribute("cart.items", 3)
span.end()

try {
  throw new Error("payment failed")
} catch (error) {
  captureException(error)
}
```

## Why use it

- **One import path** for browser and server code
- **Standard OTel APIs** after setup. Keep using `trace`, `logs`, and `metrics`
- **Browser analytics built in**. Pageviews, fetch/XHR spans, custom events, session context
- **Error tracking built on logs**. Exceptions become OTel log records with `exception.*` attributes
- **No custom protocol**. Everything goes through OTLP HTTP

## Install

```bash
pnpm add @strada.sh/sdk
```

Optional peer dependencies for auto-instrumentation:

```bash
pnpm add @opentelemetry/auto-instrumentations-node
pnpm add @opentelemetry/auto-instrumentations-web
```

## Quick start

## Browser

```ts
import { initStrada, captureException, setUser } from "@strada.sh/sdk"

initStrada({
  service: "frontend",
  endpoint: "https://my-project-ingest.strada.sh",
  environment: "production",
  version: "1.0.0",
})

setUser({ id: "user_123", email: "a@example.com" })

window.addEventListener("click", async () => {
  try {
    await fetch("/api/plans")
  } catch (error) {
    captureException(error)
  }
})
```

## Node.js

Call `initStrada()` as early as possible, ideally before importing the rest of the app.

```ts
import { initStrada, captureException, shutdown } from "@strada.sh/sdk"

initStrada({
  service: "api",
  endpoint: "https://my-project-ingest.strada.sh",
  environment: "production",
  version: "1.0.0",
})

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0))
})

try {
  throw new Error("db timeout")
} catch (error) {
  captureException(error, {
    tags: { route: "/checkout" },
  })
}
```

## Use normal OpenTelemetry APIs

After `initStrada()`, the global OTel providers are configured. You can use standard OTel APIs directly.

```ts
import { initStrada, trace, logs, metrics } from "@strada.sh/sdk"

initStrada({
  service: "worker",
  endpoint: "https://my-project-ingest.strada.sh",
})

const tracer = trace.getTracer("jobs")
const logger = logs.getLogger("jobs")
const meter = metrics.getMeter("jobs")

const counter = meter.createCounter("emails.sent")

const span = tracer.startSpan("send-email")
logger.emit({
  body: "sending email",
  severityText: "INFO",
  severityNumber: 9,
})
counter.add(1)
span.end()
```

## Browser custom events

In the browser runtime, Strada also exposes `track()` for product analytics style events.

```ts
import { initStrada, track } from "@strada.sh/sdk"

initStrada({
  service: "frontend",
  endpoint: "https://my-project-ingest.strada.sh",
})

track("signup_started", {
  plan: "pro",
  source: "hero",
})
```

These events are emitted as **log records**, not spans. Later you can query them from `otel_logs` using `event.name`.

## What it sends

```text
browser / server code
        │
        ├─ traces  ───────────────► /v1/traces
        ├─ logs    ───────────────► /v1/logs
        └─ metrics ───────────────► /v1/metrics
                                   │
                                   ▼
                              Strada collector
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
            otel_traces                         otel_logs
```

### Browser spans

The browser runtime adds:

- `session.id` from `sessionStorage`
- `url.path`, `url.query`, `url.full`
- `http.request.header.referer`
- `user.id` from `setUser()`

It also starts a `pageview` span and usually parents later browser work to that pageview when no other span is active.

### Browser custom events

`track("signup_started")` becomes a log record like this:

```json
{
  "body": "signup_started",
  "eventName": "signup_started",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "attributes": {
    "event.name": "signup_started",
    "session.id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "url.path": "/pricing",
    "url.full": "https://app.example.com/pricing",
    "user.id": "user_123",
    "custom.plan": "pro",
    "custom.source": "hero"
  },
  "resource": {
    "service.name": "frontend",
    "service.version": "1.0.0"
  }
}
```

### Browser pageview + fetch hierarchy

```text
trace: pageview /pricing
├─ span: pageview
├─ span: fetch GET /api/plans
└─ log: signup_started
```

Important detail: `session.id` is the stable browser session identifier. It is **not** one giant tab-wide `TraceId`.

### Exception logs

`captureException(error)` emits a log record with OTel exception fields.

```json
{
  "body": "payment failed",
  "eventName": "exception",
  "severityText": "ERROR",
  "attributes": {
    "exception.type": "Error",
    "exception.message": "payment failed",
    "exception.stacktrace": "Error: payment failed...",
    "exception.mechanism.type": "generic",
    "exception.mechanism.handled": "true",
    "session.id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "user.id": "user_123"
  }
}
```

The collector later extracts these into the `otel_errors` table for grouping and issue views.

## Under the hood

## Root import uses conditions

`@strada.sh/sdk` resolves differently by runtime:

- **browser bundlers** get the browser implementation
- **Node.js / Bun / Deno** get the server implementation

That means the same import path can configure different OTel SDKs without user changes.

## Browser runtime

The browser build sets up:

- `WebTracerProvider`
- `LoggerProvider`
- OTLP HTTP exporters for traces and logs
- optional `@opentelemetry/auto-instrumentations-web`
- global `error` and `unhandledrejection` handlers
- pageview span lifecycle
- log filtering for noisy browser junk like `Script error.` and extension frames

## Node runtime

The server build sets up:

- `NodeSDK` for traces and metrics
- a separate `LoggerProvider` for logs
- OTLP HTTP exporters for traces, logs, metrics
- optional `@opentelemetry/auto-instrumentations-node`
- global `uncaughtException` and `unhandledRejection` handlers
- `flush()` and `shutdown()` helpers for graceful process exit

## Error handling semantics

`captureException()` always normalizes the input to an `Error`, runs ignore filters, applies `beforeSend`, then emits a log record.

`beforeSend` can:

- return the same `Error`
- return a rewritten `Error`
- return `null` to drop the event

## Query shape later

Custom events are easy to query because they carry `event.name`.

```sql
SELECT
  Timestamp,
  ServiceName,
  LogAttributes['event.name'] AS event_name,
  LogAttributes['user.id'] AS user_id,
  LogAttributes['session.id'] AS session_id,
  LogAttributes['url.path'] AS url_path
FROM otel_logs
WHERE mapContains(LogAttributes, 'event.name')
ORDER BY Timestamp DESC
LIMIT 100
```

That excludes ordinary logs that do not have `event.name`.

## Important details

- **Import from `@strada.sh/sdk`**. You usually do not need `/node` or `/browser`
- **Initialize early**. Especially on Node.js, do it before loading the rest of the app
- **Custom events are logs**, not spans
- **Exceptions are logs first**. The collector extracts them into `otel_errors`
- **Browser sessions use `session.id`**, not a single session-wide trace
- **Pageview spans are roots**. Fetch/XHR/user-interaction spans usually become children of the current pageview

## API summary

### Main helpers

- `initStrada(options)`
- `captureException(error, opts?)`
- `setUser(user)`
- `setTags(tags)`
- `flush()`
- `shutdown()`

### Re-exported OTel APIs

- `trace`
- `logs`
- `metrics`
- `context`
- `propagation`
- `SpanStatusCode`
- `SpanKind`

## When to use raw OTel vs Strada helpers

- use **raw OTel APIs** for normal spans, logs, and metrics
- use **`captureException()`** when you want Strada error conventions
- use **`track()`** in the browser when you want analytics events in `otel_logs`

## Summary

`@strada.sh/sdk` is a thin OTel setup layer.

It does **not** replace OpenTelemetry. It configures it correctly for Strada, adds a few useful conventions, then gets out of the way.
