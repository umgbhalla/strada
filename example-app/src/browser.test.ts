// Browser integration tests for the Strada SDK browser entry.
// Runs in headless Chromium via vitest browser mode + Playwright.
//
// Exercises every public SDK API: initStrada, track, startPageSpan,
// endCurrentPageSpan, captureException, setTags, flush, shutdown,
// plus the re-exported OTel APIs (trace, logs, metrics, context).
//
// After these tests run and data propagates (~15s for Tinybird MV
// processing), run browser-verify.test.ts to query the analytics
// tables and verify the data landed correctly.
//
// Run with:
//   STRADA_PROJECT_ID=<id> STRADA_ENDPOINT=<url> pnpm test:browser
//
// Tests skip automatically when env vars are missing.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  initStrada,
  track,
  startPageSpan,
  endCurrentPageSpan,
  captureException,
  setTags,
  flush,
  shutdown,
  // OTel API re-exports
  trace,
  logs,
  metrics,
  context,
  SpanStatusCode,
  SpanKind,
  SeverityNumber,
} from "@strada.sh/sdk/browser";

// Vite exposes STRADA_* env vars via import.meta.env (configured via envPrefix).
const projectId = import.meta.env.STRADA_PROJECT_ID as string | undefined;
const endpoint = import.meta.env.STRADA_ENDPOINT as string | undefined;

describe.skipIf(!projectId || !endpoint)("browser SDK telemetry", () => {
  beforeAll(() => {
    initStrada({
      projectId: projectId!,
      endpoint: endpoint!,
      service: "browser-test",
      version: "0.0.1-browser-test",
      environment: "test",
    });
  });

  afterAll(async () => {
    await flush();
    // Give the SDK time to export all batched telemetry
    await new Promise((r) => setTimeout(r, 5000));
    await shutdown();
  });

  // ── Session management ──────────────────────────────────────────

  test("session.id is stored in sessionStorage after init", () => {
    const sessionId = sessionStorage.getItem("strada.session_id");
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe("string");
    // Should be a UUID-like string
    expect(sessionId!.length).toBeGreaterThan(10);
  });

  // ── setTags ─────────────────────────────────────────────────────

  test("setTags sets persistent tags on subsequent errors", () => {
    // Tags set here should appear on all subsequent captureException calls
    setTags({
      "app.version": "2.1.0",
      "app.env": "browser-test",
      "team": "platform",
    });
    // No assertion needed; we verify tags in browser-verify.test.ts
    // by checking error attributes include these tags.
  });

  // ── track() custom events ──────────────────────────────────────

  test("track() emits simple events", () => {
    track("page_loaded");
    track("cta_viewed");
    track("newsletter_dismissed");
  });

  test("track() emits events with custom properties", () => {
    track("signup_started", {
      plan: "pro",
      source: "hero-cta",
      variant: "A",
    });

    track("purchase_completed", {
      amount: "49.99",
      currency: "USD",
      plan: "enterprise",
      payment_method: "credit_card",
    });

    track("feature_used", {
      feature: "dark-mode",
      toggle: "on",
    });

    track("search_performed", {
      query: "opentelemetry setup",
      results_count: "42",
      filter: "docs",
    });
  });

  // ── Pageview span lifecycle ─────────────────────────────────────

  test("startPageSpan/endCurrentPageSpan cycle through SPA pages", () => {
    // The initial pageview was started by initStrada().
    // Simulate SPA navigation by cycling through pages.

    endCurrentPageSpan();
    startPageSpan("/pricing");

    // Track an event mid-page to verify pageview correlation
    track("pricing_plan_compared", { plans: "pro,enterprise" });

    endCurrentPageSpan();
    startPageSpan("/checkout");

    endCurrentPageSpan();
    startPageSpan("/success");

    // Track an event on the /success page
    track("checkout_complete", { plan: "pro", order_id: "ord_12345" });

    endCurrentPageSpan();
    startPageSpan("/dashboard");

    // Navigate again to test multiple rapid transitions
    endCurrentPageSpan();
    startPageSpan("/settings");

    endCurrentPageSpan();
    startPageSpan("/settings/billing");
  });

  // ── OTel trace API (custom spans) ──────────────────────────────

  test("trace.getTracer() creates custom spans", () => {
    const tracer = trace.getTracer("browser-test-custom");

    // Simple span
    const span1 = tracer.startSpan("db.query", {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system": "indexeddb",
        "db.operation": "get",
        "db.name": "user-cache",
      },
    });
    span1.setStatus({ code: SpanStatusCode.OK });
    span1.end();

    // Nested spans via context
    const parentSpan = tracer.startSpan("render.page", {
      attributes: { "page.name": "dashboard" },
    });
    const parentCtx = trace.setSpan(context.active(), parentSpan);

    context.with(parentCtx, () => {
      const childSpan = tracer.startSpan("render.component", {
        attributes: { "component.name": "chart-widget" },
      });
      childSpan.addEvent("data_fetched", { "rows": 150 });
      childSpan.setStatus({ code: SpanStatusCode.OK });
      childSpan.end();
    });

    parentSpan.setStatus({ code: SpanStatusCode.OK });
    parentSpan.end();

    // Span with error status
    const errorSpan = tracer.startSpan("api.call", {
      kind: SpanKind.CLIENT,
      attributes: {
        "http.method": "POST",
        "http.url": "https://api.example.com/data",
      },
    });
    errorSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: "timeout after 5000ms",
    });
    errorSpan.recordException(new Error("Request timeout"));
    errorSpan.end();
  });

  // ── OTel logs API (direct log records) ──────────────────────────

  test("logs.getLogger() emits log records at various severities", () => {
    const logger = logs.getLogger("browser-test-logs");

    logger.emit({
      severityNumber: SeverityNumber.DEBUG,
      severityText: "DEBUG",
      body: "Initializing browser test suite",
      attributes: { "test.phase": "setup" },
    });

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "User navigated to pricing page",
      attributes: {
        "url.path": "/pricing",
        "session.type": "returning",
      },
    });

    logger.emit({
      severityNumber: SeverityNumber.WARN,
      severityText: "WARN",
      body: "API response was slow (> 2s)",
      attributes: {
        "http.url": "https://api.example.com/plans",
        "http.duration_ms": "2340",
      },
    });

    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: "Failed to load user preferences from localStorage",
      attributes: {
        "error.type": "QuotaExceededError",
        "storage.used_bytes": "5242880",
      },
    });
  });

  // ── OTel metrics API ────────────────────────────────────────────

  test("metrics.getMeter() creates counters, histograms, and gauges", () => {
    const meter = metrics.getMeter("browser-test-metrics");

    // Counter: page interactions
    const clickCounter = meter.createCounter("browser.clicks", {
      description: "Number of click interactions",
      unit: "clicks",
    });
    clickCounter.add(1, { element: "buy-button", page: "/pricing" });
    clickCounter.add(3, { element: "nav-link", page: "/pricing" });
    clickCounter.add(1, { element: "cta-hero", page: "/" });

    // Histogram: component render times
    const renderHistogram = meter.createHistogram("browser.render_time", {
      description: "Component render duration",
      unit: "ms",
    });
    renderHistogram.record(12.5, { component: "header" });
    renderHistogram.record(45.2, { component: "chart-widget" });
    renderHistogram.record(3.1, { component: "footer" });
    renderHistogram.record(120.7, { component: "data-table" });

    // UpDownCounter: active WebSocket connections
    const wsCounter = meter.createUpDownCounter("browser.ws_connections", {
      description: "Active WebSocket connections",
    });
    wsCounter.add(1, { endpoint: "wss://realtime.example.com" });
    wsCounter.add(1, { endpoint: "wss://chat.example.com" });
    wsCounter.add(-1, { endpoint: "wss://realtime.example.com" });
  });

  // ── captureException with various error types ──────────────────

  test("captureException with handled TypeError", () => {
    try {
      const obj: any = null;
      obj.foo.bar;
    } catch (error) {
      captureException(error, {
        mechanism: "generic",
        handled: true,
        tags: { page: "/dashboard", component: "sidebar" },
      });
    }
  });

  test("captureException with unhandled error", () => {
    const err = new Error("Unhandled promise rejection in browser test");
    err.name = "BrowserUnhandledError";
    captureException(err, {
      mechanism: "unhandledrejection",
      handled: false,
      tags: { page: "/dashboard" },
    });
  });

  test("captureException with custom fingerprint", () => {
    const err = new Error("WebSocket disconnected unexpectedly");
    err.name = "WebSocketError";
    captureException(err, {
      mechanism: "generic",
      handled: true,
      fingerprint: ["websocket-disconnect", "browser-test"],
      tags: {
        "ws.endpoint": "wss://realtime.example.com",
        "ws.close_code": "1006",
      },
    });
  });

  test("captureException with RangeError", () => {
    try {
      new Array(-1);
    } catch (error) {
      captureException(error, {
        mechanism: "generic",
        handled: true,
        tags: { page: "/settings", action: "resize-buffer" },
      });
    }
  });

  test("captureException with non-Error values", () => {
    // String thrown as error
    captureException("Something went wrong as a string", {
      mechanism: "generic",
      handled: true,
    });

    // Object thrown as error
    captureException({ code: "NETWORK_ERROR", status: 503 }, {
      mechanism: "generic",
      handled: true,
      tags: { source: "fetch-interceptor" },
    });
  });

  // ── Flush ───────────────────────────────────────────────────────

  test("flush sends all buffered telemetry", async () => {
    await flush();
  });
});
