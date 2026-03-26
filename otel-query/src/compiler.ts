import { InvalidFilterError } from "./errors.ts"
import {
  TOP_LEVEL_COLUMNS,
  type CompareOp,
  type FieldRef,
  type FilterNode,
  type Scalar,
  type TimeRange,
} from "./types.ts"

const MAX_IN_LIST_SIZE = 1000

// ---------------------------------------------------------------------------
// Parameter collector
// ---------------------------------------------------------------------------

export class ParamCollector {
  private counter: number
  readonly params: Record<string, { type: string; value: unknown }> = {}

  constructor(startFrom = 0) {
    this.counter = startFrom
  }

  /** Register a parameter and return its `{name:Type}` placeholder. */
  add(type: string, value: unknown): string {
    const name = `p${this.counter++}`
    this.params[name] = { type, value }
    return `{${name}:${type}}`
  }

  get count(): number {
    return this.counter
  }
}

// ---------------------------------------------------------------------------
// Normalise — flatten nested AND/OR, collapse single-child groups
// ---------------------------------------------------------------------------

export function normalise(node: FilterNode): FilterNode {
  switch (node.kind) {
    case "and": {
      const flat: FilterNode[] = []
      for (const child of node.children) {
        const n = normalise(child)
        if (n.kind === "and") flat.push(...n.children)
        else flat.push(n)
      }
      return flat.length === 1 ? flat[0]! : { kind: "and", children: flat }
    }
    case "or": {
      const flat: FilterNode[] = []
      for (const child of node.children) {
        const n = normalise(child)
        if (n.kind === "or") flat.push(...n.children)
        else flat.push(n)
      }
      return flat.length === 1 ? flat[0]! : { kind: "or", children: flat }
    }
    case "not":
      return { kind: "not", child: normalise(node.child) }
    default:
      return node
  }
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function validateFieldRef(ref: FieldRef): void {
  if (
    ref.source === "top" &&
    !(TOP_LEVEL_COLUMNS as readonly string[]).includes(ref.column)
  ) {
    throw new InvalidFilterError(`Unknown column: ${ref.column}`)
  }
}

export function validate(node: FilterNode): void {
  switch (node.kind) {
    case "compare":
    case "exists":
    case "not_exists":
    case "contains":
      validateFieldRef(node.field)
      break
    case "in":
      validateFieldRef(node.field)
      if (node.values.length > MAX_IN_LIST_SIZE)
        throw new InvalidFilterError(
          `IN list has ${node.values.length} values, max is ${MAX_IN_LIST_SIZE}`,
        )
      break
    case "and":
    case "or":
      for (const c of node.children) validate(c)
      break
    case "not":
      validate(node.child)
      break
    case "fulltext":
      break
  }
}

// ---------------------------------------------------------------------------
// SQL emission helpers
// ---------------------------------------------------------------------------

function scalarType(value: Scalar): string {
  if (typeof value === "number")
    return Number.isInteger(value) ? "Int64" : "Float64"
  if (typeof value === "boolean") return "Bool"
  return "String"
}

function emitFieldRef(ref: FieldRef, p: ParamCollector): string {
  switch (ref.source) {
    case "top":
      return ref.column
    case "resource":
      return `ResourceAttributes[${p.add("String", ref.key)}]`
    case "log":
      return `LogAttributes[${p.add("String", ref.key)}]`
  }
}

function emitExists(ref: FieldRef, p: ParamCollector): string {
  if (ref.source === "top") return `${ref.column} IS NOT NULL`
  const mapCol =
    ref.source === "resource" ? "ResourceAttributes" : "LogAttributes"
  return `mapContains(${mapCol}, ${p.add("String", ref.key)})`
}

function compareSymbol(op: CompareOp): string {
  switch (op) {
    case "eq":
      return "="
    case "neq":
      return "!="
    case "gt":
      return ">"
    case "gte":
      return ">="
    case "lt":
      return "<"
    case "lte":
      return "<="
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_")
}

// ---------------------------------------------------------------------------
// Core emit — recursive pattern match on FilterNode
// ---------------------------------------------------------------------------

export function emitFilter(node: FilterNode, p: ParamCollector): string {
  switch (node.kind) {
    case "compare": {
      const field = emitFieldRef(node.field, p)
      return `${field} ${compareSymbol(node.op)} ${p.add(scalarType(node.value), node.value)}`
    }
    case "exists":
      return emitExists(node.field, p)
    case "not_exists":
      return `NOT (${emitExists(node.field, p)})`
    case "contains": {
      const field = emitFieldRef(node.field, p)
      const escaped = escapeLikePattern(node.value)
      return `${field} LIKE ${p.add("String", `%${escaped}%`)}`
    }
    case "in": {
      const field = emitFieldRef(node.field, p)
      const elemType =
        node.values.length > 0 ? scalarType(node.values[0]!) : "String"
      return `${field} IN ${p.add(`Array(${elemType})`, node.values)}`
    }
    case "and": {
      if (node.children.length === 0) return "1"
      if (node.children.length === 1) return emitFilter(node.children[0]!, p)
      return node.children.map((c) => `(${emitFilter(c, p)})`).join(" AND ")
    }
    case "or": {
      if (node.children.length === 0) return "0"
      if (node.children.length === 1) return emitFilter(node.children[0]!, p)
      return (
        "(" +
        node.children.map((c) => `(${emitFilter(c, p)})`).join(" OR ") +
        ")"
      )
    }
    case "not":
      return `NOT (${emitFilter(node.child, p)})`
    case "fulltext":
      return `hasToken(Body, ${p.add("String", node.query)})`
  }
}

// ---------------------------------------------------------------------------
// Compile a complete WHERE clause (mandatory time range + user filters)
// ---------------------------------------------------------------------------

export function formatTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().replace("T", " ").replace("Z", "")
  }
  // Normalise ISO 8601 strings ("2024-01-01T00:00:00Z") to ClickHouse format
  return value.replace("T", " ").replace("Z", "")
}

export interface CompiledFilter {
  whereClause: string
  params: Record<string, { type: string; value: unknown }>
  paramCount: number
}

export function compileFilter(
  filter: FilterNode | null,
  timeRange: TimeRange,
): CompiledFilter {
  const p = new ParamCollector()
  const conditions: string[] = []

  conditions.push(
    `Timestamp >= ${p.add("String", formatTimestamp(timeRange.start))}`,
  )
  conditions.push(
    `Timestamp <= ${p.add("String", formatTimestamp(timeRange.end))}`,
  )

  if (filter) {
    const normalised = normalise(filter)
    validate(normalised)
    conditions.push(emitFilter(normalised, p))
  }

  return {
    whereClause: "WHERE " + conditions.join("\n  AND "),
    params: p.params,
    paramCount: p.count,
  }
}

// ---------------------------------------------------------------------------
// Extract active attribute keys from a filter (for suggestion exclusion)
// ---------------------------------------------------------------------------

export function extractActiveKeys(node: FilterNode): string[] {
  const keys = new Set<string>()

  function walk(n: FilterNode): void {
    switch (n.kind) {
      case "compare":
      case "exists":
      case "not_exists":
      case "contains":
      case "in":
        if (n.field.source === "resource" || n.field.source === "log") {
          keys.add(n.field.key)
        }
        break
      case "and":
      case "or":
        for (const c of n.children) walk(c)
        break
      case "not":
        walk(n.child)
        break
      case "fulltext":
        break
    }
  }

  walk(node)
  return [...keys]
}
