/*
 * Vendored from @opentelemetry/otlp-transformer (JSON path only).
 * Source: https://github.com/open-telemetry/opentelemetry-js/blob/v0.214.0/experimental/packages/otlp-transformer/src/logs/internal.ts
 * Copyright The OpenTelemetry Authors — SPDX-License-Identifier: Apache-2.0
 */

import type { LogAttributes, SeverityNumber } from '@opentelemetry/api-logs'
import type { Resource } from '@opentelemetry/resources'
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs'
import {
  createInstrumentationScope,
  createResource,
  toAnyValue,
  toKeyValue,
} from '../common/internal.ts'
import type { IKeyValue } from '../common/internal-types.ts'
import type { Encoder } from '../common/utils.ts'
import type {
  ESeverityNumber,
  IExportLogsServiceRequest,
  ILogRecord,
  IResourceLogs,
} from './internal-types.ts'

export function createExportLogsServiceRequest(
  logRecords: ReadableLogRecord[],
  encoder: Encoder,
): IExportLogsServiceRequest {
  return {
    resourceLogs: logRecordsToResourceLogs(logRecords, encoder),
  }
}

function createResourceMap(
  logRecords: ReadableLogRecord[],
): Map<Resource, Map<string, ReadableLogRecord[]>> {
  const resourceMap: Map<Resource, Map<string, ReadableLogRecord[]>> = new Map()

  for (const record of logRecords) {
    const {
      resource,
      instrumentationScope: { name, version = '', schemaUrl = '' },
    } = record

    let ismMap = resourceMap.get(resource)
    if (!ismMap) {
      ismMap = new Map()
      resourceMap.set(resource, ismMap)
    }

    const ismKey = `${name}@${version}:${schemaUrl}`
    let records = ismMap.get(ismKey)
    if (!records) {
      records = []
      ismMap.set(ismKey, records)
    }
    records.push(record)
  }
  return resourceMap
}

function logRecordsToResourceLogs(
  logRecords: ReadableLogRecord[],
  encoder: Encoder,
): IResourceLogs[] {
  const resourceMap = createResourceMap(logRecords)
  return Array.from(resourceMap, ([resource, ismMap]) => {
    const processedResource = createResource(resource, encoder)
    return {
      resource: processedResource,
      scopeLogs: Array.from(ismMap, ([, scopeLogs]) => {
        const first = scopeLogs[0]!
        return {
          scope: createInstrumentationScope(first.instrumentationScope),
          logRecords: scopeLogs.map((log) => toLogRecord(log, encoder)),
          schemaUrl: first.instrumentationScope.schemaUrl,
        }
      }),
      schemaUrl: processedResource.schemaUrl,
    }
  })
}

function toLogRecord(log: ReadableLogRecord, encoder: Encoder): ILogRecord {
  return {
    timeUnixNano: encoder.encodeHrTime(log.hrTime),
    observedTimeUnixNano: encoder.encodeHrTime(log.hrTimeObserved),
    severityNumber: toSeverityNumber(log.severityNumber),
    severityText: log.severityText,
    body: toAnyValue(log.body, encoder),
    eventName: log.eventName,
    attributes: toLogAttributes(log.attributes, encoder),
    droppedAttributesCount: log.droppedAttributesCount,
    flags: log.spanContext?.traceFlags,
    traceId: encoder.encodeOptionalSpanContext(log.spanContext?.traceId),
    spanId: encoder.encodeOptionalSpanContext(log.spanContext?.spanId),
  }
}

function toSeverityNumber(
  severityNumber: SeverityNumber | undefined,
): ESeverityNumber | undefined {
  return severityNumber as number | undefined as ESeverityNumber | undefined
}

function toLogAttributes(attributes: LogAttributes, encoder: Encoder): IKeyValue[] {
  return Object.keys(attributes).map((key) =>
    toKeyValue(key, attributes[key], encoder),
  )
}
