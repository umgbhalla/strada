// Node-side verification tests for browser analytics data.
// Run AFTER browser.test.ts has completed and data has propagated
// to Tinybird/ClickHouse (~15s for MV processing).
//
// These tests query the analytics tables via the Strada website API
// to verify that browser SDK telemetry landed correctly in:
// - otel_analytics_pages (pageview MVs)
// - otel_analytics_sessions (session MVs)
// - otel_logs (custom events via track())
// - otel_errors (captured browser exceptions)
//
// Run with:
//   STRADA_PROJECT_ID=<id> STRADA_ENDPOINT=<url> \
//   STRADA_TOKEN=<auth-token> STRADA_API_URL=<website-url> \
//   pnpm test:browser-verify
//
// Requires STRADA_TOKEN (auth session token from `strada login`)
// and STRADA_API_URL (website base URL, e.g. https://strada.sh).

import { describe, expect, test } from "vitest";

const projectId = process.env.STRADA_PROJECT_ID;
const token = process.env.STRADA_TOKEN;
const apiUrl = process.env.STRADA_API_URL || "https://strada.sh";

async function queryProject(sql: string): Promise<any> {
  const res = await fetch(`${apiUrl}/api/projects/${projectId}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Query failed (${res.status}): ${text}`);
  }
  return res.json();
}

describe.skipIf(!projectId || !token)("browser analytics verification", () => {
  test("otel_analytics_pages has pageview data from browser-test service", async () => {
    const result = await queryProject(`
      SELECT
        Pathname,
        countMerge(Hits) AS pageviews,
        uniqMerge(Visits) AS visitors
      FROM otel_analytics_pages
      WHERE ServiceName = 'browser-test'
        AND Date >= today() - INTERVAL 1 DAY
      GROUP BY Pathname
      ORDER BY pageviews DESC
      LIMIT 20
    `);

    const rows = result.data ?? [];
    console.log("Pages MV rows:", JSON.stringify(rows, null, 2));

    // We navigated to /, /pricing, /checkout, /success, /dashboard
    // At minimum we should see some of these pathnames
    expect(rows.length).toBeGreaterThan(0);

    const pathnames = rows.map((r: any) => r.Pathname);
    console.log("Found pathnames:", pathnames);
  });

  test("otel_analytics_sessions has session data from browser-test", async () => {
    // SimpleAggregateFunction(max/min, DateTime64) columns must be cast to
    // DateTime64 before arithmetic; ClickHouse doesn't auto-promote SAF types.
    const result = await queryProject(`
      SELECT
        uniq(SessionId) AS total_sessions,
        countMerge(Hits) AS total_hits
      FROM otel_analytics_sessions
      WHERE ServiceName = 'browser-test'
        AND Date >= today() - INTERVAL 1 DAY
    `);

    const rows = result.data ?? [];
    console.log("Sessions MV rows:", JSON.stringify(rows, null, 2));

    expect(rows.length).toBeGreaterThan(0);
    const sessions = Number(rows[0]?.total_sessions ?? 0);
    expect(sessions).toBeGreaterThan(0);
    console.log(`Sessions: ${sessions}, total_hits: ${rows[0]?.total_hits}`);
  });

  test("otel_logs has custom events from track() calls", async () => {
    const result = await queryProject(`
      SELECT
        LogAttributes['event.name'] AS event_name,
        count() AS occurrences
      FROM otel_logs
      WHERE ServiceName = 'browser-test'
        AND LogAttributes['event.name'] != ''
        AND Timestamp >= now() - INTERVAL 1 HOUR
      GROUP BY event_name
      ORDER BY occurrences DESC
      LIMIT 20
    `);

    const rows = result.data ?? [];
    console.log("Custom events:", JSON.stringify(rows, null, 2));

    // We tracked: page_loaded, signup_started, purchase_completed, feature_used, checkout_complete
    expect(rows.length).toBeGreaterThan(0);

    const eventNames = rows.map((r: any) => r.event_name);
    console.log("Found event names:", eventNames);
  });

  test("otel_errors has browser-captured exceptions", async () => {
    const result = await queryProject(`
      SELECT
        FingerprintHash,
        anyLast(ExceptionType) AS last_type,
        anyLast(ExceptionMessage) AS last_message,
        count() AS event_count,
        anyLast(MechanismType) AS mechanism
      FROM otel_errors
      WHERE ServiceName = 'browser-test'
        AND Timestamp >= now() - INTERVAL 1 HOUR
      GROUP BY FingerprintHash
      ORDER BY event_count DESC
      LIMIT 20
    `);

    const rows = result.data ?? [];
    console.log("Browser errors:", JSON.stringify(rows, null, 2));

    // We captured a TypeError and a BrowserUnhandledError
    expect(rows.length).toBeGreaterThan(0);

    const types = rows.map((r: any) => r.last_type);
    console.log("Found error types:", types);
  });

  test("otel_traces has pageview spans from browser-test", async () => {
    const result = await queryProject(`
      SELECT
        SpanAttributes['url.path'] AS path,
        SpanAttributes['session.id'] AS session_id,
        count() AS span_count
      FROM otel_traces
      WHERE ServiceName = 'browser-test'
        AND SpanName = 'pageview'
        AND Timestamp >= now() - INTERVAL 1 HOUR
      GROUP BY path, session_id
      ORDER BY span_count DESC
      LIMIT 20
    `);

    const rows = result.data ?? [];
    console.log("Pageview spans:", JSON.stringify(rows, null, 2));

    expect(rows.length).toBeGreaterThan(0);

    // Verify session.id is present on pageview spans
    const sessionIds = rows.map((r: any) => r.session_id).filter(Boolean);
    expect(sessionIds.length).toBeGreaterThan(0);
    console.log("Session IDs on pageview spans:", [...new Set(sessionIds)]);
  });
});
