/**
 * Node.js runtime entry for @strada.sh/sdk.
 *
 * Wraps @opentelemetry/sdk-node with Strada conventions: auto-instrumentation,
 * global error handlers, captureException, and user/tag context. Everything
 * flows through standard OTel; no custom transport or protocol.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
  type BatchLogRecordProcessorBrowserConfig,
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { logs } from "@opentelemetry/api-logs";
import type { Logger } from "@opentelemetry/api-logs";

import {
  type BatchSpanProcessorBrowserConfig,
  type StradaOptions,
  type CaptureExceptionOptions,
  type StradaTelemetryOptions,
  type UserContext,
  applyBeforeSend,
  normalizeError,
  shouldIgnoreError,
  errorToAttributes,
  setUser,
  setTags,
  resetContext,
  resolveMetricReaderOptions,
  ERROR_SEVERITY,
  ERROR_SEVERITY_TEXT,
} from "./shared.ts";

// Re-export shared types, helpers, and OTel primitives so users only need one import
export {
  type StradaOptions,
  type CaptureExceptionOptions,
  type StradaTelemetryOptions,
  type UserContext,
  setUser,
  setTags,
  type BatchSpanProcessorBrowserConfig,
  type BatchLogRecordProcessorBrowserConfig,
  type PeriodicExportingMetricReaderOptions,
  // OTel API re-exports
  trace,
  context,
  metrics,
  propagation,
  diag,
  SpanStatusCode,
  SpanKind,
  SeverityNumber,
  logs,
  type Tracer,
  type Span,
  type SpanContext,
  type SpanOptions,
  type SpanAttributes,
  type Logger,
} from "./shared.ts";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _sdk: NodeSDK | undefined;
let _loggerProvider: LoggerProvider | undefined;
let _logger: Logger | undefined;
let _options: StradaOptions | undefined;

function isForceFlushable(
  value: unknown,
): value is { forceFlush: () => Promise<void> } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof Reflect.get(value, "forceFlush") === "function";
}

async function forceFlushSdk(): Promise<void> {
  const sdk = _sdk;
  if (!sdk) return;

  const tracerProvider = Reflect.get(sdk, "_tracerProvider");
  const meterProvider = Reflect.get(sdk, "_meterProvider");

  await Promise.all([
    isForceFlushable(tracerProvider) ? tracerProvider.forceFlush() : undefined,
    isForceFlushable(meterProvider) ? meterProvider.forceFlush() : undefined,
  ]);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialize Strada for Node.js. Call this once at app startup, before any
 * application code runs (ideally in a separate instrumentation.ts loaded
 * via --import).
 *
 * This sets up:
 * - OTel NodeSDK with trace, metric, and log exporters
 * - Auto-instrumentation (http, express, pg, mysql, redis, etc.)
 * - Global uncaughtException / unhandledRejection handlers
 * - captureException() for manual error reporting
 */
export function initStrada(options: StradaOptions): void {
  if (_sdk) {
    console.warn(
      "[@strada.sh/sdk] initStrada() was already called. Ignoring duplicate init.",
    );
    return;
  }

  _options = options;

  const resource = resourceFromAttributes({
    "service.name": options.service,
    ...(options.version ? { "service.version": options.version } : {}),
    ...(options.environment
      ? { "deployment.environment.name": options.environment }
      : {}),
  });

  const endpoint = options.endpoint.replace(/\/+$/, "");

  // Log provider (used for both logs and error capture)
  const logExporter = new OTLPLogExporter({
    url: `${endpoint}/v1/logs`,
  });
  _loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(
        logExporter,
        options.telemetry?.logs,
      ),
    ],
  });
  logs.setGlobalLoggerProvider(_loggerProvider);
  _logger = _loggerProvider.getLogger("strada");

  // NodeSDK (traces + metrics)
  _sdk = new NodeSDK({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${endpoint}/v1/traces`,
        }),
        options.telemetry?.traces,
      ),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
        }),
        ...resolveMetricReaderOptions(options),
      }),
    ],
  });

  _sdk.start();

  // Try to load auto-instrumentations (optional peer dep).
  // Dynamic import so the ESM package stays clean. registerInstrumentations()
  // hooks into the global providers which are already registered by sdk.start().
  import("@opentelemetry/auto-instrumentations-node")
    .then((mod) => {
      if (typeof mod.getNodeAutoInstrumentations === "function") {
        registerInstrumentations({
          instrumentations: mod.getNodeAutoInstrumentations(),
        });
      }
    })
    .catch(() => {
      if (options.debug) {
        console.log(
          "[@strada.sh/sdk] @opentelemetry/auto-instrumentations-node not found, skipping auto-instrumentation",
        );
      }
    });

  // Global error handlers
  process.on("uncaughtException", (error) => {
    captureException(error, {
      handled: false,
      mechanism: "uncaughtException",
    });
    flush()
      .catch(() => {})
      .finally(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    const error = normalizeError(reason);
    captureException(error, {
      handled: false,
      mechanism: "unhandledRejection",
    });
  });

  // Graceful shutdown
  const shutdownHandler = () => {
    shutdown().catch(() => {});
  };
  process.on("SIGTERM", shutdownHandler);
  process.on("SIGINT", shutdownHandler);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture an exception and send it to Strada as an OTel log record.
 * The ingest worker extracts exception.* attributes and writes a
 * denormalized row to otel_errors for issue grouping.
 */
export function captureException(
  error: unknown,
  opts?: CaptureExceptionOptions,
): void {
  const normalized = normalizeError(error);

  if (_options && shouldIgnoreError(normalized, _options)) return;
  const prepared = applyBeforeSend(normalized, _options?.beforeSend);
  if (prepared === null) return;

  const attributes = errorToAttributes(prepared, opts);

  if (_logger) {
    _logger.emit({
      eventName: "exception",
      severityNumber: ERROR_SEVERITY,
      severityText: ERROR_SEVERITY_TEXT,
      body: prepared.message,
      attributes,
    });
  } else {
    console.warn(
      "[@strada.sh/sdk] captureException called before initStrada(). Error was not sent.",
    );
  }
}

/**
 * Flush all buffered telemetry (logs, traces, metrics).
 * Call this before process exit to ensure nothing is lost.
 */
export async function flush(): Promise<void> {
  await _loggerProvider?.forceFlush();
  await forceFlushSdk();
}

/**
 * Shut down the SDK and flush remaining telemetry.
 */
export async function shutdown(): Promise<void> {
  await _sdk?.shutdown();
  await _loggerProvider?.shutdown();
  _sdk = undefined;
  _loggerProvider = undefined;
  _logger = undefined;
  _options = undefined;
  resetContext();
}
