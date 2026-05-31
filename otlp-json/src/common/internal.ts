/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/common/internal.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes } from '@opentelemetry/api'
import type { Resource } from '@opentelemetry/resources'
import type { Encoder } from './utils.ts'
import type {
  IAnyValue,
  IArrayValue,
  IInstrumentationScope,
  IKeyValue,
  IKeyValueList,
  Resource as OtlpResource,
} from './internal-types.ts'

export function createInstrumentationScope(scope?: {
  name: string
  version?: string
  schemaUrl?: string
}): IInstrumentationScope | undefined {
  if (scope == null) {
    return undefined
  }
  return {
    name: scope.name,
    version: scope.version,
  }
}

export function createResource(resource: Resource, encoder: Encoder): OtlpResource {
  return {
    attributes: toAttributes(resource.attributes, encoder),
    droppedAttributesCount: 0,
  }
}

export function toAttributes(attributes: Attributes, encoder: Encoder): IKeyValue[] {
  return Object.keys(attributes).map((key) =>
    toKeyValue(key, attributes[key], encoder),
  )
}

export function toKeyValue(
  key: string,
  value: unknown,
  encoder: Encoder,
): IKeyValue {
  return {
    key: key,
    value: toAnyValue(value, encoder),
  }
}

export function toAnyValue(value: unknown, encoder: Encoder): IAnyValue {
  const t = typeof value
  if (t === 'string') return { stringValue: value as string }
  if (t === 'number') {
    if (!Number.isInteger(value)) return { doubleValue: value as number }
    return { intValue: value as number }
  }
  if (t === 'boolean') return { boolValue: value as boolean }
  if (value instanceof Uint8Array)
    return { bytesValue: encoder.encodeUint8Array(value) }
  if (Array.isArray(value)) return { arrayValue: toArrayValue(value, encoder) }
  if (t === 'object' && value != null)
    return {
      kvlistValue: toKeyValueList(value as Record<string, unknown>, encoder),
    }
  else return {}
}

function toArrayValue(values: unknown[], encoder: Encoder): IArrayValue {
  return {
    values: values.map((value) => toAnyValue(value, encoder)),
  }
}

function toKeyValueList(
  value: Record<string, unknown>,
  encoder: Encoder,
): IKeyValueList {
  return {
    values: Object.entries(value).map(([k, v]) => {
      return toKeyValue(k, v, encoder)
    }),
  }
}
