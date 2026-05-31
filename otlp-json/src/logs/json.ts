/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/logs/json/logs.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api'
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs'
import type { ISerializer } from '../i-serializer.ts'
import { JSON_ENCODER } from '../common/utils.ts'
import { createExportLogsServiceRequest } from './internal.ts'
import type { IExportLogsServiceResponse } from './internal-types.ts'

export const JsonLogsSerializer: ISerializer<
  ReadableLogRecord[],
  IExportLogsServiceResponse
> = {
  serializeRequest: (arg: ReadableLogRecord[]) => {
    const request = createExportLogsServiceRequest(arg, JSON_ENCODER)
    const encoder = new TextEncoder()
    return encoder.encode(JSON.stringify(request))
  },
  deserializeResponse: (arg: Uint8Array) => {
    if (arg.length === 0) {
      return {}
    }
    const decoder = new TextDecoder()
    try {
      return JSON.parse(decoder.decode(arg)) as IExportLogsServiceResponse
    } catch (err) {
      diag.warn(
        `Failed to parse logs export response: ${
          (err as Error).message
        }. Returning empty response`,
      )
      return {}
    }
  },
}
