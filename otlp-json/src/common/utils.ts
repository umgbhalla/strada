/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/common/utils.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 *
 * Trimmed to the JSON_ENCODER path. The PROTOBUF_ENCODER and longBits helpers
 * are removed since the JSON serializers only ever use JSON_ENCODER.
 */

import type { HrTime } from '@opentelemetry/api'

export function hrTimeToNanos(hrTime: HrTime): bigint {
  const NANOSECONDS = BigInt(1_000_000_000)
  return (
    BigInt(Math.trunc(hrTime[0])) * NANOSECONDS + BigInt(Math.trunc(hrTime[1]))
  )
}

export function encodeAsString(hrTime: HrTime): string {
  const nanos = hrTimeToNanos(hrTime)
  return nanos.toString()
}

// BigInt is always available in our supported runtimes (Node 18+, modern
// browsers, workerd), so the JSON encoder always uses the string path.
const encodeTimestamp = encodeAsString

export type HrTimeEncodeFunction = (hrTime: HrTime) => string | number
export type SpanContextEncodeFunction = (spanContext: string) => string
export type OptionalSpanContextEncodeFunction = (
  spanContext: string | undefined,
) => string | undefined
export type Uint8ArrayEncodeFunction = (value: Uint8Array) => string

export interface Encoder {
  encodeHrTime: HrTimeEncodeFunction
  encodeSpanContext: SpanContextEncodeFunction
  encodeOptionalSpanContext: OptionalSpanContextEncodeFunction
  encodeUint8Array: Uint8ArrayEncodeFunction
}

function identity<T>(value: T): T {
  return value
}

/**
 * Encoder for JSON format.
 * Uses string timestamps, string span/trace IDs, and base64 for Uint8Array.
 */
export const JSON_ENCODER: Encoder = {
  encodeHrTime: encodeTimestamp,
  encodeSpanContext: identity,
  encodeOptionalSpanContext: identity,
  encodeUint8Array: (bytes: Uint8Array): string => {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64')
    }

    // implementation note: not using spread operator and passing to
    // btoa to avoid stack overflow on large Uint8Arrays
    const chars = new Array<string>(bytes.length)
    for (let i = 0; i < bytes.length; i++) {
      chars[i] = String.fromCharCode(bytes[i]!)
    }
    return btoa(chars.join(''))
  },
}
