// Generate fake trace data with deep span trees for TUI performance testing.
//
// Emits many traces with 20-100+ spans each so the Strada TUI has heavy data
// to render. Useful for reproducing slow traces/span-tree views before profiling.
//
// Usage:
//   STRADA_PROJECT_ID=<id> STRADA_TOKEN=<token> bun cli/scripts/generate-fake-traces.ts
//
// Env vars:
//   STRADA_PROJECT_ID — project to send data to (required)
//   STRADA_TOKEN      — org ingest token (required)
//   TRACE_COUNT       — number of traces to generate (default: 30)
//   MAX_DEPTH         — max span tree nesting depth (default: 6)
//   MAX_CHILDREN      — max children per span node (default: 5)

// Import from SDK source directly since this script runs from the cli package
// which doesn't have @strada.sh/sdk as a dependency.
import {
  initStrada,
  flush,
  shutdown,
  trace,
  logs,
  captureException,
  SeverityNumber,
  SpanStatusCode,
} from "../../sdk/src/node.ts";

const projectId = process.env.STRADA_PROJECT_ID;
const token = process.env.STRADA_TOKEN;

if (!projectId || !token) {
  console.error("Missing STRADA_PROJECT_ID or STRADA_TOKEN");
  process.exit(1);
}

const TRACE_COUNT = Number(process.env.TRACE_COUNT) || 30;
const MAX_DEPTH = Number(process.env.MAX_DEPTH) || 6;
const MAX_CHILDREN = Number(process.env.MAX_CHILDREN) || 5;

const endpoint = `https://${projectId}-ingest.strada.sh`;

console.log(`Generating ${TRACE_COUNT} traces → ${endpoint}`);
console.log(`  max depth: ${MAX_DEPTH}, max children per node: ${MAX_CHILDREN}`);

initStrada({
  projectId,
  endpoint,
  token,
  service: "fake-trace-generator",
  version: "0.0.1",
  environment: "profiling",
  telemetry: {
    traces: { maxExportBatchSize: 512, scheduledDelayMillis: 1000 },
    logs: { maxExportBatchSize: 512, scheduledDelayMillis: 1000 },
  },
});

const tracer = trace.getTracer("fake-trace-generator");
const logger = logs.getLogger("fake-trace-generator");

// ── Realistic span name pools ────────────────────────────────────

const httpMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const routes = [
  "/api/users", "/api/users/:id", "/api/orders", "/api/orders/:id/items",
  "/api/products", "/api/products/:id", "/api/cart", "/api/checkout",
  "/api/payments", "/api/webhooks/stripe", "/api/auth/login", "/api/auth/refresh",
  "/api/search", "/api/recommendations", "/api/notifications", "/api/upload",
];
const dbOps = [
  "SELECT users", "SELECT orders", "INSERT orders", "UPDATE users",
  "SELECT products", "INSERT cart_items", "DELETE cart_items",
  "SELECT inventory", "UPDATE inventory", "SELECT payments",
  "INSERT audit_log", "SELECT sessions", "DELETE sessions",
];
const cacheOps = ["redis.get", "redis.set", "redis.del", "redis.mget", "memcached.get"];
const queueOps = ["sqs.send", "sqs.receive", "kafka.produce", "kafka.consume", "rabbitmq.publish"];
const externalCalls = [
  "stripe.charges.create", "stripe.refunds.create",
  "sendgrid.send", "twilio.sms.send",
  "s3.putObject", "s3.getObject",
  "elasticsearch.search", "elasticsearch.index",
];
const middlewareNames = [
  "auth.verify", "auth.refresh_token", "rate_limit.check",
  "cors.validate", "body.parse", "session.load",
  "logging.request", "metrics.record", "cache.lookup",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Span tree generation ─────────────────────────────────────────

let totalSpansGenerated = 0;

function generateSpanTree(depth: number, maxSpans: number): number {
  if (depth <= 0 || totalSpansGenerated >= maxSpans) return 0;

  // Pick a span type based on depth
  let spanName: string;
  let spanKind: "SERVER" | "CLIENT" | "INTERNAL" | "PRODUCER" | "CONSUMER";
  const attrs: Record<string, string> = {};

  if (depth === MAX_DEPTH) {
    // Root span is always an HTTP request
    const method = pick(httpMethods);
    const route = pick(routes);
    spanName = `${method} ${route}`;
    spanKind = "SERVER";
    attrs["http.method"] = method;
    attrs["http.route"] = route;
    attrs["http.status_code"] = String(pick([200, 200, 200, 201, 400, 500]));
    attrs["http.url"] = `https://api.example.com${route}`;
    attrs["net.peer.ip"] = `10.0.${rand(0, 255)}.${rand(1, 254)}`;
    attrs["user_agent.original"] = "Mozilla/5.0 (compatible; LoadTest/1.0)";
  } else {
    // Inner spans: mix of DB, cache, queue, external, middleware
    const roll = Math.random();
    if (roll < 0.3) {
      spanName = pick(dbOps);
      spanKind = "CLIENT";
      attrs["db.system"] = "postgresql";
      attrs["db.statement"] = `${spanName} WHERE id = ${rand(1, 99999)}`;
      attrs["db.name"] = "main";
      attrs["db.operation"] = spanName.split(" ")[0]!;
    } else if (roll < 0.5) {
      spanName = pick(cacheOps);
      spanKind = "CLIENT";
      attrs["db.system"] = "redis";
      attrs["db.statement"] = `${spanName} user:${rand(1000, 9999)}`;
    } else if (roll < 0.65) {
      spanName = pick(externalCalls);
      spanKind = "CLIENT";
      attrs["rpc.system"] = "grpc";
      attrs["rpc.service"] = spanName.split(".")[0]!;
      attrs["rpc.method"] = spanName.split(".").slice(1).join(".");
    } else if (roll < 0.75) {
      spanName = pick(queueOps);
      spanKind = Math.random() > 0.5 ? "PRODUCER" : "CONSUMER";
      attrs["messaging.system"] = spanName.split(".")[0]!;
      attrs["messaging.operation"] = spanName.split(".")[1]!;
      attrs["messaging.destination"] = `orders-${pick(["created", "updated", "deleted"])}`;
    } else {
      spanName = pick(middlewareNames);
      spanKind = "INTERNAL";
      attrs["middleware.name"] = spanName;
    }
  }

  // Random duration simulation via sleep (we just create spans, OTel handles timing)
  const numChildren = depth <= 1 ? 0 : rand(1, Math.min(MAX_CHILDREN, maxSpans - totalSpansGenerated));
  let spansCreated = 0;

  tracer.startActiveSpan(spanName, { kind: spanKindToInt(spanKind) }, (span) => {
    for (const [k, v] of Object.entries(attrs)) {
      span.setAttribute(k, v);
    }

    // Add some random attributes for volume
    span.setAttribute("request.id", crypto.randomUUID());
    span.setAttribute("thread.id", String(rand(1, 32)));

    totalSpansGenerated++;
    spansCreated = 1;

    // Maybe add an error
    if (Math.random() < 0.08) {
      const err = new Error(`Simulated error in ${spanName}`);
      err.name = pick(["TimeoutError", "ConnectionRefusedError", "ValidationError", "AuthError"]);
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // Generate children
    for (let i = 0; i < numChildren && totalSpansGenerated < maxSpans; i++) {
      spansCreated += generateSpanTree(depth - 1, maxSpans);
    }

    span.end();
  });

  return spansCreated;
}

function spanKindToInt(kind: string): number {
  switch (kind) {
    case "SERVER": return 1;
    case "CLIENT": return 2;
    case "PRODUCER": return 3;
    case "CONSUMER": return 4;
    default: return 0; // INTERNAL
  }
}

// ── Generate traces ──────────────────────────────────────────────

for (let i = 0; i < TRACE_COUNT; i++) {
  totalSpansGenerated = 0;
  const targetSpans = rand(20, 100);
  const spansCreated = generateSpanTree(MAX_DEPTH, targetSpans);
  console.log(`  trace ${i + 1}/${TRACE_COUNT}: ${spansCreated} spans`);

  // Also emit some log records correlated to the trace context
  if (Math.random() < 0.5) {
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: `Request processed (trace ${i + 1})`,
      attributes: { "trace.index": String(i) },
    });
  }
}

// ── Also generate some errors for the issues view ────────────────

console.log("\nGenerating error events...");
const errorTypes = [
  { name: "DatabaseTimeoutError", msg: "Connection timed out after 30000ms" },
  { name: "RateLimitError", msg: "Too many requests from IP 10.0.0.1" },
  { name: "AuthenticationError", msg: "Invalid JWT: token expired" },
  { name: "ValidationError", msg: "Field 'email' is required" },
  { name: "NotFoundError", msg: "User with ID 12345 not found" },
  { name: "PaymentError", msg: "Card declined: insufficient funds" },
];

for (let i = 0; i < 20; i++) {
  const errType = pick(errorTypes);
  const err = new Error(errType.msg);
  err.name = errType.name;
  captureException(err, {
    mechanism: "generic",
    handled: Math.random() > 0.3,
    tags: { generator: "fake-traces", index: String(i) },
  });
  console.log(`  error ${i + 1}/20: ${errType.name}`);
}

// ── Flush and shutdown ───────────────────────────────────────────

console.log("\nFlushing telemetry...");
await flush();
// Extra time for batch processors to drain
await new Promise((r) => setTimeout(r, 5000));
console.log("Shutting down...");
await shutdown();
console.log("Done. Data should appear in ~15s after Tinybird MV processing.");
