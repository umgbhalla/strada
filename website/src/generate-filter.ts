// AI search filter generation for the TUI.
//
// Turns natural language into a ClickHouse boolean condition that gets AND-ed
// into existing WHERE clauses. The model returns only a condition expression
// (no WHERE, ORDER BY, LIMIT, etc).
//
// SQL injection is not a concern: all queries are read-only (Tinybird JWT or
// ClickHouse HTTP interface), and users can already run arbitrary SQL via the
// query endpoint. The worst case from a malformed condition is a syntax error.
//
// Extracted into its own file so the test can import it without pulling in the
// full api.ts dependency tree (which includes @strada.sh/sdk → protobufjs,
// incompatible with workerd test runtime).

import { z } from 'zod'
import { env } from 'cloudflare:workers'
import dedent from 'string-dedent'
import { generateText, tool } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import clickhouseSchema from '../../clickhouse.sql?raw'

export const AI_SEARCH_VIEWS = {
  issues: 'otel_errors',
  logs: 'otel_logs',
  traces: 'otel_traces',
} as const

export type AiSearchView = keyof typeof AI_SEARCH_VIEWS

const THINKING_DISABLED = {
  reasoning_effort: null,
  chat_template_kwargs: { enable_thinking: false },
}

export interface AiFilterResult {
  condition: string
  /** For grouped queries (traces), whether the condition uses aggregate aliases
   * and should go in HAVING instead of WHERE. Defaults to "where". */
  placement: 'where' | 'having'
}

// Extra context for the traces view: the query uses GROUP BY TraceId, so the
// model needs to know which columns are raw (WHERE) vs aggregate (HAVING).
const TRACES_AGGREGATE_CONTEXT = dedent`
  The traces query groups spans by TraceId. Some columns are raw span fields
  (use in WHERE), others are computed aggregates (use in HAVING):

  Raw span columns (WHERE): TraceId, SpanId, ParentSpanId, SpanName,
    SpanKind, ServiceName, Duration, StatusCode, Timestamp,
    SpanAttributes, ResourceAttributes

  Aggregate aliases (HAVING): StartTime, DurationNs, SpanCount,
    ErrorSpanCount, RootSpanName, RootServiceName, RootStatusCode

  Set placement to "having" when referencing aggregate aliases,
  "where" when referencing raw span columns.
`

export async function generateSearchFilter(opts: {
  view: AiSearchView
  searchText: string
  signal?: AbortSignal
}): Promise<AiFilterResult> {
  const workersai = createWorkersAI({ binding: env.AI })
  const tableName = AI_SEARCH_VIEWS[opts.view]
  const isTraces = opts.view === 'traces'

  const prompt = dedent`
    Generate a ClickHouse SQL boolean condition to filter rows from the \`${tableName}\` table
    based on the user's natural language description.
    You MUST call the sql_filter tool with the generated condition.

    ## ClickHouse schema

    \`\`\`sql
    ${clickhouseSchema}
    \`\`\`

    ## Table being queried

    ${tableName}

    ${isTraces ? TRACES_AGGREGATE_CONTEXT : ''}

    ## User's filter request

    ${opts.searchText}

    ## Rules

    - Return ONLY a boolean condition expression (e.g. ExceptionType = 'TypeError')
    - Do NOT include WHERE, ORDER BY, GROUP BY, LIMIT, FORMAT, semicolons, or comments
    - Column names are PascalCase: ExceptionType, ServiceName, Body, SpanName, etc.
    - Map columns use bracket syntax: SpanAttributes['key'], LogAttributes['key'], Tags['key']
    - Use mapContains(MapColumn, 'key') to check if a key exists in a Map column
    - NEVER reference ProjectId (it is filtered automatically by the system)
    - Use now() - INTERVAL for relative time filters, e.g. Timestamp >= now() - INTERVAL 1 HOUR
    - Prefer simple conditions. Use ILIKE for text search, e.g. Body ILIKE '%timeout%'
    - The user query may be written quickly with low effort; infer intent
  `

  const placementSchema = isTraces
    ? z.enum(['where', 'having']).describe(
        'Use "having" when the condition references aggregate aliases (StartTime, DurationNs, SpanCount, ErrorSpanCount, RootSpanName, etc). Use "where" for raw span columns.',
      )
    : z.literal('where')

  const result = await generateText({
    model: workersai('@cf/zai-org/glm-4.7-flash', THINKING_DISABLED),
    prompt,
    tools: {
      sql_filter: tool({
        description: 'Return the generated SQL boolean condition',
        inputSchema: z.object({
          condition: z.string().describe(
            'A ClickHouse boolean expression. No WHERE keyword, no ORDER BY, no semicolons.',
          ),
          placement: placementSchema,
        }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'sql_filter' },
    providerOptions: {
      'workers-ai': THINKING_DISABLED,
    },
    abortSignal: opts.signal,
  })

  const toolCall = result.toolCalls.find((c) => c.toolName === 'sql_filter')
  if (!toolCall || toolCall.dynamic) {
    return { condition: '', placement: 'where' }
  }
  // Strip WHERE/HAVING prefix if model included it despite instructions, and trailing semicolons
  const condition = (toolCall.input.condition || '')
    .replace(/^(WHERE|HAVING)\s+/i, '')
    .trim()
    .replace(/;+$/, '')
  const placement = toolCall.input.placement === 'having' ? 'having' : 'where'
  return { condition, placement }
}

export const generateFilterRequestSchema = z.object({
  searchText: z.string().min(1).max(500),
  view: z.enum(['issues', 'logs', 'traces']),
})

export const generateFilterResponseSchema = z.object({
  condition: z.string(),
  placement: z.enum(['where', 'having']),
})
