/*
 * @strada.sh/otlp-json
 *
 * Minimal JSON-only OTLP/HTTP exporters for traces and logs. The JSON
 * serializers are vendored from @opentelemetry/otlp-transformer (JSON path
 * only, no protobuf, no metrics) and paired with a tiny fetch-based exporter.
 * This keeps protobufjs out of the dependency graph, which is required to run
 * under Cloudflare Workers / workerd.
 */

export {
  OTLPTraceExporter,
  OTLPLogExporter,
  type OtlpJsonExporterConfig,
} from './exporter.ts'
export { JsonTraceSerializer } from './trace/json.ts'
export { JsonLogsSerializer } from './logs/json.ts'
export type { ISerializer } from './i-serializer.ts'
