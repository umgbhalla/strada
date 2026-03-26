import { describe, expect, it } from "vitest"
import {
  compileFilter,
  emitFilter,
  extractActiveKeys,
  normalise,
  ParamCollector,
  validate,
} from "./compiler.ts"
import { InvalidFilterError } from "./errors.ts"
import type { FilterNode } from "./types.ts"

// ---------------------------------------------------------------------------
// ParamCollector
// ---------------------------------------------------------------------------

describe("ParamCollector", () => {
  it("generates sequential parameter names", () => {
    const p = new ParamCollector()
    expect(p.add("String", "a")).toBe("{p0:String}")
    expect(p.add("Int64", 42)).toBe("{p1:Int64}")
    expect(p.params).toEqual({
      p0: { type: "String", value: "a" },
      p1: { type: "Int64", value: 42 },
    })
  })
})

// ---------------------------------------------------------------------------
// normalise
// ---------------------------------------------------------------------------

describe("normalise", () => {
  it("flattens nested ANDs", () => {
    const node: FilterNode = {
      kind: "and",
      children: [
        {
          kind: "and",
          children: [
            { kind: "fulltext", query: "a" },
            { kind: "fulltext", query: "b" },
          ],
        },
        { kind: "fulltext", query: "c" },
      ],
    }
    const result = normalise(node)
    expect(result.kind).toBe("and")
    if (result.kind === "and") {
      expect(result.children).toHaveLength(3)
    }
  })

  it("collapses single-child AND", () => {
    const node: FilterNode = {
      kind: "and",
      children: [{ kind: "fulltext", query: "a" }],
    }
    expect(normalise(node)).toEqual({ kind: "fulltext", query: "a" })
  })

  it("flattens nested ORs", () => {
    const node: FilterNode = {
      kind: "or",
      children: [
        {
          kind: "or",
          children: [
            { kind: "fulltext", query: "a" },
            { kind: "fulltext", query: "b" },
          ],
        },
        { kind: "fulltext", query: "c" },
      ],
    }
    const result = normalise(node)
    expect(result.kind).toBe("or")
    if (result.kind === "or") {
      expect(result.children).toHaveLength(3)
    }
  })
})

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe("validate", () => {
  it("rejects unknown top-level columns", () => {
    const node: FilterNode = {
      kind: "compare",
      field: { source: "top", column: "FakeColumn" as any },
      op: "eq",
      value: "x",
    }
    expect(() => validate(node)).toThrow(InvalidFilterError)
  })

  it("rejects IN lists that are too large", () => {
    const node: FilterNode = {
      kind: "in",
      field: { source: "top", column: "SeverityText" },
      values: Array.from({ length: 1001 }, (_, i) => `v${i}`),
    }
    expect(() => validate(node)).toThrow(/max is 1000/)
  })

  it("accepts valid filters", () => {
    const node: FilterNode = {
      kind: "compare",
      field: { source: "top", column: "SeverityText" },
      op: "eq",
      value: "ERROR",
    }
    expect(() => validate(node)).not.toThrow()
  })

  it("accepts resource/log attribute fields without column check", () => {
    const node: FilterNode = {
      kind: "exists",
      field: { source: "log", key: "http.method" },
    }
    expect(() => validate(node)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// emitFilter
// ---------------------------------------------------------------------------

describe("emitFilter", () => {
  it("emits compare on top-level column", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "compare",
        field: { source: "top", column: "SeverityText" },
        op: "eq",
        value: "ERROR",
      },
      p,
    )
    expect(sql).toBe("SeverityText = {p0:String}")
    expect(p.params.p0).toEqual({ type: "String", value: "ERROR" })
  })

  it("emits compare on resource attribute", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "compare",
        field: { source: "resource", key: "k8s.pod.name" },
        op: "eq",
        value: "my-pod",
      },
      p,
    )
    expect(sql).toBe("ResourceAttributes[{p0:String}] = {p1:String}")
    expect(p.params.p0?.value).toBe("k8s.pod.name")
    expect(p.params.p1?.value).toBe("my-pod")
  })

  it("emits compare on log attribute", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "compare",
        field: { source: "log", key: "http.method" },
        op: "neq",
        value: "GET",
      },
      p,
    )
    expect(sql).toBe("LogAttributes[{p0:String}] != {p1:String}")
  })

  it("emits exists for top-level", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      { kind: "exists", field: { source: "top", column: "TraceId" } },
      p,
    )
    expect(sql).toBe("TraceId IS NOT NULL")
  })

  it("emits exists for map attribute via mapContains", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      { kind: "exists", field: { source: "log", key: "http.method" } },
      p,
    )
    expect(sql).toBe("mapContains(LogAttributes, {p0:String})")
  })

  it("emits not_exists", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "not_exists",
        field: { source: "resource", key: "k8s.ns" },
      },
      p,
    )
    expect(sql).toBe("NOT (mapContains(ResourceAttributes, {p0:String}))")
  })

  it("emits contains with LIKE and escaped wildcards", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "contains",
        field: { source: "top", column: "Body" },
        value: "100%_done",
      },
      p,
    )
    expect(sql).toBe("Body LIKE {p0:String}")
    expect(p.params.p0?.value).toBe("%100\\%\\_done%")
  })

  it("emits IN with array param", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "in",
        field: { source: "top", column: "SeverityText" },
        values: ["ERROR", "FATAL"],
      },
      p,
    )
    expect(sql).toBe("SeverityText IN {p0:Array(String)}")
    expect(p.params.p0?.value).toEqual(["ERROR", "FATAL"])
  })

  it("emits AND with multiple children", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "and",
        children: [
          {
            kind: "compare",
            field: { source: "top", column: "SeverityText" },
            op: "eq",
            value: "ERROR",
          },
          { kind: "fulltext", query: "timeout" },
        ],
      },
      p,
    )
    expect(sql).toBe(
      "(SeverityText = {p0:String}) AND (hasToken(Body, {p1:String}))",
    )
  })

  it("emits OR with parentheses", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "or",
        children: [
          { kind: "fulltext", query: "timeout" },
          { kind: "fulltext", query: "error" },
        ],
      },
      p,
    )
    expect(sql).toBe(
      "((hasToken(Body, {p0:String})) OR (hasToken(Body, {p1:String})))",
    )
  })

  it("emits NOT", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "not",
        child: {
          kind: "compare",
          field: { source: "top", column: "SeverityText" },
          op: "eq",
          value: "DEBUG",
        },
      },
      p,
    )
    expect(sql).toBe("NOT (SeverityText = {p0:String})")
  })

  it("emits fulltext via hasToken", () => {
    const p = new ParamCollector()
    const sql = emitFilter({ kind: "fulltext", query: "needle" }, p)
    expect(sql).toBe("hasToken(Body, {p0:String})")
  })

  it("handles numeric and boolean scalars", () => {
    const p = new ParamCollector()
    const sql = emitFilter(
      {
        kind: "compare",
        field: { source: "top", column: "SeverityNumber" },
        op: "gte",
        value: 17,
      },
      p,
    )
    expect(sql).toBe("SeverityNumber >= {p0:Int64}")
    expect(p.params.p0?.value).toBe(17)
  })
})

// ---------------------------------------------------------------------------
// compileFilter
// ---------------------------------------------------------------------------

describe("compileFilter", () => {
  it("always includes time range", () => {
    const result = compileFilter(null, {
      start: "2024-01-01T00:00:00Z",
      end: "2024-01-02T00:00:00Z",
    })
    expect(result.whereClause).toContain("Timestamp >=")
    expect(result.whereClause).toContain("Timestamp <=")
    expect(Object.keys(result.params)).toHaveLength(2)
  })

  it("appends user filter to time range", () => {
    const result = compileFilter(
      {
        kind: "compare",
        field: { source: "top", column: "SeverityText" },
        op: "eq",
        value: "ERROR",
      },
      { start: "2024-01-01T00:00:00Z", end: "2024-01-02T00:00:00Z" },
    )
    expect(result.whereClause).toContain("SeverityText = {p2:String}")
    expect(result.params.p2?.value).toBe("ERROR")
    expect(result.paramCount).toBe(3)
  })

  it("formats Date objects for time range", () => {
    const result = compileFilter(null, {
      start: new Date("2024-01-15T10:30:00.000Z"),
      end: new Date("2024-01-16T10:30:00.000Z"),
    })
    expect(result.params.p0?.value).toBe("2024-01-15 10:30:00.000")
    expect(result.params.p1?.value).toBe("2024-01-16 10:30:00.000")
  })

  it("normalises ISO 8601 strings to ClickHouse format", () => {
    const result = compileFilter(null, {
      start: "2024-01-15T10:30:00Z",
      end: "2024-01-16T10:30:00.123Z",
    })
    expect(result.params.p0?.value).toBe("2024-01-15 10:30:00")
    expect(result.params.p1?.value).toBe("2024-01-16 10:30:00.123")
  })
})

// ---------------------------------------------------------------------------
// extractActiveKeys
// ---------------------------------------------------------------------------

describe("extractActiveKeys", () => {
  it("extracts keys from compare filters", () => {
    const node: FilterNode = {
      kind: "and",
      children: [
        {
          kind: "compare",
          field: { source: "log", key: "http.method" },
          op: "eq",
          value: "GET",
        },
        {
          kind: "compare",
          field: { source: "resource", key: "k8s.pod.name" },
          op: "eq",
          value: "my-pod",
        },
        {
          kind: "compare",
          field: { source: "top", column: "SeverityText" },
          op: "eq",
          value: "ERROR",
        },
      ],
    }
    const keys = extractActiveKeys(node)
    expect(keys).toContain("http.method")
    expect(keys).toContain("k8s.pod.name")
    expect(keys).toHaveLength(2) // top-level columns excluded
  })

  it("deduplicates keys", () => {
    const node: FilterNode = {
      kind: "and",
      children: [
        {
          kind: "compare",
          field: { source: "log", key: "http.method" },
          op: "eq",
          value: "GET",
        },
        {
          kind: "compare",
          field: { source: "log", key: "http.method" },
          op: "neq",
          value: "OPTIONS",
        },
      ],
    }
    expect(extractActiveKeys(node)).toEqual(["http.method"])
  })
})
