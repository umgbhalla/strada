/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/common/internal-types.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 */

/**
 * Options controlling how trace/span IDs and timestamps are encoded.
 * The JSON path uses the JSON_ENCODER (string IDs + string nanos), so
 * useHex/useLongBits are not exercised here, but the types are kept for
 * the shared Encoder interface.
 */
export interface OtlpEncodingOptions {
  /** Convert trace and span IDs to hex strings. */
  useHex?: boolean
  /** Convert HrTime to nanoseconds. */
  useLongBits?: boolean
}

export interface LongBits {
  low: number
  high: number
}

export interface IKeyValue {
  key: string
  value: IAnyValue
}

export interface IAnyValue {
  stringValue?: string | null
  boolValue?: boolean | null
  intValue?: number | null
  doubleValue?: number | null
  arrayValue?: IArrayValue
  kvlistValue?: IKeyValueList
  bytesValue?: Uint8Array | string
}

export interface IArrayValue {
  values: IAnyValue[]
}

export interface IKeyValueList {
  values: IKeyValue[]
}

export interface IInstrumentationScope {
  name: string
  version?: string
  attributes?: IKeyValue[]
  droppedAttributesCount?: number
}

export interface Resource {
  attributes: IKeyValue[]
  droppedAttributesCount: number
  entityRefs?: IEntityRef[]
  schemaUrl?: string
}

export interface IEntityRef {
  schemaUrl?: string
  type: string
  idKeys: string[]
  descriptionKeys: string[]
}
