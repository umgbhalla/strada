// Extracted SQL query functions shared by both CLI commands and the TUI.
// Each function takes an object param, builds SQL, and returns typed data
// via queryProject(). CLI commands and TUI views import these instead of
// inlining SQL, so queries stay in sync across both interfaces.

import dedent from "string-dedent";
import { queryProject, type QueryResult } from "./issues.ts";
import { getApiClient } from "./api-client.ts";
import { parseDuration, parseTimeBoundary } from "./parse-duration.ts";

// ── Shared types ──────────────────────────────────────────────────

export interface BaseQueryOptions {
  projectId: string;
  since?: string; // "1h", "24h", "7d" — each query has its own default
  service?: string; // null/undefined = all services
  limit?: number;
}

// ── AI search filter generation ───────────────────────────────────

export interface AiFilterResult {
  /** WHERE conditions (without WHERE keyword). Empty = no filter. */
  where: string;
  /** HAVING conditions (without HAVING keyword). For grouped queries only. */
  having: string;
  /** ORDER BY clause (without ORDER BY keyword). Empty = use default. */
  orderBy: string;
}

/**
 * Call the website's AI endpoint to turn natural language into structured
 * SQL fragments (where, having, orderBy). The AI always includes a date
 * filter in `where` to prevent full-table scans.
 */
export async function generateAiFilter(opts: {
  projectId: string;
  searchText: string;
  view: "issues" | "logs" | "traces";
}): Promise<AiFilterResult> {
  const { safeFetch } = getApiClient();
  const res = await safeFetch("/api/v0/projects/:projectId/generate-filter", {
    method: "POST",
    params: { projectId: opts.projectId },
    body: {
      searchText: opts.searchText,
      view: opts.view,
    },
  });
  if (res instanceof Error) throw res;
  return {
    where: res.where || "",
    having: res.having || "",
    orderBy: res.orderBy || "",
  };
}

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  const v = row[key];
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

function num(row: Row, key: string): number {
  const v = row[key];
  if (typeof v === "number") return v;
  return Number(v ?? 0) || 0;
}

// ── Issues ────────────────────────────────────────────────────────

export interface IssueRow {
  fingerprintHash: string;
  lastType: string;
  lastMessage: string;
  lastLevel: string;
  lastStacktrace: string;
  lastFrames: string;
  eventCount: number;
  unhandledCount: number;
  firstSeen: string;
  lastSeen: string;
}

export async function queryIssuesList(
  opts: BaseQueryOptions & { unhandled?: boolean; offset?: number; aiFilter?: AiFilterResult },
): Promise<{ data: IssueRow[]; hasMore: boolean }> {
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;

  // When AI filter is active, it provides the full WHERE (including date filter).
  // Otherwise use the default 7-day window (or explicit `since` from CLI commands).
  const conditions: string[] = [];
  if (opts.aiFilter?.where) {
    conditions.push(`(${opts.aiFilter.where})`);
  } else {
    const since = parseDuration(opts.since || "7d");
    conditions.push(`Timestamp >= now() - INTERVAL ${since}`);
  }
  if (opts.service) conditions.push(`ServiceName = '${opts.service}'`);
  if (opts.unhandled) conditions.push(`MechanismHandled = false`);

  const havingParts: string[] = [];
  if (opts.aiFilter?.having) havingParts.push(`(${opts.aiFilter.having})`);
  const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : "";

  const defaultOrderBy = "event_count DESC, FingerprintHash ASC";
  const orderBy = opts.aiFilter?.orderBy || defaultOrderBy;

  // Fetch one extra row to determine hasMore without a separate COUNT query
  const sql = dedent`
    SELECT
        FingerprintHash,
        anyLast(ExceptionType) AS last_type,
        anyLast(ExceptionMessage) AS last_message,
        anyLast(Level) AS last_level,
        anyLast(ExceptionStacktrace) AS last_stacktrace,
        anyLast(ExceptionFrames) AS last_frames,
        count() AS event_count,
        min(Timestamp) AS first_seen,
        max(Timestamp) AS last_seen,
        countIf(MechanismHandled = false) AS unhandled_count
    FROM otel_errors
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY FingerprintHash
    ${havingClause}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1} OFFSET ${offset}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  const rows = res.data ?? [];
  const hasMore = rows.length > limit;
  const data = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    fingerprintHash: str(r, "FingerprintHash"),
    lastType: str(r, "last_type"),
    lastMessage: str(r, "last_message"),
    lastLevel: str(r, "last_level"),
    lastStacktrace: str(r, "last_stacktrace"),
    lastFrames: str(r, "last_frames"),
    eventCount: num(r, "event_count"),
    unhandledCount: num(r, "unhandled_count"),
    firstSeen: str(r, "first_seen"),
    lastSeen: str(r, "last_seen"),
  }));
  return { data, hasMore };
}

export interface IssueSummary {
  lastType: string;
  lastMessage: string;
  lastLevel: string;
  lastMechanism: string;
  lastHandled: string;
  eventCount: number;
  unhandledCount: number;
  firstSeen: string;
  lastSeen: string;
  services: string[];
  releases: string[];
  environments: string[];
}

export interface IssueEvent {
  timestamp: string;
  exceptionType: string;
  exceptionMessage: string;
  exceptionStacktrace: string;
  exceptionFrames: string;
  mechanismType: string;
  mechanismHandled: string;
  level: string;
  release: string;
  environment: string;
  serviceName: string;
  traceId: string;
  spanId: string;
  tags: Record<string, string> | string;
}

/** Parse a value that may be a JS array, JSON array string, or ClickHouse array string */
function parseArray(value?: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    const match = value.match(/^\[(.+)\]$/);
    if (match) {
      return match[1]!.split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    }
  }
  return [];
}

export async function queryIssueDetail(
  opts: BaseQueryOptions & { fingerprint: string; eventsLimit?: number },
): Promise<{ summary: IssueSummary | null; events: IssueEvent[] }> {
  const eventsLimit = opts.eventsLimit || 5;

  const summarySql = dedent`
    SELECT
        anyLast(ExceptionType) AS last_type,
        anyLast(ExceptionMessage) AS last_message,
        anyLast(Level) AS last_level,
        anyLast(MechanismType) AS last_mechanism,
        anyLast(MechanismHandled) AS last_handled,
        count() AS event_count,
        countIf(MechanismHandled = false) AS unhandled_count,
        min(Timestamp) AS first_seen,
        max(Timestamp) AS last_seen,
        groupUniqArray(ServiceName) AS services,
        groupUniqArray(Release) AS releases,
        groupUniqArray(Environment) AS environments
    FROM otel_errors
    WHERE FingerprintHash = '${opts.fingerprint}'
    LIMIT 1
  `.trim();

  const eventsSql = dedent`
    SELECT
        Timestamp,
        ExceptionType,
        ExceptionMessage,
        ExceptionStacktrace,
        ExceptionFrames,
        MechanismType,
        MechanismHandled,
        Level,
        Release,
        Environment,
        ServiceName,
        TraceId,
        SpanId,
        Tags
    FROM otel_errors
    WHERE FingerprintHash = '${opts.fingerprint}'
    ORDER BY Timestamp DESC
    LIMIT ${eventsLimit}
  `.trim();

  const [summaryRes, eventsRes] = await Promise.all([
    queryProject(opts.projectId, summarySql),
    queryProject(opts.projectId, eventsSql),
  ]);

  const s = summaryRes.data?.[0];
  const summary =
    s && num(s, "event_count") > 0
      ? {
          lastType: str(s, "last_type"),
          lastMessage: str(s, "last_message"),
          lastLevel: str(s, "last_level"),
          lastMechanism: str(s, "last_mechanism"),
          lastHandled: str(s, "last_handled"),
          eventCount: num(s, "event_count"),
          unhandledCount: num(s, "unhandled_count"),
          firstSeen: str(s, "first_seen"),
          lastSeen: str(s, "last_seen"),
          services: parseArray(s.services),
          releases: parseArray(s.releases).filter(Boolean),
          environments: parseArray(s.environments).filter(Boolean),
        }
      : null;

  const events = (eventsRes.data ?? []).map((e) => ({
    timestamp: str(e, "Timestamp"),
    exceptionType: str(e, "ExceptionType"),
    exceptionMessage: str(e, "ExceptionMessage"),
    exceptionStacktrace: str(e, "ExceptionStacktrace"),
    exceptionFrames: str(e, "ExceptionFrames"),
    mechanismType: str(e, "MechanismType"),
    mechanismHandled: str(e, "MechanismHandled"),
    level: str(e, "Level"),
    release: str(e, "Release"),
    environment: str(e, "Environment"),
    serviceName: str(e, "ServiceName"),
    traceId: str(e, "TraceId"),
    spanId: str(e, "SpanId"),
    tags: e.Tags as Record<string, string> | string,
  }));

  return { summary, events };
}

export interface IssueMetadata {
  fingerprintHash: string;
  status: string;
}

export async function queryIssueMetadata(
  projectId: string,
  fingerprints: string[],
): Promise<Map<string, IssueMetadata>> {
  if (fingerprints.length === 0) return new Map();
  try {
    const inList = fingerprints.map((f) => `'${f}'`).join(", ");
    const sql = dedent`
      SELECT
          FingerprintHash,
          argMax(Status, Version) AS Status,
          argMax(AssigneeMemberId, Version) AS AssigneeMemberId
      FROM otel_issue_state
      WHERE FingerprintHash IN (${inList})
      GROUP BY FingerprintHash
      LIMIT ${fingerprints.length}
    `.trim();
    const res = await queryProject(projectId, sql);
    const map = new Map<string, IssueMetadata>();
    for (const row of res.data ?? []) {
      const fp = str(row, "FingerprintHash");
      map.set(fp, { fingerprintHash: fp, status: str(row, "Status") || "open" });
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Logs ──────────────────────────────────────────────────────────

export interface LogRow {
  timestamp: string;
  severityText: string;
  serviceName: string;
  body: string;
  logAttributes: Record<string, string> | string;
  traceId: string;
  spanId: string;
}

export interface LogsCursor {
  ts: string;
  traceId: string;
  spanId: string;
}

export async function queryLogsList(
  opts: BaseQueryOptions & {
    search?: string;
    traceId?: string;
    minLevel?: number;
    cursor?: LogsCursor;
    aiFilter?: AiFilterResult;
  },
): Promise<{ data: LogRow[]; hasMore: boolean; cursor?: LogsCursor }> {
  const limit = opts.limit || 30;

  // When AI filter is active, it provides the full WHERE (including date filter).
  // Otherwise use the default 7-day window (or explicit `since` from CLI commands).
  const conditions: string[] = [];
  if (opts.aiFilter?.where) {
    conditions.push(`(${opts.aiFilter.where})`);
  } else {
    conditions.push(`Timestamp >= ${parseTimeBoundary(opts.since || "7d")}`);
  }
  if (opts.service) conditions.push(`ServiceName = '${opts.service}'`);
  if (opts.traceId) conditions.push(`TraceId = '${opts.traceId}'`);
  if (opts.search) conditions.push(`Body LIKE '%${opts.search}%'`);
  if (opts.minLevel) conditions.push(`SeverityNumber >= ${opts.minLevel}`);

  // Cursor-based pagination: (Timestamp DESC, TraceId ASC, SpanId ASC).
  // Nanosecond timestamps + TraceId + SpanId is unique enough for log rows.
  // Disabled when AI provides a custom orderBy since cursors depend on fixed sort order.
  if (opts.cursor && !opts.aiFilter?.orderBy) {
    const c = opts.cursor;
    conditions.push(
      `(Timestamp < '${c.ts}' OR (Timestamp = '${c.ts}' AND TraceId > '${c.traceId}') OR (Timestamp = '${c.ts}' AND TraceId = '${c.traceId}' AND SpanId > '${c.spanId}'))`,
    );
  }

  const defaultOrderBy = "Timestamp DESC, TraceId ASC, SpanId ASC";
  const orderBy = opts.aiFilter?.orderBy || defaultOrderBy;

  const sql = dedent`
    SELECT
        Timestamp,
        SeverityText,
        ServiceName,
        Body,
        LogAttributes,
        TraceId,
        SpanId
    FROM otel_logs
    WHERE ${conditions.join("\n  AND ")}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  const rows = res.data ?? [];
  const hasMore = rows.length > limit;
  const data = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    timestamp: str(r, "Timestamp"),
    severityText: str(r, "SeverityText"),
    serviceName: str(r, "ServiceName"),
    body: str(r, "Body"),
    logAttributes: r.LogAttributes as Record<string, string> | string,
    traceId: str(r, "TraceId"),
    spanId: str(r, "SpanId"),
  }));
  const lastRow = data[data.length - 1];
  const cursor = lastRow ? { ts: lastRow.timestamp, traceId: lastRow.traceId, spanId: lastRow.spanId } : undefined;
  return { data, hasMore, cursor };
}

export interface LogStatsRow {
  serviceName: string;
  total: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
}

export async function queryLogsStats(opts: BaseQueryOptions): Promise<LogStatsRow[]> {
  const conditions = [
    `Timestamp >= ${parseTimeBoundary(opts.since || "1h")}`,
  ];
  if (opts.service) conditions.push(`ServiceName = '${opts.service}'`);

  const sql = dedent`
    SELECT
        ServiceName,
        count() AS total,
        countIf(SeverityText = 'DEBUG' OR SeverityText = 'TRACE') AS debug,
        countIf(SeverityText = 'INFO') AS info,
        countIf(SeverityText = 'WARN') AS warn,
        countIf(SeverityText = 'ERROR') AS error,
        countIf(SeverityText = 'FATAL') AS fatal
    FROM otel_logs
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY ServiceName
    ORDER BY total DESC
    LIMIT 50
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  return (res.data ?? []).map((r) => ({
    serviceName: str(r, "ServiceName"),
    total: num(r, "total"),
    debug: num(r, "debug"),
    info: num(r, "info"),
    warn: num(r, "warn"),
    error: num(r, "error"),
    fatal: num(r, "fatal"),
  }));
}

// ── Traces ────────────────────────────────────────────────────────

export interface TraceSummaryRow {
  traceId: string;
  startTime: string;
  durationNs: number;
  spanCount: number;
  errorSpanCount: number;
  services: string[];
  rootSpanName: string;
  rootServiceName: string;
  rootStatusCode: string;
}

export interface TracesCursor {
  ts: string;
  id: string;
}

export async function queryTracesList(
  opts: BaseQueryOptions & {
    errorsOnly?: boolean;
    cursor?: TracesCursor;
    aiFilter?: AiFilterResult;
  },
): Promise<{ data: TraceSummaryRow[]; hasMore: boolean; cursor?: TracesCursor }> {
  const limit = opts.limit || 20;

  // When AI filter is active, it provides the full WHERE (including date filter).
  // Otherwise use the default 7-day window (or explicit `since` from CLI commands).
  const conditions: string[] = [];
  if (opts.aiFilter?.where) {
    conditions.push(`(${opts.aiFilter.where})`);
  } else {
    conditions.push(`Timestamp >= ${parseTimeBoundary(opts.since || "7d")}`);
  }
  if (opts.service) conditions.push(`ServiceName = '${opts.service}'`);

  // Collect HAVING parts: errorsOnly, AI having, and cursor pagination
  const havingParts: string[] = [];
  if (opts.errorsOnly) havingParts.push("ErrorSpanCount > 0");
  if (opts.aiFilter?.having) havingParts.push(`(${opts.aiFilter.having})`);

  // Cursor-based pagination: use (StartTime DESC, TraceId ASC) as a deterministic
  // compound cursor. Disabled when AI provides a custom orderBy since cursors
  // depend on fixed sort order.
  if (opts.cursor && !opts.aiFilter?.orderBy) {
    havingParts.push(
      `(StartTime < '${opts.cursor.ts}' OR (StartTime = '${opts.cursor.ts}' AND TraceId > '${opts.cursor.id}'))`,
    );
  }

  const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : "";

  const defaultOrderBy = "StartTime DESC, TraceId ASC";
  const orderBy = opts.aiFilter?.orderBy || defaultOrderBy;

  const sql = dedent`
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
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY TraceId
    ${havingClause}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  const rows = res.data ?? [];
  const hasMore = rows.length > limit;
  const data = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    traceId: str(r, "TraceId"),
    startTime: str(r, "StartTime"),
    durationNs: num(r, "DurationNs"),
    spanCount: num(r, "SpanCount"),
    errorSpanCount: num(r, "ErrorSpanCount"),
    services: parseArray(r.Services),
    rootSpanName: str(r, "RootSpanName"),
    rootServiceName: str(r, "RootServiceName"),
    rootStatusCode: str(r, "RootStatusCode"),
  }));
  const lastRow = data[data.length - 1];
  const cursor = lastRow ? { ts: lastRow.startTime, id: lastRow.traceId } : undefined;
  return { data, hasMore, cursor };
}

export async function queryTraceSpans(
  opts: BaseQueryOptions & { traceId: string },
): Promise<QueryResult> {
  const sql = dedent`
    SELECT
        TraceId,
        SpanId,
        ParentSpanId,
        SpanName,
        ServiceName,
        SpanKind,
        Duration,
        Timestamp,
        StatusCode,
        StatusMessage,
        SpanAttributes,
        ResourceAttributes,
        ScopeName,
        ScopeVersion,
        ScopeAttributes,
        EventsTimestamp,
        EventsName,
        EventsAttributes,
        LinksTraceId,
        LinksSpanId,
        LinksTraceState,
        LinksAttributes
    FROM otel_traces
    WHERE TraceId = '${opts.traceId}'
    ORDER BY Timestamp ASC
    LIMIT 10000
  `.trim();

  return queryProject(opts.projectId, sql);
}

// ── Analytics ─────────────────────────────────────────────────────

interface AnalyticsQueryOptions extends BaseQueryOptions {
  domain?: string;
}

function buildMvConditions(opts: AnalyticsQueryOptions): string[] {
  const since = parseDuration(opts.since || "7d");
  const conditions: string[] = [`Date >= today() - INTERVAL ${since}`];
  if (opts.service) conditions.push(`ServiceName = '${opts.service}'`);
  if (opts.domain) conditions.push(`Domain = '${opts.domain}'`);
  return conditions;
}

export interface AnalyticsPageRow {
  pathname: string;
  pageviews: number;
  visitors: number;
}

export async function queryAnalyticsPages(opts: AnalyticsQueryOptions): Promise<AnalyticsPageRow[]> {
  const conditions = buildMvConditions(opts);
  const limit = opts.limit || 20;

  const sql = dedent`
    SELECT
        Pathname,
        countMerge(Hits) AS pageviews,
        uniqMerge(Visits) AS visitors
    FROM otel_analytics_pages
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY Pathname
    ORDER BY pageviews DESC
    LIMIT ${limit}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  return (res.data ?? []).map((r) => ({
    pathname: str(r, "Pathname"),
    pageviews: num(r, "pageviews"),
    visitors: num(r, "visitors"),
  }));
}

export interface AnalyticsKpis {
  visitors: number;
  pageviews: number;
  sessions: number;
  bounceRate: number;
  avgDurationSec: number;
}

export async function queryAnalyticsKpis(opts: AnalyticsQueryOptions): Promise<AnalyticsKpis> {
  const pagesConditions = buildMvConditions(opts);
  const sessionsConditions = buildMvConditions(opts);

  const pagesSql = dedent`
    SELECT
        uniqMerge(Visits) AS unique_visitors,
        countMerge(Hits) AS total_pageviews
    FROM otel_analytics_pages
    WHERE ${pagesConditions.join("\n  AND ")}
  `.trim();

  const sessionsSql = dedent`
    SELECT
        count() AS total_sessions,
        sumIf(1, latest_ms = first_ms) / greatest(count(), 1) AS bounce_rate,
        avg(latest_ms - first_ms) / 1000 AS avg_session_duration_sec
    FROM (
        SELECT
            SessionId,
            toUnixTimestamp64Milli(max(LatestHit)) AS latest_ms,
            toUnixTimestamp64Milli(min(FirstHit)) AS first_ms
        FROM otel_analytics_sessions
        WHERE ${sessionsConditions.join("\n      AND ")}
        GROUP BY SessionId
    )
  `.trim();

  const [pagesRes, sessionsRes] = await Promise.all([
    queryProject(opts.projectId, pagesSql),
    queryProject(opts.projectId, sessionsSql),
  ]);

  const p = pagesRes.data?.[0];
  const s = sessionsRes.data?.[0];

  return {
    visitors: num(p ?? {}, "unique_visitors"),
    pageviews: num(p ?? {}, "total_pageviews"),
    sessions: num(s ?? {}, "total_sessions"),
    bounceRate: Number((s as Row | undefined)?.bounce_rate ?? 0),
    avgDurationSec: Number((s as Row | undefined)?.avg_session_duration_sec ?? 0),
  };
}

export interface AnalyticsDimensionRow {
  name: string;
  visitors: number;
  pageviews: number;
}

export async function queryAnalyticsBrowsers(opts: AnalyticsQueryOptions): Promise<AnalyticsDimensionRow[]> {
  const conditions = buildMvConditions(opts);
  const limit = opts.limit || 20;

  const sql = dedent`
    SELECT
        Browser,
        uniqMerge(Visits) AS visitors,
        countMerge(Hits) AS pageviews
    FROM otel_analytics_pages
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY Browser
    ORDER BY visitors DESC
    LIMIT ${limit}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  return (res.data ?? []).map((r) => ({
    name: str(r, "Browser") || "Unknown",
    visitors: num(r, "visitors"),
    pageviews: num(r, "pageviews"),
  }));
}

export async function queryAnalyticsCountries(opts: AnalyticsQueryOptions): Promise<AnalyticsDimensionRow[]> {
  const conditions = buildMvConditions(opts);
  const limit = opts.limit || 20;

  const sql = dedent`
    SELECT
        Country,
        uniqMerge(Visits) AS visitors,
        countMerge(Hits) AS pageviews
    FROM otel_analytics_pages
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY Country
    ORDER BY visitors DESC
    LIMIT ${limit}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  return (res.data ?? []).map((r) => ({
    name: str(r, "Country") || "Unknown",
    visitors: num(r, "visitors"),
    pageviews: num(r, "pageviews"),
  }));
}

export async function queryAnalyticsReferrers(opts: AnalyticsQueryOptions): Promise<AnalyticsDimensionRow[]> {
  const conditions = buildMvConditions(opts);
  conditions.push(`Referrer != ''`);
  if (opts.domain) conditions.push(`Referrer != '${opts.domain}'`);
  const limit = opts.limit || 20;

  const sql = dedent`
    SELECT
        Referrer,
        uniqMerge(Visits) AS visitors,
        countMerge(Hits) AS pageviews
    FROM otel_analytics_pages
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY Referrer
    ORDER BY visitors DESC
    LIMIT ${limit}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  return (res.data ?? []).map((r) => ({
    name: str(r, "Referrer"),
    visitors: num(r, "visitors"),
    pageviews: num(r, "pageviews"),
  }));
}

export interface AnalyticsEventRow {
  eventName: string;
  occurrences: number;
  uniqueSessions: number;
}

export async function queryAnalyticsEvents(opts: BaseQueryOptions): Promise<AnalyticsEventRow[]> {
  const since = parseDuration(opts.since || "7d");
  const limit = opts.limit || 20;
  const conditions = [
    `Timestamp >= now() - INTERVAL ${since}`,
    `LogAttributes['event.name'] != ''`,
  ];
  if (opts.service) conditions.push(`ServiceName = '${opts.service}'`);

  const sql = dedent`
    SELECT
        LogAttributes['event.name'] AS event_name,
        count() AS occurrences,
        uniqExact(LogAttributes['session.id']) AS unique_sessions
    FROM otel_logs
    WHERE ${conditions.join("\n  AND ")}
    GROUP BY event_name
    ORDER BY occurrences DESC
    LIMIT ${limit}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  return (res.data ?? []).map((r) => ({
    eventName: str(r, "event_name"),
    occurrences: num(r, "occurrences"),
    uniqueSessions: num(r, "unique_sessions"),
  }));
}

export async function queryAnalyticsRealtime(opts: BaseQueryOptions): Promise<number> {
  const conditions = [
    `SpanName = 'pageview'`,
    `Timestamp >= now() - INTERVAL 5 MINUTE`,
  ];
  if (opts.service) conditions.push(`ServiceName = '${opts.service}'`);

  const sql = dedent`
    SELECT uniq(SpanAttributes['session.id']) AS active_visitors
    FROM otel_traces
    WHERE ${conditions.join("\n  AND ")}
  `.trim();

  const res = await queryProject(opts.projectId, sql);
  return num(res.data?.[0] ?? {}, "active_visitors");
}

// ── Services ──────────────────────────────────────────────────────

export interface ServiceRow {
  serviceName: string;
  logs: number;
  logErrors: number;
  spans: number;
  spanErrors: number;
  lastSeen: string;
}

export async function queryServices(opts: BaseQueryOptions): Promise<ServiceRow[]> {
  const limit = opts.limit || 100;
  const conditions = [
    `Timestamp >= ${parseTimeBoundary(opts.since || "24h")}`,
  ];

  const where = conditions.join("\n  AND ");

  const logsSql = dedent`
    SELECT
        ServiceName,
        count() AS logs,
        countIf(SeverityText IN ('ERROR', 'FATAL')) AS log_errors,
        max(Timestamp) AS last_seen
    FROM otel_logs
    WHERE ${where}
    GROUP BY ServiceName
    ORDER BY logs DESC
    LIMIT ${limit}
  `.trim();

  const tracesSql = dedent`
    SELECT
        ServiceName,
        count() AS spans,
        countIf(StatusCode = 'Error') AS span_errors,
        max(Timestamp) AS last_seen
    FROM otel_traces
    WHERE ${where}
    GROUP BY ServiceName
    ORDER BY spans DESC
    LIMIT ${limit}
  `.trim();

  const [logsRes, tracesRes] = await Promise.all([
    queryProject(opts.projectId, logsSql),
    queryProject(opts.projectId, tracesSql),
  ]);

  const map = new Map<string, ServiceRow>();
  for (const r of logsRes.data ?? []) {
    const name = str(r, "ServiceName");
    const existing = map.get(name);
    map.set(name, {
      serviceName: name,
      logs: (existing?.logs ?? 0) + num(r, "logs"),
      logErrors: (existing?.logErrors ?? 0) + num(r, "log_errors"),
      spans: existing?.spans ?? 0,
      spanErrors: existing?.spanErrors ?? 0,
      lastSeen: str(r, "last_seen") > (existing?.lastSeen ?? "") ? str(r, "last_seen") : existing?.lastSeen ?? "",
    });
  }
  for (const r of tracesRes.data ?? []) {
    const name = str(r, "ServiceName");
    const existing = map.get(name);
    map.set(name, {
      serviceName: name,
      logs: existing?.logs ?? 0,
      logErrors: existing?.logErrors ?? 0,
      spans: (existing?.spans ?? 0) + num(r, "spans"),
      spanErrors: (existing?.spanErrors ?? 0) + num(r, "span_errors"),
      lastSeen: str(r, "last_seen") > (existing?.lastSeen ?? "") ? str(r, "last_seen") : existing?.lastSeen ?? "",
    });
  }

  return [...map.values()]
    .sort((a, b) => b.logs + b.spans - (a.logs + a.spans))
    .slice(0, limit);
}
