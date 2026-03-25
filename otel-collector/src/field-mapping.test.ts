import { describe, it, expect } from 'vitest'
import {
  snakeToPascal,
  remapRow,
  remapNdjson,
} from './field-mapping.ts'

describe('snakeToPascal', () => {
  it('converts simple snake_case', () => {
    expect(snakeToPascal('trace_id')).toBe('TraceId')
    expect(snakeToPascal('span_name')).toBe('SpanName')
    expect(snakeToPascal('service_name')).toBe('ServiceName')
  })

  it('converts single words', () => {
    expect(snakeToPascal('body')).toBe('Body')
    expect(snakeToPascal('duration')).toBe('Duration')
    expect(snakeToPascal('level')).toBe('Level')
  })

  it('converts multi-part names', () => {
    expect(snakeToPascal('resource_schema_url')).toBe('ResourceSchemaUrl')
    expect(snakeToPascal('exemplars_filtered_attributes')).toBe('ExemplarsFilteredAttributes')
    expect(snakeToPascal('positive_bucket_counts')).toBe('PositiveBucketCounts')
  })
})

describe('remapRow', () => {
  it('remaps trace row via automatic case conversion', () => {
    const row = {
      trace_id: 'abc123',
      span_id: 'def456',
      service_name: 'my-api',
      start_time: '2024-01-01T00:00:00Z',
      span_name: 'GET /users',
      duration: 1000000,
    }

    const result = remapRow(row, 'traces')
    expect(result).toMatchInlineSnapshot(`
      {
        "Duration": 1000000,
        "ServiceName": "my-api",
        "SpanId": "def456",
        "SpanName": "GET /users",
        "Timestamp": "2024-01-01T00:00:00Z",
        "TraceId": "abc123",
      }
    `)
  })

  it('applies traces exception: start_time → Timestamp', () => {
    const result = remapRow({ start_time: '2024-01-01T00:00:00Z' }, 'traces')
    expect(result).toHaveProperty('Timestamp')
    expect(result).not.toHaveProperty('StartTime')
    expect(result).not.toHaveProperty('start_time')
  })

  it('drops end_time for traces (not in OTel schema)', () => {
    const result = remapRow(
      { start_time: '2024-01-01T00:00:00Z', end_time: '2024-01-01T00:00:01Z', duration: 1000 },
      'traces',
    )
    expect(result).toHaveProperty('Timestamp')
    expect(result).toHaveProperty('Duration', 1000)
    expect(result).not.toHaveProperty('end_time')
    expect(result).not.toHaveProperty('EndTime')
  })

  it('applies traces: trace_flags → TraceFlags (automatic)', () => {
    const result = remapRow({ trace_flags: 1 }, 'traces')
    expect(result).toHaveProperty('TraceFlags', 1)
  })

  it('applies logs exception: flags → TraceFlags', () => {
    const result = remapRow({ flags: 1 }, 'logs')
    expect(result).toHaveProperty('TraceFlags', 1)
    expect(result).not.toHaveProperty('Flags')
  })

  it('applies metrics exception: metric_attributes → Attributes', () => {
    const attrs = { 'http.method': 'GET' }
    const result = remapRow({ metric_attributes: attrs }, 'metrics_gauge')
    expect(result).toHaveProperty('Attributes', attrs)
    expect(result).not.toHaveProperty('MetricAttributes')
  })

  it('applies metrics exception: start_timestamp → StartTimeUnix', () => {
    const result = remapRow({ start_timestamp: '2024-01-01T00:00:00Z' }, 'metrics_gauge')
    expect(result).toHaveProperty('StartTimeUnix')
    expect(result).not.toHaveProperty('StartTimestamp')
  })

  it('applies metrics exception: timestamp → TimeUnix', () => {
    const result = remapRow({ timestamp: '2024-01-01T00:00:00Z' }, 'metrics_gauge')
    expect(result).toHaveProperty('TimeUnix')
    expect(result).not.toHaveProperty('Timestamp')
  })

  it('metrics flags converts automatically to Flags (no exception)', () => {
    const result = remapRow({ flags: 0 }, 'metrics_gauge')
    expect(result).toHaveProperty('Flags', 0)
    expect(result).not.toHaveProperty('TraceFlags')
  })

  it('drops tenant_id for all signals', () => {
    expect(remapRow({ tenant_id: 'acme', trace_id: 't1' }, 'traces')).not.toHaveProperty('TenantId')
    expect(remapRow({ tenant_id: 'acme' }, 'logs')).not.toHaveProperty('TenantId')
    expect(remapRow({ tenant_id: 'acme' }, 'errors')).not.toHaveProperty('TenantId')
    expect(remapRow({ tenant_id: 'acme' }, 'metrics_gauge')).not.toHaveProperty('TenantId')
  })

  it('passes through unknown keys with automatic case conversion', () => {
    const result = remapRow({ custom_field: 'value', trace_id: 't1' }, 'traces')
    expect(result).toHaveProperty('CustomField', 'value')
    expect(result).toHaveProperty('TraceId', 't1')
  })

  it('works for all metric signal kinds', () => {
    for (const signal of ['metrics_gauge', 'metrics_sum', 'metrics_histogram', 'metrics_exponential_histogram'] as const) {
      const result = remapRow({ metric_attributes: { key: 'val' }, timestamp: '2024-01-01T00:00:00Z' }, signal)
      expect(result).toHaveProperty('Attributes')
      expect(result).toHaveProperty('TimeUnix')
    }
  })
})

describe('remapNdjson', () => {
  it('remaps all lines of NDJSON for traces', () => {
    const ndjson = [
      '{"trace_id":"t1","service_name":"api","start_time":"2024-01-01T00:00:00Z"}',
      '{"trace_id":"t2","service_name":"web","start_time":"2024-01-01T00:00:01Z"}',
    ].join('\n')

    const result = remapNdjson(ndjson, 'traces')
    const lines = result.trim().split('\n')
    expect(lines).toHaveLength(2)

    const row1 = JSON.parse(lines[0]!)
    expect(row1.TraceId).toBe('t1')
    expect(row1.Timestamp).toBe('2024-01-01T00:00:00Z')
  })

  it('handles empty lines', () => {
    const ndjson = '{"timestamp":"2024-01-01T00:00:00Z"}\n\n{"timestamp":"2024-01-01T00:00:01Z"}\n'
    const result = remapNdjson(ndjson, 'errors')
    const lines = result.trim().split('\n')
    expect(lines).toHaveLength(2)
  })

  it('remaps error rows correctly', () => {
    const ndjson =
      '{"exception_type":"TypeError","fingerprint_hash":"abc123","mechanism_handled":false}\n'
    const result = remapNdjson(ndjson, 'errors')
    const row = JSON.parse(result.trim())
    expect(row.ExceptionType).toBe('TypeError')
    expect(row.FingerprintHash).toBe('abc123')
    expect(row.MechanismHandled).toBe(false)
  })
})
