import { z } from "zod"

// ---------------------------------------------------------------------------
// Column whitelist
// ---------------------------------------------------------------------------

export const TOP_LEVEL_COLUMNS = [
  "Timestamp",
  "TraceId",
  "SpanId",
  "SeverityNumber",
  "SeverityText",
  "Body",
  "ServiceName",
  "ResourceSchemaUrl",
  "ScopeName",
] as const

export type TopLevelColumn = (typeof TOP_LEVEL_COLUMNS)[number]

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const isoDatetime = z.string().datetime({ offset: true })
const dateOrIso = z.union([z.date(), isoDatetime])
const numericString = z.string().regex(
  /^\d+$/,
  "Must be a decimal numeric string",
)

export const ScalarSchema = z.union([z.string(), z.number(), z.boolean()])
export type Scalar = z.infer<typeof ScalarSchema>

export const CompareOpSchema = z.enum(["eq", "neq", "gt", "gte", "lt", "lte"])
export type CompareOp = z.infer<typeof CompareOpSchema>

// ---------------------------------------------------------------------------
// FieldRef
// ---------------------------------------------------------------------------

export const FieldRefSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("top"),
    column: z.enum(TOP_LEVEL_COLUMNS),
  }),
  z.object({ source: z.literal("resource"), key: z.string().min(1) }),
  z.object({ source: z.literal("log"), key: z.string().min(1) }),
])
export type FieldRef = z.infer<typeof FieldRefSchema>

// ---------------------------------------------------------------------------
// FilterNode (recursive — type must be defined manually for z.lazy)
// ---------------------------------------------------------------------------

export type FilterNode =
  | { kind: "compare"; field: FieldRef; op: CompareOp; value: Scalar }
  | { kind: "exists"; field: FieldRef }
  | { kind: "not_exists"; field: FieldRef }
  | { kind: "contains"; field: FieldRef; value: string }
  | { kind: "in"; field: FieldRef; values: Scalar[] }
  | { kind: "and"; children: FilterNode[] }
  | { kind: "or"; children: FilterNode[] }
  | { kind: "not"; child: FilterNode }
  | { kind: "fulltext"; query: string }

export const FilterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("compare"),
      field: FieldRefSchema,
      op: CompareOpSchema,
      value: ScalarSchema,
    }),
    z.object({ kind: z.literal("exists"), field: FieldRefSchema }),
    z.object({ kind: z.literal("not_exists"), field: FieldRefSchema }),
    z.object({
      kind: z.literal("contains"),
      field: FieldRefSchema,
      value: z.string(),
    }),
    z.object({
      kind: z.literal("in"),
      field: FieldRefSchema,
      values: z.array(ScalarSchema).min(1),
    }),
    z.object({
      kind: z.literal("and"),
      children: z.array(FilterNodeSchema),
    }),
    z.object({
      kind: z.literal("or"),
      children: z.array(FilterNodeSchema),
    }),
    z.object({ kind: z.literal("not"), child: FilterNodeSchema }),
    z.object({ kind: z.literal("fulltext"), query: z.string().min(1) }),
  ]),
)

// ---------------------------------------------------------------------------
// Time range
// ---------------------------------------------------------------------------

export const TimeRangeSchema = z.object({
  start: dateOrIso,
  end: dateOrIso,
})
export type TimeRange = z.infer<typeof TimeRangeSchema>

// ---------------------------------------------------------------------------
// Cursor & Ref
// ---------------------------------------------------------------------------

export const PaginationCursorSchema = z.object({
  ts: numericString,
  refId: numericString,
  dir: z.enum(["forward", "backward"]),
})
export type PaginationCursor = z.infer<typeof PaginationCursorSchema>

export const LogRefSchema = z.object({
  ts: numericString,
  refId: numericString,
})
export type LogRef = z.infer<typeof LogRefSchema>

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const FirstPageRequestSchema = z.object({
  filters: FilterNodeSchema,
  timeRange: TimeRangeSchema,
  services: z.array(z.string()).optional(),
  focusRef: LogRefSchema.optional(),
  pageSize: z.number().int().positive(),
})
export type FirstPageRequest = z.infer<typeof FirstPageRequestSchema>

export const PaginateRequestSchema = z.object({
  filters: FilterNodeSchema,
  timeRange: TimeRangeSchema,
  cursor: PaginationCursorSchema,
  pageSize: z.number().int().positive(),
})

export const CompleteKeysRequestSchema = z.object({
  services: z.array(z.string()),
  timeRange: TimeRangeSchema,
  prefix: z.string(),
})

export const CompleteValuesRequestSchema = z.object({
  field: FieldRefSchema,
  filters: FilterNodeSchema,
  timeRange: TimeRangeSchema,
  prefix: z.string(),
})

export const SuggestFiltersRequestSchema = z.object({
  filters: FilterNodeSchema,
  timeRange: TimeRangeSchema,
})
