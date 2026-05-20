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

export async function generateSearchFilter(opts: {
  view: AiSearchView
  searchText: string
  signal?: AbortSignal
}): Promise<string> {
  const workersai = createWorkersAI({ binding: env.AI })
  const tableName = AI_SEARCH_VIEWS[opts.view]

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

  const result = await generateText({
    model: workersai('@cf/zai-org/glm-4.7-flash', THINKING_DISABLED),
    prompt,
    tools: {
      sql_filter: tool({
        description: 'Return the generated SQL boolean condition',
        inputSchema: z.object({
          condition: z.string().describe(
            'A ClickHouse boolean expression to AND into an existing WHERE clause. No WHERE keyword, no ORDER BY, no semicolons.',
          ),
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
    return ''
  }
  // Strip WHERE prefix if model included it despite instructions, and trailing semicolons
  return (toolCall.input.condition || '').replace(/^WHERE\s+/i, '').trim().replace(/;+$/, '')
}

export const generateFilterRequestSchema = z.object({
  searchText: z.string().min(1).max(500),
  view: z.enum(['issues', 'logs', 'traces']),
})

export const generateFilterResponseSchema = z.object({
  condition: z.string(),
})
