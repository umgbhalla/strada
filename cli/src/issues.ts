// Issue listing and detail CLI commands. Groups errors by fingerprint and
// displays a frequency-sorted table, or shows a detailed view of a single
// issue group with stacktrace and recent events.
//
// Terminology:
//   "error" = a single exception event in otel_errors (ClickHouse)
//   "issue" = a group of errors sharing the same FingerprintHash, the
//             user-facing concept with status, assignee, and lifecycle

import { goke } from "goke";
import dedent from "string-dedent";
import { z } from "zod";
import { bold, cyan, dim, red, yellow, gray, green, white } from "./colors.ts";
import { getApiClient, queryProject, type QueryResult } from "./api-client.ts";
import { resolveProject, resolveProjects } from "./projects.ts";
import { printTable, formatCount, timeAgo } from "./table.ts";
import { parseDuration } from "./parse-duration.ts";

// Re-export queryProject and QueryResult so existing imports from "./issues.ts" still work
export { queryProject, type QueryResult };

export const issuesCli = goke();

/**
 * Fetch issue metadata (status) from otel_issue_state via SQL.
 * Only fetches state for the given fingerprints to avoid unbounded reads.
 * Best-effort enrichment; returns empty map on failure.
 */
async function fetchIssueMetadata(projectId: string, fingerprints: string[], output?: { log: (msg: string) => void }) {
  if (fingerprints.length === 0) return new Map<string, IssueMetadata>();
  try {
    const inList = fingerprints.map((f) => `'${f}'`).join(", ");
    // Use argMax() instead of FINAL (Tinybird JWT subquery doesn't support FINAL)
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
      const fingerprint = str(row, "FingerprintHash");
      map.set(fingerprint, {
        fingerprintHash: fingerprint,
        status: str(row, "Status") || "open",
      });
    }
    return map;
  } catch {
    if (output) output.log(dim("  (issue metadata unavailable, showing raw ClickHouse data)"));
    return new Map<string, IssueMetadata>();
  }
}

/** Fetch metadata for a single issue by fingerprint. Returns null if not found or on error. */
async function fetchSingleIssueMetadata(projectId: string, fingerprintHash: string): Promise<IssueMetadata | null> {
  try {
    const sql = dedent`
      SELECT
          FingerprintHash,
          argMax(Status, Version) AS Status,
          argMax(AssigneeMemberId, Version) AS AssigneeMemberId
      FROM otel_issue_state
      WHERE FingerprintHash = '${fingerprintHash}'
      GROUP BY FingerprintHash
      LIMIT 1
    `.trim();
    const res = await queryProject(projectId, sql);
    const row = res.data?.[0];
    if (!row) return null;
    return {
      fingerprintHash: str(row, "FingerprintHash"),
      status: str(row, "Status") || "open",
    };
  } catch {
    return null;
  }
}

interface IssueMetadata {
  fingerprintHash: string;
  status: string;
}

/** Safely read a field as string from a query result row */
function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

// ── issues list ───────────────────────────────────────────────────

issuesCli
  .command(
    "issues list",
    dedent`
      List error issue groups sorted by frequency.

      Groups errors by FingerprintHash and shows the count, exception type,
      message, status, and last seen time for each group. This is the starting
      point for debugging production errors. Use --since to control the time
      range and -s to filter by service.

      After finding an issue, copy its fingerprint hash and run
      'strada issues view <fingerprint>' to see the full stack trace and
      recent events.

      By default only 'open' issues are shown. Use --status to filter by
      triage state: open, resolved, muted, ignored, or all.

      Examples:
        strada issues list -p my-app --since 24h
        strada issues list -p my-app -s api-server --unhandled
        strada issues list -p my-app --status all
        strada issues list -p my-app --status resolved
        strada issues list -p frontend -p api --since 7d
    `,
  )
  .option("-p, --project <slug>", z.array(z.string()).describe("Project slug override (repeatable, defaults to folder setup)"))
  .option("--org [name-or-id]", "Organization override (defaults to folder setup)")
  .option("-s, --service [name]", "Filter by service name")
  .option("--since [duration]", "Time range, e.g. 1h, 24h, 7d (default: 24h)")
  .option("-n, --limit [count]", "Max number of issue groups (default: 20)")
  .option("--status [status]", "Filter by triage status: open, resolved, muted, ignored, all (default: open)")
  .option("--unhandled", "Show only unhandled errors")
  .action(async (options, { console: output, process: proc }) => {
    const { slugs, projects } = await resolveProjects({ project: options.project, org: options.org || undefined });

    const since = parseDuration(options.since || "24h");
    const limit = Number(options.limit) || 20;
    const statusFilter = (options.status || "open").toLowerCase();

    const validStatuses = ["open", "resolved", "muted", "ignored", "all"];
    if (!validStatuses.includes(statusFilter)) {
      output.log(`Invalid --status: ${options.status}`);
      output.log(dim(`Valid values: ${validStatuses.join(", ")}`));
      return proc.exit(1);
    }

    // Over-fetch when filtering by status so post-filtering doesn't leave
    // us with too few results. "all" needs no over-fetch.
    const fetchLimit = statusFilter === "all" ? limit : limit * 3;

    // Build WHERE clauses
    const conditions = [`Timestamp >= now() - INTERVAL ${since}`];
    if (options.service) {
      conditions.push(`ServiceName = '${options.service}'`);
    }
    if (options.unhandled) {
      conditions.push(`MechanismHandled = false`);
    }

    const sql = dedent`
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
      WHERE ${conditions.join("\n  AND ")}
      GROUP BY FingerprintHash
      ORDER BY event_count DESC
      LIMIT ${fetchLimit}
    `.trim();

    // Query all projects in parallel
    const results = await Promise.all(projects.map((p) => queryProject(p.id, sql)));
    const allRows = results.flatMap((data) => data.data ?? []);

    // Extract fingerprints from results, then fetch their issue metadata
    const fingerprints = allRows.map((r) => str(r, "FingerprintHash")).filter(Boolean);
    const metadataMaps = await Promise.all(
      projects.map((p) => fetchIssueMetadata(p.id, fingerprints, output)),
    );
    const issueMetadata = new Map<string, IssueMetadata>();
    for (const m of metadataMaps) {
      for (const [k, v] of m) issueMetadata.set(k, v);
    }

    // Resolve status for each row and filter by --status
    const rowsWithStatus = allRows.map((r) => {
      const fingerprint = str(r, "FingerprintHash");
      const meta = issueMetadata.get(fingerprint);
      return { row: r, status: meta?.status || "open" };
    });

    const filteredRows = statusFilter === "all"
      ? rowsWithStatus
      : rowsWithStatus.filter((r) => r.status === statusFilter);

    // Truncate to the requested limit after filtering
    const displayRows = filteredRows.slice(0, limit);

    if (displayRows.length === 0) {
      const slugLabel = slugs.join(", ");
      const statusHint = statusFilter === "all" ? "" : ` with status '${statusFilter}'`;
      output.log(dim(`No issues found in ${cyan(slugLabel)}${statusHint} (last ${options.since || "24h"})`));
      if (statusFilter !== "all" && allRows.length > 0) {
        output.log(dim(`  Try --status all to include resolved and muted issues`));
      }
      return;
    }

    // Header
    const sinceLabel = options.since || "24h";
    const slugLabel = slugs.join(", ");
    output.log("");
    output.log(bold(`Issues in ${cyan(slugLabel)}`) + dim(` (last ${sinceLabel})`));
    if (options.service) output.log(dim(`  service: ${options.service}`));
    if (statusFilter !== "open") output.log(dim(`  status: ${statusFilter}`));
    output.log("");

    // Format rows for table
    const statusColors: Record<string, (s: string) => string> = {
      open: red,
      resolved: green,
      muted: yellow,
      ignored: dim,
    };

    const tableRows = displayRows.map(({ row: r, status }) => {
      const count = Number(r.event_count ?? 0);
      const unhandled = Number(r.unhandled_count ?? 0);
      const level = str(r, "last_level") || "error";
      const levelColor = level === "fatal" ? red : level === "warning" ? yellow : red;
      const statusColor = statusColors[status] || dim;

      return {
        status: statusColor(status),
        count: formatCount(count),
        unhandled: unhandled > 0 ? formatCount(unhandled) : dim("0"),
        level: levelColor(level),
        type: str(r, "last_type") || gray("(none)"),
        message: str(r, "last_message") || gray("(no message)"),
        assignee: dim("—"),
        last_seen: timeAgo(str(r, "last_seen")),
      };
    });

    printTable(output, {
      columns: [
        { key: "status", label: "STATUS" },
        { key: "count", label: "COUNT", align: "right", color: bold },
        { key: "unhandled", label: "UNHANDLED", align: "right" },
        { key: "level", label: "LEVEL" },
        { key: "type", label: "TYPE", color: cyan },
        { key: "message", label: "MESSAGE", maxWidth: 40 },
        { key: "assignee", label: "ASSIGNEE" },
        { key: "last_seen", label: "LAST SEEN", color: dim },
      ],
      rows: tableRows,
    });

    // Summary line
    const totalEvents = displayRows.reduce((sum, { row: r }) => sum + Number(r.event_count ?? 0), 0);
    output.log("");
    output.log(dim(`  ${displayRows.length} issues, ${formatCount(totalEvents)} total events`));
    output.log("");
  });

// ── issues view ───────────────────────────────────────────────────

issuesCli
  .command(
    "issues view <fingerprint>",
    dedent`
      Show full details for a single issue by fingerprint hash.

      Displays exception type, message, stack trace (structured frames when
      available), triage status, mechanism (handled/unhandled), services,
      releases, environments, and a table of recent error events with trace
      correlation IDs.

      Get the fingerprint hash from 'strada issues list'. The --events flag
      controls how many recent occurrences to show (default 5).

        strada issues view abc123def456 -p my-app
        strada issues view abc123def456 -p my-app --events 10 --json
    `,
  )
  .option("-p, --project [slug]", "Project slug override (defaults to folder setup)")
  .option("--org [name-or-id]", "Organization override (defaults to folder setup)")
  .option("-n, --events [count]", "Number of recent error events to show (default: 5)")
  .option("--json", "Output raw JSON")
  .action(async (fingerprint, options, { console: output, process: proc }) => {
    const { project } = await resolveProject({ project: options.project || undefined, org: options.org || undefined });
    const eventsLimit = Number(options.events) || 5;

    // Query 1: Issue summary (aggregated)
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
      WHERE FingerprintHash = '${fingerprint}'
      LIMIT 1
    `.trim();

    // Query 2: Recent error events with stacktrace
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
      WHERE FingerprintHash = '${fingerprint}'
      ORDER BY Timestamp DESC
      LIMIT ${eventsLimit}
    `.trim();

    const [summaryRes, eventsRes, issueMeta] = await Promise.all([
      queryProject(project.id, summarySql),
      queryProject(project.id, eventsSql),
      fetchSingleIssueMetadata(project.id, fingerprint),
    ]);

    const summary = summaryRes.data?.[0];
    const events = eventsRes.data ?? [];

    if (!summary || Number(summary.event_count) === 0) {
      output.log(dim(`No issue found with fingerprint ${cyan(fingerprint)}`));
      return proc.exit(1);
    }

    const meta = issueMeta;

    if (options.json) {
      output.log(JSON.stringify({ summary, events, issue: meta ?? null }, null, 2));
      return;
    }

    // ── Render summary ──
    const type = str(summary, "last_type") || "(unknown)";
    const message = str(summary, "last_message") || "(no message)";
    const level = str(summary, "last_level") || "error";
    const levelColor = level === "fatal" ? red : level === "warning" ? yellow : red;
    const handledVal = str(summary, "last_handled");
    const handled = handledVal === "true" || handledVal === "1";
    const mechanism = str(summary, "last_mechanism") || "generic";
    const firstSeen = str(summary, "first_seen");
    const lastSeen = str(summary, "last_seen");

    const status = meta?.status || "open";
    const statusColors: Record<string, (s: string) => string> = {
      open: red,
      resolved: green,
      muted: yellow,
      ignored: dim,
    };
    const statusColor = statusColors[status] || dim;

    output.log("");
    output.log(bold(red(`${type}: ${message}`)));
    output.log("");
    output.log(`  ${dim("Fingerprint")}   ${cyan(fingerprint)}`);
    output.log(`  ${dim("Status")}        ${statusColor(status)}`);
    output.log(`  ${dim("Level")}         ${levelColor(level)}`);
    output.log(`  ${dim("Events")}        ${bold(formatCount(Number(summary.event_count)))} total${Number(summary.unhandled_count) > 0 ? ` (${red(formatCount(Number(summary.unhandled_count)))} unhandled)` : ""}`);
    output.log(`  ${dim("First seen")}    ${firstSeen} ${dim(`(${timeAgo(firstSeen)})`)}`);
    output.log(`  ${dim("Last seen")}     ${lastSeen} ${dim(`(${timeAgo(lastSeen)})`)}`);
    output.log(`  ${dim("Mechanism")}     ${mechanism} ${handled ? green("(handled)") : red("(unhandled)")}`);

    // No assignee/resolver names in the CLI anymore; issue state is in ClickHouse.
    // The website API resolves member names from D1 when needed for the UI.

    // Services, releases, environments
    const services = parseClickHouseArray(summary.services);
    const releases = parseClickHouseArray(summary.releases).filter(Boolean);
    const environments = parseClickHouseArray(summary.environments).filter(Boolean);

    if (services.length > 0) {
      output.log(`  ${dim("Services")}      ${services.join(", ")}`);
    }
    if (releases.length > 0) {
      output.log(`  ${dim("Releases")}      ${releases.join(", ")}`);
    }
    if (environments.length > 0) {
      output.log(`  ${dim("Environments")}  ${environments.join(", ")}`);
    }

    // ── Render stacktrace from latest event ──
    const latestEvent = events[0];
    if (latestEvent) {
      output.log("");
      output.log(bold("  Stacktrace") + dim(" (latest event):"));
      output.log("");

      const rendered = renderStacktrace(str(latestEvent, "ExceptionFrames"), str(latestEvent, "ExceptionStacktrace"));
      for (const line of rendered) {
        output.log(line);
      }
    }

    // ── Render recent events table ──
    if (events.length > 0) {
      output.log("");
      output.log(bold("  Recent events:"));
      output.log("");

      const eventRows = events.map((e) => {
        const ts = str(e, "Timestamp").replace("T", " ").replace(/\.\d+Z?$/, "");
        const traceId = str(e, "TraceId");
        return {
          timestamp: ts,
          service: str(e, "ServiceName"),
          release: str(e, "Release") || dim("—"),
          env: str(e, "Environment") || dim("—"),
          trace: traceId ? traceId.slice(0, 12) + "…" : dim("—"),
        };
      });

      printTable(output, {
        columns: [
          { key: "timestamp", label: "TIMESTAMP" },
          { key: "service", label: "SERVICE", color: cyan },
          { key: "release", label: "RELEASE" },
          { key: "env", label: "ENV" },
          { key: "trace", label: "TRACE ID", color: dim },
        ],
        rows: eventRows,
      });
    }

    output.log("");
  });

// ── issues resolve ────────────────────────────────────────────────

issuesCli
  .command(
    "issues resolve <fingerprint>",
    dedent`
      Mark an issue as resolved.

      Sets the issue status to 'resolved' in otel_issue_state. Resolved issues
      are hidden from the default 'strada issues list' output. Use --status all
      or --status resolved to see them. Reopen with 'strada issues unresolve'.
    `,
  )
  .option("-p, --project [slug]", "Project slug override (defaults to folder setup)")
  .option("--org [name-or-id]", "Organization override (defaults to folder setup)")
  .action(async (fingerprint, options, { console: output, process: proc }) => {
    const { project } = await resolveProject({ project: options.project || undefined, org: options.org || undefined });
    const { safeFetch } = getApiClient();
    const res = await safeFetch("/api/v0/projects/:projectId/issues/:fingerprintHash/status", {
      method: "PUT",
      params: { projectId: project.id, fingerprintHash: fingerprint },
      body: { status: "resolved" },
    });
    if (res instanceof Error) throw res;
    output.log(green(`Issue ${cyan(fingerprint)} marked as resolved`));
  });

// ── issues mute ──────────────────────────────────────────────────

issuesCli
  .command(
    "issues mute <fingerprint>",
    dedent`
      Mark an issue as muted.

      Muted issues still collect error events but are hidden from the default
      'strada issues list' output. Use --status muted or --status all to see them.
      Useful for known noise you want to triage separately.
    `,
  )
  .option("-p, --project [slug]", "Project slug override (defaults to folder setup)")
  .option("--org [name-or-id]", "Organization override (defaults to folder setup)")
  .action(async (fingerprint, options, { console: output, process: proc }) => {
    const { project } = await resolveProject({ project: options.project || undefined, org: options.org || undefined });
    const { safeFetch } = getApiClient();
    const res = await safeFetch("/api/v0/projects/:projectId/issues/:fingerprintHash/status", {
      method: "PUT",
      params: { projectId: project.id, fingerprintHash: fingerprint },
      body: { status: "muted" },
    });
    if (res instanceof Error) throw res;
    output.log(yellow(`Issue ${cyan(fingerprint)} muted`));
  });

// ── issues unresolve ─────────────────────────────────────────────

issuesCli
  .command(
    "issues unresolve <fingerprint>",
    dedent`
      Reopen a resolved or muted issue.

      Sets the status back to 'open' so it appears in the default listing again.
    `,
  )
  .option("-p, --project [slug]", "Project slug override (defaults to folder setup)")
  .option("--org [name-or-id]", "Organization override (defaults to folder setup)")
  .action(async (fingerprint, options, { console: output, process: proc }) => {
    const { project } = await resolveProject({ project: options.project || undefined, org: options.org || undefined });
    const { safeFetch } = getApiClient();
    const res = await safeFetch("/api/v0/projects/:projectId/issues/:fingerprintHash/status", {
      method: "PUT",
      params: { projectId: project.id, fingerprintHash: fingerprint },
      body: { status: "open" },
    });
    if (res instanceof Error) throw res;
    output.log(red(`Issue ${cyan(fingerprint)} reopened`));
  });

// ── issues assign ────────────────────────────────────────────────

issuesCli
  .command(
    "issues assign <fingerprint>",
    dedent`
      Assign an issue to an org member or remove the current assignee.

      Pass --to <member-id> to assign, or --unassign to clear the assignee.
      Get member IDs from the Strada website team page.
    `,
  )
  .option("-p, --project [slug]", "Project slug override (defaults to folder setup)")
  .option("--org [name-or-id]", "Organization override (defaults to folder setup)")
  .option("--to [member-id]", "Org member ID to assign")
  .option("--unassign", "Remove the current assignee")
  .action(async (fingerprint, options, { console: output, process: proc }) => {
    if (!options.to && !options.unassign) {
      output.log("Specify --to <member-id> or --unassign");
      return proc.exit(1);
    }

    const { project } = await resolveProject({ project: options.project || undefined, org: options.org || undefined });
    const { safeFetch } = getApiClient();

    const body: { assigneeMemberId?: string | null } = {};
    if (options.unassign) {
      body.assigneeMemberId = null;
    } else if (options.to) {
      body.assigneeMemberId = options.to;
    }

    const res = await safeFetch("/api/v0/projects/:projectId/issues/:fingerprintHash/assignee", {
      method: "PUT",
      params: { projectId: project.id, fingerprintHash: fingerprint },
      body,
    });
    if (res instanceof Error) throw res;

    if (options.unassign) {
      output.log(dim(`Issue ${cyan(fingerprint)} unassigned`));
    } else {
      output.log(green(`Issue ${cyan(fingerprint)} assigned`));
    }
  });

// ── Stacktrace rendering ──────────────────────────────────────────

interface StackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  in_app?: boolean;
}

function renderStacktrace(framesJson?: string, rawStacktrace?: string): string[] {
  // Try structured frames first
  if (framesJson) {
    try {
      const frames: StackFrame[] = JSON.parse(framesJson);
      if (frames.length > 0) {
        return renderStructuredFrames(frames);
      }
    } catch {
      // Invalid JSON, fall through to raw
    }
  }

  // Fall back to raw stacktrace string
  if (rawStacktrace) {
    return rawStacktrace.split("\n").map((line) => `    ${dim(line)}`);
  }

  return [dim("    (no stacktrace available)")];
}

function renderStructuredFrames(frames: StackFrame[]): string[] {
  const lines: string[] = [];
  // Frames are typically bottom-to-top; reverse for most-recent-first display
  const ordered = [...frames].reverse();

  for (const frame of ordered) {
    const fn = frame.function || "<anonymous>";
    const file = frame.filename || frame.abs_path || "<unknown>";
    const loc = frame.lineno != null
      ? frame.colno != null ? `${file}:${frame.lineno}:${frame.colno}` : `${file}:${frame.lineno}`
      : file;

    if (frame.in_app) {
      lines.push(`    ${white("at")} ${bold(fn)} ${cyan(`(${loc})`)}`);
    } else {
      lines.push(`    ${dim(`at ${fn} (${loc})`)}`);
    }
  }

  return lines;
}

/** Parse a value that may be a JS array, JSON array string, or ClickHouse array string */
export function parseClickHouseArray(value?: unknown): string[] {
  if (!value) return [];
  // Already a JS array (Tinybird JSON response)
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  // JSON array string
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // ClickHouse format: ['val1','val2']
    const match = value.match(/^\[(.+)\]$/);
    if (match) {
      return match[1]!.split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    }
  }
  return [];
}
