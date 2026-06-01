/*
 * Strada-authored: a minimal fetch-based OTLP/HTTP JSON exporter for traces
 * and logs. Replaces @opentelemetry/exporter-{trace,logs}-otlp-http +
 * @opentelemetry/otlp-exporter-base, which transitively pull in protobufjs
 * (via @opentelemetry/otlp-transformer's barrel re-export of the protobuf
 * serializers). protobufjs uses a bare require() that crashes under workerd.
 *
 * This exporter only does what Strada needs: JSON-serialize a batch and POST
 * it with the global fetch(). Works in Node 18+, browsers, and Cloudflare
 * Workers. No retries, no compression, no env-var config — Strada always
 * passes an explicit url + headers.
 */

import { diag } from '@opentelemetry/api'
import { type ExportResult, ExportResultCode } from '@opentelemetry/core'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs'
import { JsonTraceSerializer } from './trace/json.ts'
import { JsonLogsSerializer } from './logs/json.ts'

export interface OtlpJsonExporterConfig {
  /** Full signal URL, e.g. `${endpoint}/v1/traces`. */
  url: string
  /** Extra headers, e.g. Authorization. Content-Type is set automatically. */
  headers?: Record<string, string>
}

async function postOtlpJson(
  config: OtlpJsonExporterConfig,
  body: Uint8Array | undefined,
  signalLabel: string,
): Promise<ExportResult> {
  if (body == null) {
    return { code: ExportResultCode.SUCCESS }
  }
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        // config.headers first, then Content-Type last so callers can't
        // override the required OTLP JSON content type (matches OTel).
        ...config.headers,
        'Content-Type': 'application/json',
      },
      // Uint8Array is a valid BodyInit at runtime in Node 18+, browsers, and
      // workerd; the DOM lib's BodyInit type omits it, so cast through.
      body: body as unknown as BodyInit,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const error = new Error(
        `OTLP ${signalLabel} export failed: ${response.status} ${response.statusText} ${text}`.trim(),
      )
      diag.warn(error.message)
      return { code: ExportResultCode.FAILED, error }
    }
    // Drain the body so the connection can be reused / released.
    await response.arrayBuffer().catch(() => undefined)
    return { code: ExportResultCode.SUCCESS }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    diag.warn(`OTLP ${signalLabel} export error: ${error.message}`)
    return { code: ExportResultCode.FAILED, error }
  }
}

/**
 * Serialize a batch and POST it, routing every outcome (including a synchronous
 * serialization throw, e.g. a BigInt attribute that JSON.stringify rejects) to
 * resultCallback. resultCallback is always invoked exactly once.
 */
function exportBatch<T>(
  config: OtlpJsonExporterConfig,
  serialize: (items: T[]) => Uint8Array | undefined,
  items: T[],
  signalLabel: string,
  resultCallback: (result: ExportResult) => void,
): void {
  let body: Uint8Array | undefined
  try {
    body = serialize(items)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    diag.warn(`OTLP ${signalLabel} serialize error: ${error.message}`)
    resultCallback({ code: ExportResultCode.FAILED, error })
    return
  }
  // postOtlpJson never rejects — it converts all errors into a resolved
  // ExportResult — so .then(resultCallback) invokes the callback exactly once.
  void postOtlpJson(config, body, signalLabel).then(resultCallback)
}

/** OTLP/HTTP JSON exporter for spans. */
export class OTLPTraceExporter implements SpanExporter {
  constructor(private readonly config: OtlpJsonExporterConfig) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    exportBatch(
      this.config,
      JsonTraceSerializer.serializeRequest,
      spans,
      'traces',
      resultCallback,
    )
  }

  async shutdown(): Promise<void> {}

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }
}

/** OTLP/HTTP JSON exporter for log records. */
export class OTLPLogExporter implements LogRecordExporter {
  constructor(private readonly config: OtlpJsonExporterConfig) {}

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    exportBatch(
      this.config,
      JsonLogsSerializer.serializeRequest,
      logs,
      'logs',
      resultCallback,
    )
  }

  async shutdown(): Promise<void> {}

  // Strada's flush model (Workers waitUntil, Node fatal-exit, public flush())
  // calls LoggerProvider.forceFlush(), which delegates to this. captureException
  // ships as logs, so this method must exist or buffered errors get dropped.
  forceFlush(): Promise<void> {
    return Promise.resolve()
  }
}
