/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/i-serializer.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 */

/**
 * Serializes and deserializes the OTLP request/response to and from {@link Uint8Array}
 */
export interface ISerializer<Request, Response> {
  serializeRequest(request: Request): Uint8Array | undefined
  deserializeResponse(data: Uint8Array): Response
}
