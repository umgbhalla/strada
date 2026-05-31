/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/trace/json/trace.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { ISerializer } from '../i-serializer.ts'
import { JSON_ENCODER } from '../common/utils.ts'
import { createExportTraceServiceRequest } from './internal.ts'
import type { IExportTraceServiceResponse } from './internal-types.ts'

export const JsonTraceSerializer: ISerializer<
  ReadableSpan[],
  IExportTraceServiceResponse
> = {
  serializeRequest: (arg: ReadableSpan[]) => {
    const request = createExportTraceServiceRequest(arg, JSON_ENCODER)
    const encoder = new TextEncoder()
    return encoder.encode(JSON.stringify(request))
  },
  deserializeResponse: (arg: Uint8Array) => {
    if (arg.length === 0) {
      return {}
    }
    const decoder = new TextDecoder()
    try {
      return JSON.parse(decoder.decode(arg)) as IExportTraceServiceResponse
    } catch (err) {
      diag.warn(
        `Failed to parse trace export response: ${
          (err as Error).message
        }. Returning empty response`,
      )
      return {}
    }
  },
}
