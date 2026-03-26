import { describe, expect, it } from "vitest"
import { ZodError } from "zod"
import type { QueryAdapter, QueryRequest, QueryResult } from "./adapter.ts"
import { RefNotFoundError } from "./errors.ts"
import { REF_ID_EXPR } from "./ref.ts"
import { QueryLayer } from "./query-layer.ts"
import type { FilterNode, LogEntry } from "./types.ts"

function mockAdapter(): QueryAdapter & { calls: QueryRequest[] } {
  return {
    calls: [],
    async query<T>(req: QueryRequest): Promise<QueryResult<T>> {
      this.calls.push(req)
      return { data: [] }
    },
  }
}

function fakeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    Timestamp: "2024-01-15 10:30:00.000000000",
    TimestampNano: "1705312200000000000",
    RefId: "12345678901234567890",
    TraceId: "abc123",
    SpanId: "def456",
    SeverityNumber: 9,
    SeverityText: "INFO",
    Body: "hello world",
    ServiceName: "api",
    ResourceAttributes: {},
    LogAttributes: {},
    ...overrides,
  }
}

const TIME_RANGE = { start: "2024-01-01T00:00:00Z", end: "2024-01-02T00:00:00Z" }

// ---------------------------------------------------------------------------
// firstPageLoad
// ---------------------------------------------------------------------------

describe("QueryLayer.firstPageLoad", () => {
  it("fires parallel queries for logs, filter meta, and suggestions", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await ql.firstPageLoad(
      {
        filters: { kind: "and", children: [] },
        timeRange: TIME_RANGE,
        pageSize: 50,
      },
      ac.signal,
    )

    // Should fire at least 3 queries: logs page, count, 2x suggestions (log + resource)
    expect(adapter.calls.length).toBeGreaterThanOrEqual(3)
  })

  it("includes time range in every query", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await ql.firstPageLoad(
      {
        filters: { kind: "and", children: [] },
        timeRange: TIME_RANGE,
        pageSize: 50,
      },
      ac.signal,
    )

    // The logs query should have Timestamp bounds
    const logQuery = adapter.calls[0]!
    expect(logQuery.sql).toContain("Timestamp >=")
    expect(logQuery.sql).toContain("Timestamp <=")
  })

  it("detects hasMore when result exceeds pageSize", async () => {
    const adapter: QueryAdapter = {
      async query<T>(req: QueryRequest): Promise<QueryResult<T>> {
        if (req.sql.includes("SELECT\n    Timestamp")) {
          // Return pageSize+1 rows to indicate more
          return {
            data: Array.from({ length: 4 }, () => fakeLogEntry()) as T[],
          }
        }
        if (req.sql.includes("count()")) {
          return { data: [{ totalRows: 100 }] as T[] }
        }
        return { data: [] }
      },
    }
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    const result = await ql.firstPageLoad(
      {
        filters: { kind: "and", children: [] },
        timeRange: TIME_RANGE,
        pageSize: 3,
      },
      ac.signal,
    )

    expect(result.hasMore).toBe(true)
    expect(result.logs).toHaveLength(3) // trimmed from 4
  })

  it("applies user filters to the query", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    const filter: FilterNode = {
      kind: "compare",
      field: { source: "top", column: "SeverityText" },
      op: "eq",
      value: "ERROR",
    }

    await ql.firstPageLoad(
      {
        filters: filter,
        timeRange: TIME_RANGE,
        pageSize: 50,
      },
      ac.signal,
    )

    const logQuery = adapter.calls[0]!
    expect(logQuery.sql).toContain("SeverityText =")
    expect(logQuery.params?.p2?.value).toBe("ERROR")
  })
})

// ---------------------------------------------------------------------------
// paginateForward / paginateBackward
// ---------------------------------------------------------------------------

describe("QueryLayer.paginateForward", () => {
  it("includes cursor condition with < for forward pagination", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await ql.paginateForward(
      { kind: "and", children: [] },
      TIME_RANGE,
      { ts: "1705312200000000000", refId: "12345", dir: "forward" },
      50,
      ac.signal,
    )

    const sql = adapter.calls[0]!.sql
    expect(sql).toContain(`(Timestamp, ${REF_ID_EXPR}) <`)
    expect(sql).toContain("ORDER BY Timestamp DESC")
    expect(sql).toContain("LIMIT 51") // pageSize + 1
  })
})

describe("QueryLayer.paginateBackward", () => {
  it("uses > comparator and ASC order for backward pagination", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await ql.paginateBackward(
      { kind: "and", children: [] },
      TIME_RANGE,
      { ts: "1705312200000000000", refId: "12345", dir: "backward" },
      50,
      ac.signal,
    )

    const sql = adapter.calls[0]!.sql
    expect(sql).toContain(`(Timestamp, ${REF_ID_EXPR}) >`)
    expect(sql).toContain("ORDER BY Timestamp ASC")
  })
})

// ---------------------------------------------------------------------------
// resolveRef
// ---------------------------------------------------------------------------

describe("QueryLayer.resolveRef", () => {
  it("uses tight time window around ref timestamp", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await ql
      .resolveRef(
        { ts: "1705312200000000000", refId: "12345" },
        ac.signal,
      )
      .catch(() => {}) // will throw RefNotFoundError since mock returns empty

    const sql = adapter.calls[0]!.sql
    expect(sql).toContain("fromUnixTimestamp64Nano(")
    expect(sql).toContain(`${REF_ID_EXPR} =`)
    expect(sql).toContain("LIMIT 1")
  })

  it("throws RefNotFoundError when no row matches", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.resolveRef(
        { ts: "1705312200000000000", refId: "12345" },
        ac.signal,
      ),
    ).rejects.toThrow(RefNotFoundError)
  })

  it("returns log and cursor when found", async () => {
    const log = fakeLogEntry()
    const adapter: QueryAdapter = {
      async query<T>(): Promise<QueryResult<T>> {
        return { data: [log] as T[] }
      },
    }
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    const result = await ql.resolveRef(
      { ts: log.TimestampNano, refId: log.RefId },
      ac.signal,
    )

    expect(result.log).toEqual(log)
    expect(result.cursor.ts).toBe(log.TimestampNano)
    expect(result.cursor.refId).toBe(log.RefId)
  })
})

// ---------------------------------------------------------------------------
// completeKeys
// ---------------------------------------------------------------------------

describe("QueryLayer.completeKeys", () => {
  it("queries both LogAttributes and ResourceAttributes", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await ql.completeKeys(["api"], TIME_RANGE, "http", ac.signal)

    expect(adapter.calls).toHaveLength(2)
    expect(adapter.calls[0]!.sql).toContain("mapKeys(LogAttributes)")
    expect(adapter.calls[1]!.sql).toContain("mapKeys(ResourceAttributes)")
  })

  it("deduplicates and sorts results", async () => {
    const adapter: QueryAdapter = {
      async query<T>(req: QueryRequest): Promise<QueryResult<T>> {
        if (req.sql.includes("LogAttributes")) {
          return {
            data: [{ key: "http.method" }, { key: "http.url" }] as T[],
          }
        }
        return {
          data: [{ key: "http.method" }, { key: "service.name" }] as T[],
        }
      },
    }
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    const keys = await ql.completeKeys(["api"], TIME_RANGE, "http", ac.signal)
    // http.method should appear only once
    expect(keys.filter((k) => k === "http.method")).toHaveLength(1)
    // Results should be sorted
    expect(keys).toEqual([...keys].sort())
  })
})

// ---------------------------------------------------------------------------
// SETTINGS max_execution_time
// ---------------------------------------------------------------------------

describe("QueryLayer timeout", () => {
  it("appends SETTINGS max_execution_time to queries", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter, { defaultTimeout: 15 })
    const ac = new AbortController()

    await ql.firstPageLoad(
      {
        filters: { kind: "and", children: [] },
        timeRange: TIME_RANGE,
        pageSize: 10,
      },
      ac.signal,
    )

    for (const call of adapter.calls) {
      expect(call.sql).toContain("SETTINGS max_execution_time = 15")
    }
  })
})

// ---------------------------------------------------------------------------
// AbortSignal propagation
// ---------------------------------------------------------------------------

describe("AbortSignal propagation", () => {
  it("passes signal to every adapter call", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await ql.firstPageLoad(
      {
        filters: { kind: "and", children: [] },
        timeRange: TIME_RANGE,
        pageSize: 10,
      },
      ac.signal,
    )

    for (const call of adapter.calls) {
      expect(call.signal).toBe(ac.signal)
    }
  })
})

// ---------------------------------------------------------------------------
// Zod input validation
// ---------------------------------------------------------------------------

describe("input validation", () => {
  it("rejects non-ISO time range strings", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.firstPageLoad(
        {
          filters: { kind: "and", children: [] },
          timeRange: { start: "2024-01-01 00:00:00", end: "2024-01-02 00:00:00" },
          pageSize: 50,
        },
        ac.signal,
      ),
    ).rejects.toThrow(ZodError)
  })

  it("accepts ISO 8601 strings with offset", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.firstPageLoad(
        {
          filters: { kind: "and", children: [] },
          timeRange: { start: "2024-01-01T00:00:00+05:30", end: "2024-01-02T00:00:00-04:00" },
          pageSize: 50,
        },
        ac.signal,
      ),
    ).resolves.toBeDefined()
  })

  it("accepts Date objects in time range", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.firstPageLoad(
        {
          filters: { kind: "and", children: [] },
          timeRange: { start: new Date(), end: new Date() },
          pageSize: 50,
        },
        ac.signal,
      ),
    ).resolves.toBeDefined()
  })

  it("rejects invalid pageSize", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.firstPageLoad(
        {
          filters: { kind: "and", children: [] },
          timeRange: TIME_RANGE,
          pageSize: -1,
        },
        ac.signal,
      ),
    ).rejects.toThrow(ZodError)
  })

  it("rejects invalid filter node kind", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.firstPageLoad(
        {
          filters: { kind: "bogus" } as any,
          timeRange: TIME_RANGE,
          pageSize: 50,
        },
        ac.signal,
      ),
    ).rejects.toThrow(ZodError)
  })

  it("rejects invalid cursor in paginateForward", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.paginateForward(
        { kind: "and", children: [] },
        TIME_RANGE,
        { ts: "not-a-number", refId: "12345", dir: "forward" },
        50,
        ac.signal,
      ),
    ).rejects.toThrow(ZodError)
  })

  it("rejects invalid log ref in resolveRef", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.resolveRef({ ts: "abc", refId: "12345" }, ac.signal),
    ).rejects.toThrow(ZodError)
  })

  it("rejects unknown top-level column in filter", async () => {
    const adapter = mockAdapter()
    const ql = new QueryLayer(adapter)
    const ac = new AbortController()

    await expect(
      ql.firstPageLoad(
        {
          filters: {
            kind: "compare",
            field: { source: "top", column: "FakeColumn" as any },
            op: "eq",
            value: "x",
          },
          timeRange: TIME_RANGE,
          pageSize: 50,
        },
        ac.signal,
      ),
    ).rejects.toThrow(ZodError)
  })
})
