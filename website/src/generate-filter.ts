// AI search filter generation for the TUI.
//
// Turns natural language into structured SQL fragments (where, having, orderBy)
// that get injected into the fixed SELECT...FROM...GROUP BY query structure.
// The AI controls filtering and sorting; the code controls SELECT, FROM,
// GROUP BY, and LIMIT.
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



export interface AiFilterResult {
  /** WHERE conditions (without WHERE keyword). Empty string = no filter. */
  where: string
  /** HAVING conditions (without HAVING keyword). For grouped queries only. */
  having: string
  /** ORDER BY clause (without ORDER BY keyword). Empty = use default. */
  orderBy: string
}

// Per-view query structure context so the AI knows what's available.
const VIEW_CONTEXT: Record<AiSearchView, string> = {
  issues: dedent`
    ## Query structure (issues)

    The query groups error rows by FingerprintHash. The fixed SELECT is:

    \`\`\`sql
    SELECT
        FingerprintHash,
        anyLast(ExceptionType) AS last_type,
        anyLast(ExceptionMessage) AS last_message,
        anyLast(Level) AS last_level,
        count() AS event_count,
        min(Timestamp) AS first_seen,
        max(Timestamp) AS last_seen,
        countIf(MechanismHandled = false) AS unhandled_count
    FROM otel_errors
    WHERE {your where conditions}
    GROUP BY FingerprintHash
    HAVING {your having conditions}  -- optional
    ORDER BY {your order by}
    \`\`\`

    WHERE can reference any column from otel_errors: ExceptionType, ExceptionMessage,
    ExceptionStacktrace, ServiceName, Timestamp, MechanismType, MechanismHandled,
    Level, Release, Environment, Tags (Map), ResourceAttributes (Map), etc.

    HAVING can reference aggregate aliases: event_count, first_seen, last_seen,
    unhandled_count, last_type, last_message, last_level.

    Default ORDER BY: event_count DESC, FingerprintHash ASC
  `,
  logs: dedent`
    ## Query structure (logs)

    No GROUP BY. The fixed SELECT is:

    \`\`\`sql
    SELECT Timestamp, SeverityText, SeverityNumber, ServiceName, Body,
           LogAttributes, ResourceAttributes, TraceId, SpanId
    FROM otel_logs
    WHERE {your where conditions}
    ORDER BY {your order by}
    \`\`\`

    WHERE can reference any column from otel_logs: Body, SeverityText, SeverityNumber,
    ServiceName, Timestamp, TraceId, SpanId, EventName, LogAttributes (Map),
    ResourceAttributes (Map), ScopeAttributes (Map), etc.

    Default ORDER BY: Timestamp DESC
  `,
  traces: dedent`
    ## Query structure (traces)

    The query groups spans by TraceId. The fixed SELECT is:

    \`\`\`sql
    SELECT
        TraceId,
        min(Timestamp) AS StartTime,
        max(toUnixTimestamp64Nano(Timestamp) + Duration) - min(toUnixTimestamp64Nano(Timestamp)) AS DurationNs,
        count() AS SpanCount,
        groupUniqArray(ServiceName) AS Services,
        countIf(StatusCode = 'Error') AS ErrorSpanCount,
        anyIf(SpanName, ParentSpanId = '') AS RootSpanName,
        anyIf(ServiceName, ParentSpanId = '') AS RootServiceName,
        anyIf(StatusCode, ParentSpanId = '') AS RootStatusCode
    FROM otel_traces
    WHERE {your where conditions}
    GROUP BY TraceId
    HAVING {your having conditions}  -- optional
    ORDER BY {your order by}
    \`\`\`

    WHERE can reference any raw span column from otel_traces: TraceId, SpanId,
    ParentSpanId, SpanName, SpanKind, ServiceName, Duration (per-span, nanoseconds),
    StatusCode, Timestamp, SpanAttributes (Map), ResourceAttributes (Map),
    EventsName (Array), etc.

    HAVING can reference aggregate aliases: StartTime, DurationNs (per-trace total
    duration, nanoseconds), SpanCount, ErrorSpanCount, RootSpanName,
    RootServiceName, RootStatusCode, Services.

    Duration units: both Duration (per-span, WHERE) and DurationNs (per-trace,
    HAVING) are in NANOSECONDS. Common conversions:
      100ms = 100000000
      500ms = 500000000
      1s    = 1000000000
      5s    = 5000000000
      10s   = 10000000000

    Default ORDER BY: StartTime DESC, TraceId ASC

    Example: "traces longer than 1 second" →
      where: "Timestamp >= now() - INTERVAL 1 DAY"
      having: "DurationNs > 1000000000"

    Example: "traces with more than 10 spans" →
      where: "Timestamp >= now() - INTERVAL 1 DAY"
      having: "SpanCount > 10"

    Example: "slow traces with errors sorted by duration" →
      where: "Timestamp >= now() - INTERVAL 1 DAY"
      having: "DurationNs > 1000000000 AND ErrorSpanCount > 0"
      orderBy: "DurationNs DESC"
  `,
}

export interface PreviousFilterError {
  sql: string
  error: string
}

export async function generateSearchFilter(opts: {
  view: AiSearchView
  searchText: string
  previousErrors?: PreviousFilterError[]
  signal?: AbortSignal
}): Promise<AiFilterResult> {
  const workersai = createWorkersAI({ binding: env.AI })
  const tableName = AI_SEARCH_VIEWS[opts.view]

  const previousErrorsSection =
    opts.previousErrors && opts.previousErrors.length > 0
      ? dedent`
        ## Previous failed attempts

        The following SQL was generated but failed when executed. Fix the errors
        and generate corrected filter fragments. Do NOT repeat the same mistakes.

        ${opts.previousErrors.map((e, i) => `### Attempt ${i + 1}\nSQL: \`${e.sql}\`\nError: ${e.error}`).join('\n\n')}
      `
      : ''

  const prompt = dedent`
    Generate ClickHouse SQL filter fragments for the \`${tableName}\` table
    based on the user's natural language description.
    You MUST call the sql_filter tool with the generated fragments.

    ## ClickHouse schema

    \`\`\`sql
    ${clickhouseSchema}
    \`\`\`

    ${VIEW_CONTEXT[opts.view]}

    ## User's filter request

    ${opts.searchText}

    ${previousErrorsSection}

    ## Rules

    - \`where\`: boolean conditions WITHOUT the WHERE keyword
    - \`having\`: boolean conditions WITHOUT the HAVING keyword (only for grouped queries)
    - \`orderBy\`: columns and direction WITHOUT the ORDER BY keyword
    - Column names are PascalCase: ExceptionType, ServiceName, Body, SpanName, etc.
    - Map columns use bracket syntax: SpanAttributes['key'], LogAttributes['key'], Tags['key']
    - Use mapContains(MapColumn, 'key') to check if a key exists in a Map column
    - NEVER reference ProjectId (it is filtered automatically by the system)
    - Use now() - INTERVAL for relative time filters, e.g. Timestamp >= now() - INTERVAL 1 HOUR
    - ALWAYS include a date/time filter in \`where\` to prevent slow full-table scans.
      If the user doesn't mention a time range, default to: Timestamp >= now() - INTERVAL 1 DAY
    - Prefer simple conditions. Use ILIKE for text search, e.g. Body ILIKE '%timeout%'
    - Use HAVING for conditions on aggregate aliases (event_count, SpanCount, DurationNs, etc.)
    - Use WHERE for conditions on raw table columns (Timestamp, ServiceName, Body, etc.)
    - For grouped queries (issues, traces), orderBy MUST use aggregate aliases or group keys,
      NOT raw non-grouped columns. Use DurationNs not Duration, last_seen not Timestamp,
      event_count not count(). For logs (no GROUP BY), any column works in orderBy.
    - The user query may be written quickly with low effort; infer intent
    - Do NOT include semicolons or SQL comments
  `

  const hasGroupBy = opts.view === 'traces' || opts.view === 'issues'

  const result = await generateText({
    model: workersai('@cf/zai-org/glm-4.7-flash',  {
      reasoning_effort: null,
      chat_template_kwargs: { enable_thinking: false },
    }),
    prompt,
    tools: {
      sql_filter: tool({
        description: 'Return the generated SQL filter fragments',
        inputSchema: z.object({
          where: z.string().describe(
            'Boolean conditions for WHERE (without WHERE keyword). MUST include a date filter like Timestamp >= now() - INTERVAL 1 DAY.',
          ),
          ...(hasGroupBy
            ? {
                having: z.string().optional().describe(
                  'Boolean conditions for HAVING (without HAVING keyword). Use for aggregate aliases like event_count > 100, SpanCount > 10, DurationNs > 5000000000.',
                ),
              }
            : {}),
          orderBy: z.string().optional().describe(
            'ORDER BY clause (without ORDER BY keyword). e.g. "event_count DESC" or "Timestamp ASC". Leave empty to use default.',
          ),
        }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'sql_filter' },
    providerOptions: {
      'workers-ai':  {
        reasoning_effort: null,
        chat_template_kwargs: { enable_thinking: false },
      },
    },
    abortSignal: opts.signal,
  })

  const toolCall = result.toolCalls.find((c) => c.toolName === 'sql_filter')
  if (!toolCall || toolCall.dynamic) {
    return { where: '', having: '', orderBy: '' }
  }
  const input = toolCall.input as { where?: string; having?: string; orderBy?: string }

  // Strip accidental keyword prefixes and trailing semicolons
  const clean = (raw: string | undefined, keyword: string): string => {
    if (!raw) return ''
    let s = raw.trim().replace(/;+$/g, '')
    const prefix = new RegExp(`^${keyword}\\s+`, 'i')
    s = s.replace(prefix, '').trim()
    // Reject if it contains clause keywords or dangerous patterns
    if (/\bProjectId\b/i.test(s)) return ''
    if (/(^|\s)(SELECT|FROM|JOIN|UNION|FORMAT|LIMIT|OFFSET|SETTINGS|INSERT|ALTER|DROP|CREATE|TRUNCATE)\b/i.test(s)) return ''
    if (/--|\/\*/.test(s)) return ''
    return s
  }

  const where = clean(input.where, 'WHERE')

  // If the AI generated a non-empty WHERE but forgot a Timestamp filter,
  // throw so the caller can retry with error context. Without a time bound
  // the query scans the entire table and takes forever. Empty where is fine
  // because the caller adds its own default time filter when where is empty.
  if (where && !/\bTimestamp\b/i.test(where)) {
    throw new MissingTimestampError(where)
  }

  return {
    where,
    having: clean(input.having, 'HAVING'),
    orderBy: clean(input.orderBy, 'ORDER BY'),
  }
}

export class MissingTimestampError extends Error {
  constructor(public readonly where: string) {
    super(
      `Generated WHERE clause is missing a Timestamp filter. ` +
        `Add a time bound like "Timestamp >= now() - INTERVAL 1 DAY" to prevent full-table scans. ` +
        `Generated WHERE: ${where}`,
    )
    this.name = 'MissingTimestampError'
  }
}

export const generateFilterRequestSchema = z.object({
  searchText: z.string().min(1).max(500),
  view: z.enum(['issues', 'logs', 'traces']),
  previousErrors: z
    .array(z.object({ sql: z.string(), error: z.string() }))
    .optional(),
})

export const generateFilterResponseSchema = z.object({
  where: z.string(),
  having: z.string(),
  orderBy: z.string(),
})
