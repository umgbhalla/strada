import { describe, it, expect } from 'vitest'
import {
  remapRow,
  remapNdjson,
  getMappingForTable,
  TRACES_MAPPING,
  LOGS_MAPPING,
  ERRORS_MAPPING,
  GAUGE_MAPPING,
  SUM_MAPPING,
  HISTOGRAM_MAPPING,
  EXPONENTIAL_HISTOGRAM_MAPPING,
} from './field-mapping.ts'

describe('getMappingForTable', () => {
  it('returns mapping for known tables', () => {
    expect(getMappingForTable('otel_traces')).toBe(TRACES_MAPPING)
    expect(getMappingForTable('otel_logs')).toBe(LOGS_MAPPING)
    expect(getMappingForTable('otel_errors')).toBe(ERRORS_MAPPING)
    expect(getMappingForTable('otel_metrics_gauge')).toBe(GAUGE_MAPPING)
    expect(getMappingForTable('otel_metrics_sum')).toBe(SUM_MAPPING)
    expect(getMappingForTable('otel_metrics_histogram')).toBe(HISTOGRAM_MAPPING)
    expect(getMappingForTable('otel_metrics_exponential_histogram')).toBe(
      EXPONENTIAL_HISTOGRAM_MAPPING,
    )
  })

  it('returns null for unknown tables', () => {
    expect(getMappingForTable('unknown_table')).toBeNull()
  })
})

describe('remapRow', () => {
  it('remaps trace row keys', () => {
    const row = {
      tenant_id: 'acme',
      trace_id: 'abc123',
      span_id: 'def456',
      service_name: 'my-api',
      start_time: '2024-01-01T00:00:00Z',
      span_name: 'GET /users',
      duration: 1000000,
    }

    const result = remapRow(row, TRACES_MAPPING)
    expect(result).toMatchInlineSnapshot(`
      {
        "Duration": 1000000,
        "ServiceName": "my-api",
        "SpanId": "def456",
        "SpanName": "GET /users",
        "TenantId": "acme",
        "Timestamp": "2024-01-01T00:00:00Z",
        "TraceId": "abc123",
      }
    `)
  })

  it('remaps non-trivial trace mapping: start_time → Timestamp', () => {
    const result = remapRow(
      { start_time: '2024-01-01T00:00:00Z' },
      TRACES_MAPPING,
    )
    expect(result).toHaveProperty('Timestamp')
    expect(result).not.toHaveProperty('start_time')
  })

  it('remaps non-trivial log mapping: flags → TraceFlags', () => {
    const result = remapRow({ flags: 1 }, LOGS_MAPPING)
    expect(result).toHaveProperty('TraceFlags', 1)
    expect(result).not.toHaveProperty('flags')
  })

  it('remaps non-trivial metric mapping: metric_attributes → Attributes', () => {
    const attrs = { 'http.method': 'GET' }
    const result = remapRow({ metric_attributes: attrs }, GAUGE_MAPPING)
    expect(result).toHaveProperty('Attributes', attrs)
    expect(result).not.toHaveProperty('metric_attributes')
  })

  it('remaps non-trivial metric mapping: start_timestamp → StartTimeUnix', () => {
    const result = remapRow(
      { start_timestamp: '2024-01-01T00:00:00Z' },
      GAUGE_MAPPING,
    )
    expect(result).toHaveProperty('StartTimeUnix')
  })

  it('remaps non-trivial metric mapping: timestamp → TimeUnix', () => {
    const result = remapRow(
      { timestamp: '2024-01-01T00:00:00Z' },
      GAUGE_MAPPING,
    )
    expect(result).toHaveProperty('TimeUnix')
  })

  it('remaps metric flags → Flags (not TraceFlags)', () => {
    const result = remapRow({ flags: 0 }, GAUGE_MAPPING)
    expect(result).toHaveProperty('Flags', 0)
    expect(result).not.toHaveProperty('TraceFlags')
  })

  it('passes through unknown keys unchanged', () => {
    const result = remapRow({ unknown_field: 'value' }, TRACES_MAPPING)
    expect(result).toHaveProperty('unknown_field', 'value')
  })
})

describe('remapNdjson', () => {
  it('remaps all lines of NDJSON for traces', () => {
    const ndjson = [
      '{"tenant_id":"acme","trace_id":"t1","service_name":"api","start_time":"2024-01-01T00:00:00Z"}',
      '{"tenant_id":"acme","trace_id":"t2","service_name":"web","start_time":"2024-01-01T00:00:01Z"}',
    ].join('\n')

    const result = remapNdjson(ndjson, 'otel_traces')
    const lines = result.trim().split('\n')
    expect(lines).toHaveLength(2)

    const row1 = JSON.parse(lines[0]!)
    expect(row1.TenantId).toBe('acme')
    expect(row1.TraceId).toBe('t1')
    expect(row1.Timestamp).toBe('2024-01-01T00:00:00Z')
    expect(row1.tenant_id).toBeUndefined()
  })

  it('passes through NDJSON for unknown tables', () => {
    const ndjson = '{"foo":"bar"}\n'
    expect(remapNdjson(ndjson, 'unknown_table')).toBe(ndjson)
  })

  it('handles empty lines', () => {
    const ndjson = '{"tenant_id":"acme"}\n\n{"tenant_id":"beta"}\n'
    const result = remapNdjson(ndjson, 'otel_errors')
    const lines = result.trim().split('\n')
    expect(lines).toHaveLength(2)
  })

  it('remaps error rows correctly', () => {
    const ndjson =
      '{"tenant_id":"acme","exception_type":"TypeError","fingerprint_hash":"abc123","mechanism_handled":false}\n'
    const result = remapNdjson(ndjson, 'otel_errors')
    const row = JSON.parse(result.trim())
    expect(row.TenantId).toBe('acme')
    expect(row.ExceptionType).toBe('TypeError')
    expect(row.FingerprintHash).toBe('abc123')
    expect(row.MechanismHandled).toBe(false)
  })
})
