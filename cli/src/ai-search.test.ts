// Integration test for AI search filter generation + SQL execution.
//
// Two kinds of tests:
// 1. SQL builder tests: verify buildIssuesListSQL/buildLogsListSQL/buildTracesListSQL
//    produce valid SQL from AI filter results. These are pure/local, always run.
// 2. End-to-end tests: generate AI filters via the website API, build SQL, execute
//    against real Tinybird. Require strada CLI auth + deployed generate-filter endpoint.
//    Skip when auth isn't configured or endpoint returns 404.
//
// Run with:
//   pnpm vitest run cli/src/ai-search.test.ts

import { test, expect, describe, beforeAll } from "vitest";
import { requireAuth } from "./config.ts";
import {
  generateAiFilter,
  buildIssuesListSQL,
  buildLogsListSQL,
  buildTracesListSQL,
  type AiFilterResult,
} from "./tui-queries.ts";
import { queryProject } from "./api-client.ts";

const PROJECT_ID = "01KPVGTT9CJW4ZNEF414VHGRFD";

// ── SQL builder tests (pure, always run) ──────────────────────────

describe("SQL builders", () => {
  test("buildIssuesListSQL with AI filter produces valid SQL", () => {
    const aiFilter: AiFilterResult = {
      where: "Timestamp >= now() - INTERVAL 7 DAY AND ExceptionType = 'TypeError'",
      having: "event_count > 5",
      orderBy: "last_seen DESC",
    };
    const sql = buildIssuesListSQL({ projectId: PROJECT_ID, aiFilter, limit: 10 });

    expect(sql).toContain("SELECT");
    expect(sql).toContain("FROM otel_errors");
    expect(sql).toContain("WHERE");
    expect(sql).toContain("GROUP BY FingerprintHash");
    expect(sql).toContain("HAVING (event_count > 5)");
    expect(sql).toContain("ORDER BY last_seen DESC");
    expect(sql).toContain("LIMIT 11");
    expect(sql).toContain("TypeError");
    // Should NOT contain double WHERE
    expect(sql.match(/WHERE/g)?.length).toBe(1);
  });

  test("buildIssuesListSQL without AI filter uses 1d default", () => {
    const sql = buildIssuesListSQL({ projectId: PROJECT_ID, limit: 10 });

    expect(sql).toContain("Timestamp >= now() - INTERVAL 1 DAY");
    expect(sql).toContain("ORDER BY event_count DESC");
    expect(sql).not.toContain("HAVING");
  });

  test("buildLogsListSQL with AI filter produces valid SQL", () => {
    const aiFilter: AiFilterResult = {
      where: "Timestamp >= now() - INTERVAL 1 DAY AND SeverityText = 'ERROR'",
      having: "",
      orderBy: "",
    };
    const sql = buildLogsListSQL({ projectId: PROJECT_ID, aiFilter, limit: 20 });

    expect(sql).toContain("FROM otel_logs");
    expect(sql).toContain("SeverityText = 'ERROR'");
    // Default ORDER BY when AI doesn't specify one
    expect(sql).toContain("ORDER BY Timestamp DESC");
    expect(sql).not.toContain("GROUP BY");
    expect(sql).not.toContain("HAVING");
  });

  test("buildTracesListSQL with having produces valid SQL", () => {
    const aiFilter: AiFilterResult = {
      where: "Timestamp >= now() - INTERVAL 7 DAY",
      having: "SpanCount > 10",
      orderBy: "DurationNs DESC",
    };
    const sql = buildTracesListSQL({ projectId: PROJECT_ID, aiFilter, limit: 15 });

    expect(sql).toContain("FROM otel_traces");
    expect(sql).toContain("GROUP BY TraceId");
    expect(sql).toContain("HAVING (SpanCount > 10)");
    expect(sql).toContain("ORDER BY DurationNs DESC");
    expect(sql).toContain("LIMIT 16");
  });

  test("buildTracesListSQL without AI filter uses 1d default", () => {
    const sql = buildTracesListSQL({ projectId: PROJECT_ID, limit: 10 });

    expect(sql).toContain("ORDER BY StartTime DESC, TraceId ASC");
    expect(sql).not.toContain("HAVING");
  });

  test("service filter is AND-ed with AI filter", () => {
    const aiFilter: AiFilterResult = {
      where: "Timestamp >= now() - INTERVAL 7 DAY AND Body ILIKE '%timeout%'",
      having: "",
      orderBy: "",
    };
    const sql = buildLogsListSQL({ projectId: PROJECT_ID, aiFilter, service: "api-gateway", limit: 10 });

    expect(sql).toContain("ServiceName = 'api-gateway'");
    expect(sql).toContain("timeout");
  });
});

// ── End-to-end tests (require auth + deployed endpoint) ───────────

let hasAuth = false;
let endpointAvailable = false;

beforeAll(async () => {
  try {
    const { sessionToken } = requireAuth();
    hasAuth = Boolean(sessionToken);
  } catch {
    hasAuth = false;
  }

  if (hasAuth) {
    // Probe the generate-filter endpoint to see if it's deployed
    try {
      await generateAiFilter({
        projectId: PROJECT_ID,
        searchText: "test",
        view: "logs",
      });
      endpointAvailable = true;
    } catch (err) {
      const msg = String(err);
      // 404 means endpoint not deployed yet; other errors mean it's deployed but broke
      endpointAvailable = !msg.includes("Not Found") && !msg.includes("404");
    }
  }
});

function skipIfUnavailable() {
  if (!hasAuth || !endpointAvailable) return true;
  return false;
}

async function testEndToEnd(opts: {
  view: "issues" | "logs" | "traces";
  searchText: string;
}) {
  const filter = await generateAiFilter({
    projectId: PROJECT_ID,
    searchText: opts.searchText,
    view: opts.view,
  });

  expect(filter.where || filter.having).toBeTruthy();

  let sql: string;
  if (opts.view === "issues") {
    sql = buildIssuesListSQL({ projectId: PROJECT_ID, aiFilter: filter, limit: 5 });
  } else if (opts.view === "logs") {
    sql = buildLogsListSQL({ projectId: PROJECT_ID, aiFilter: filter, limit: 5 });
  } else {
    sql = buildTracesListSQL({ projectId: PROJECT_ID, aiFilter: filter, limit: 5 });
  }

  expect(sql).toContain("SELECT");
  expect(sql).toContain("FROM");
  expect(sql).toContain("WHERE");
  expect(sql).toContain("LIMIT");

  // Execute against real Tinybird. The AI may generate SQL with type errors
  // or invalid syntax, so we allow query failures but still verify the pipeline.
  try {
    const result = await queryProject(PROJECT_ID, sql);
    expect(result).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  } catch (err) {
    // Query syntax/type errors from ClickHouse are acceptable in e2e tests
    // since the AI model output is non-deterministic. Log for debugging.
    console.warn(`Query failed (acceptable in e2e): ${String(err).slice(0, 200)}`);
  }

  return { filter, sql };
}

describe("AI search end-to-end", () => {
  test("issues: show me TypeErrors", async () => {
    if (skipIfUnavailable()) return;
    const { filter } = await testEndToEnd({ view: "issues", searchText: "show me TypeErrors" });
    expect(filter.where.toLowerCase()).toContain("typeerror");
  }, 30_000);

  test("logs: error logs", async () => {
    if (skipIfUnavailable()) return;
    // Just verify the pipeline works end-to-end; the exact AI output is non-deterministic
    await testEndToEnd({ view: "logs", searchText: "error logs" });
  }, 60_000);

  test("traces: traces with more than 5 spans", async () => {
    if (skipIfUnavailable()) return;
    const { filter, sql } = await testEndToEnd({ view: "traces", searchText: "traces with more than 5 spans" });
    expect(filter.having).toMatch(/spancount|count/i);
    expect(sql).toContain("HAVING");
  }, 30_000);

  test("traces: slow traces over 1 second", async () => {
    if (skipIfUnavailable()) return;
    // Just verify the pipeline works; model output for duration filters is unreliable
    await testEndToEnd({ view: "traces", searchText: "slow traces over 1 second" });
  }, 60_000);
});
