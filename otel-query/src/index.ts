// Adapter
export type { QueryAdapter, QueryRequest, QueryResult } from "./adapter.ts"

// Types (input types inferred from zod schemas, output types defined directly)
export type {
  CompareOp,
  CompiledQuery,
  FieldRef,
  FilterMeta,
  FilterNode,
  FirstPageRequest,
  FirstPageResponse,
  LogEntry,
  LogRef,
  PageResult,
  PaginationCursor,
  QueryLayerOptions,
  ResolveRefResult,
  Scalar,
  SuggestedFilter,
  TimeRange,
  TopLevelColumn,
} from "./types.ts"
export { TOP_LEVEL_COLUMNS } from "./types.ts"

// Schemas (zod — source of truth for input types)
export {
  CompareOpSchema,
  CompleteKeysRequestSchema,
  CompleteValuesRequestSchema,
  FieldRefSchema,
  FilterNodeSchema,
  FirstPageRequestSchema,
  LogRefSchema,
  PaginateRequestSchema,
  PaginationCursorSchema,
  ScalarSchema,
  SuggestFiltersRequestSchema,
  TimeRangeSchema,
} from "./schemas.ts"

// Errors
export {
  InvalidFilterError,
  QueryTimeoutError,
  RefNotFoundError,
} from "./errors.ts"

// Compiler
export {
  compileFilter,
  emitFilter,
  extractActiveKeys,
  formatTimestamp,
  normalise,
  ParamCollector,
  validate,
} from "./compiler.ts"
export type { CompiledFilter } from "./compiler.ts"

// Ref IDs
export {
  decodeLogRef,
  deserializeCursor,
  encodeLogRef,
  LOG_SELECT_COLUMNS,
  REF_ID_EXPR,
  serializeCursor,
} from "./ref.ts"

// Query layer
export { QueryLayer } from "./query-layer.ts"
