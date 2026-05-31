/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/trace/internal-types.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 */

import type {
  IInstrumentationScope,
  IKeyValue,
  Resource,
} from '../common/internal-types.ts'

export interface IExportTraceServiceRequest {
  resourceSpans?: IResourceSpans[]
}

export interface IExportTraceServiceResponse {
  partialSuccess?: IExportTracePartialSuccess
}

export interface IExportTracePartialSuccess {
  rejectedSpans?: number
  errorMessage?: string
}

export interface IResourceSpans {
  resource?: Resource
  scopeSpans: IScopeSpans[]
  schemaUrl?: string
}

export interface IScopeSpans {
  scope?: IInstrumentationScope
  spans?: ISpan[]
  schemaUrl?: string
}

export interface ISpan {
  traceId: string | Uint8Array
  spanId: string | Uint8Array
  traceState?: string | null
  parentSpanId?: string | Uint8Array
  name: string
  kind: ESpanKind
  startTimeUnixNano: number | string
  endTimeUnixNano: number | string
  attributes: IKeyValue[]
  droppedAttributesCount: number
  events: IEvent[]
  droppedEventsCount: number
  links: ILink[]
  droppedLinksCount: number
  status: IStatus
  flags?: number
}

export interface IStatus {
  message?: string
  code: EStatusCode
}

export enum EStatusCode {
  STATUS_CODE_UNSET = 0,
  STATUS_CODE_OK = 1,
  STATUS_CODE_ERROR = 2,
}

export interface IEvent {
  timeUnixNano: number | string
  name: string
  attributes: IKeyValue[]
  droppedAttributesCount: number
}

export interface ILink {
  traceId: string | Uint8Array
  spanId: string | Uint8Array
  traceState?: string
  attributes: IKeyValue[]
  droppedAttributesCount: number
  flags?: number
}

export enum ESpanKind {
  SPAN_KIND_UNSPECIFIED = 0,
  SPAN_KIND_INTERNAL = 1,
  SPAN_KIND_SERVER = 2,
  SPAN_KIND_CLIENT = 3,
  SPAN_KIND_PRODUCER = 4,
  SPAN_KIND_CONSUMER = 5,
}
