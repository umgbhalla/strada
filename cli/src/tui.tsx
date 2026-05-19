// Strada TUI — browse issues, logs, traces, and analytics in a Raycast-like terminal UI.
// Launched by the '' (empty) CLI command. Requires Bun (termcast uses OpenTUI Zig FFI).
// Uses zustand/vanilla for global state (view, project, service, time range) persisted
// via termcast LocalStorage so selections survive restarts.
//
// Single dropdown accessory with 3 sections: View, Project, Time Range.
// Service filter is in the action panel (shared across all views via zustand).
// All queries come from tui-queries.ts so they stay in sync with CLI commands.

import {
  Action,
  ActionPanel,
  BarGraph,
  Cache,
  Color,
  Detail,
  Icon,
  List,
  Table,
  showToast,
  Toast,
  useNavigation,
  showFailureToast,
} from "termcast";
import { useCachedPromise } from "@termcast/utils";
import type { ReactNode } from "react";
import { useSyncExternalStore, useEffect, useCallback, useRef } from "react";
import { createStore } from "zustand/vanilla";

import { fetchOrgs, fetchProjects } from "./orgs.ts";
import { getApiClient } from "./api-client.ts";
import type { CachedProject } from "./config.ts";
import {
  queryIssuesList,
  queryIssueDetail,
  queryIssueMetadata,
  queryLogsList,
  queryTracesList,
  queryTraceSpans,
  queryAnalyticsPages,
  queryAnalyticsKpis,
  queryAnalyticsBrowsers,
  queryAnalyticsCountries,
  queryAnalyticsReferrers,
  queryAnalyticsEvents,
  queryAnalyticsRealtime,
  queryServices,
  type IssueRow,
  type IssueMetadata,
  type LogRow,
  type TraceSummaryRow,
  type ServiceRow,
  type AnalyticsPageRow,
  type AnalyticsDimensionRow,
  type AnalyticsEventRow,
} from "./tui-queries.ts";
import {
  buildSpanTree,
  toTraceRow,
  formatDurationMs,
  type SpanNode,
} from "./traces.ts";

// ── Constants ─────────────────────────────────────────────────────

// Icon and Color are Record<string, string> at the type level, so direct access
// returns string|undefined in strict mode. These aliases guarantee string values.
const ICON = {
  bug: Icon.Bug ?? "🐛",
  terminal: Icon.Terminal ?? "📋",
  network: Icon.Network ?? "🔗",
  barChart: Icon.BarChart ?? "📊",
  circleFilled: Icon.CircleFilled ?? "●",
  circle: Icon.Circle ?? "○",
  checkCircle: Icon.CheckCircle ?? "✓",
  eye: Icon.Eye ?? "👁",
  arrowClockwise: Icon.ArrowClockwise ?? "↻",
  speakerOff: Icon.SpeakerOff ?? "🔇",
  document: Icon.Document ?? "📄",
  globe: Icon.Globe ?? "🌐",
  link: Icon.Link ?? "🔗",
  bolt: Icon.Bolt ?? "⚡",
} as const;

type TuiView = "issues" | "analytics" | "logs" | "traces";
type TimeRange = "5m" | "1h" | "6h" | "24h" | "7d" | "30d";

const VIEW_OPTIONS: { id: TuiView; label: string; icon: string }[] = [
  { id: "issues", label: "Issues", icon: ICON.bug },
  { id: "logs", label: "Logs", icon: ICON.terminal },
  { id: "traces", label: "Traces", icon: ICON.network },
  { id: "analytics", label: "Analytics", icon: ICON.barChart },
];

const TIME_OPTIONS: { id: TimeRange; label: string }[] = [
  { id: "5m", label: "Last 5 min" },
  { id: "1h", label: "Last hour" },
  { id: "6h", label: "Last 6 hours" },
  { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

// ── Zustand store ─────────────────────────────────────────────────

interface TuiState {
  view: TuiView;
  projectId: string | null;
  projectSlug: string | null;
  service: string | null;
  timeRange: TimeRange;
}

// Cache is sync (SQLite-backed) and works at module scope because
// the termcast provider sets up extensionPath before the component
// renders. This is different from LocalStorage which is async.
const cache = new Cache({ namespace: "strada-tui" });

function loadPersistedState(): Partial<TuiState> {
  const raw = cache.get("state");
  if (!raw) return {};
  try { return JSON.parse(raw) as Partial<TuiState>; }
  catch { return {}; }
}

const persisted = loadPersistedState();

const store = createStore<TuiState>(() => ({
  view: persisted.view ?? "issues",
  projectId: persisted.projectId ?? null,
  projectSlug: persisted.projectSlug ?? null,
  service: persisted.service ?? null,
  timeRange: persisted.timeRange ?? "24h",
}));

// Persist every state change synchronously
store.subscribe((state) => {
  cache.set("state", JSON.stringify(state));
});

function useStore<T>(selector: (s: TuiState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatTimestamp(ts: string): string {
  const match = ts.match(/(\d{2}:\d{2}:\d{2})/);
  return match ? match[1]! : ts;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(seconds: number): string {
  if (seconds < 0 || Number.isNaN(seconds)) return "0s";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remainS = s % 60;
  if (m < 60) return remainS > 0 ? `${m}m ${remainS}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remainM = m % 60;
  return remainM > 0 ? `${h}h ${remainM}m` : `${h}h`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function parseAttributes(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, string>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

// ── Dropdown ──────────────────────────────────────────────────────

function NavigationDropdown({ projects }: { projects: CachedProject[] }): ReactNode {
  const view = useStore((s) => s.view);
  const projectSlug = useStore((s) => s.projectSlug);
  const projectId = useStore((s) => s.projectId);
  const timeRange = useStore((s) => s.timeRange);

  const viewLabel = VIEW_OPTIONS.find((v) => v.id === view)?.label ?? "Issues";
  const timeLabel = TIME_OPTIONS.find((t) => t.id === timeRange)?.label ?? "24h";
  const displayValue = `${viewLabel} · ${projectSlug ?? "…"} · ${timeLabel}`;

  const handleChange = useCallback((value: string) => {
    if (value.startsWith("view::")) {
      store.setState({ view: value.slice(6) as TuiView });
    } else if (value.startsWith("project::")) {
      const parts = value.slice(9).split("::");
      store.setState({ projectId: parts[0] ?? null, projectSlug: parts[1] ?? null });
    } else if (value.startsWith("time::")) {
      store.setState({ timeRange: value.slice(6) as TimeRange });
    }
  }, []);

  return (
    <List.Dropdown
      tooltip="Navigation"
      value={`view::${view}`}
      displayValue={displayValue}
      onChange={handleChange}
    >
      <List.Dropdown.Section title="View">
        {VIEW_OPTIONS.map((v) => (
          <List.Dropdown.Item
            key={v.id}
            title={v.label}
            value={`view::${v.id}`}
            icon={v.icon}
          />
        ))}
      </List.Dropdown.Section>
      <List.Dropdown.Section title="Project">
        {projects.map((p) => (
          <List.Dropdown.Item
            key={p.id}
            title={p.slug}
            value={`project::${p.id}::${p.slug}`}
            icon={p.id === projectId ? ICON.checkCircle : ICON.circle}
          />
        ))}
      </List.Dropdown.Section>
      <List.Dropdown.Section title="Time Range">
        {TIME_OPTIONS.map((t) => (
          <List.Dropdown.Item
            key={t.id}
            title={t.label}
            value={`time::${t.id}`}
            icon={t.id === timeRange ? ICON.checkCircle : ICON.circle}
          />
        ))}
      </List.Dropdown.Section>
    </List.Dropdown>
  );
}

// ── Service filter actions ────────────────────────────────────────

function ServiceFilterActions({ services, isLoading }: { services: ServiceRow[]; isLoading: boolean }): ReactNode {
  const currentService = useStore((s) => s.service);
  return (
    <ActionPanel.Section title={isLoading ? "Services (loading…)" : "Service"}>
      <Action
        title="All Services"
        icon={currentService ? ICON.circle : ICON.checkCircle}
        onAction={() => store.setState({ service: null })}
      />
      {services.map((s) => (
        <Action
          key={s.serviceName}
          title={s.serviceName}
          icon={s.serviceName === currentService ? ICON.checkCircle : ICON.circle}
          onAction={() => store.setState({ service: s.serviceName })}
        />
      ))}
    </ActionPanel.Section>
  );
}

function CommonActions({ services, servicesLoading, revalidate }: { services: ServiceRow[]; servicesLoading: boolean; revalidate: () => void }): ReactNode {
  return (
    <>
      <ServiceFilterActions services={services} isLoading={servicesLoading} />
      <ActionPanel.Section>
        <Action
          title="Refresh"
          icon={ICON.arrowClockwise}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
          onAction={revalidate}
        />
      </ActionPanel.Section>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ISSUES VIEW
// ═══════════════════════════════════════════════════════════════════

interface ViewProps {
  projectId: string;
  services: ServiceRow[];
  servicesLoading: boolean;
}

function IssuesView({ projectId, services, servicesLoading }: ViewProps): ReactNode {
  const timeRange = useStore((s) => s.timeRange);
  const service = useStore((s) => s.service);
  const { push } = useNavigation();

  const { data, isLoading, revalidate } = useCachedPromise(
    async (pid: string, since: string, svc: string | null) => {
      const issues = await queryIssuesList({ projectId: pid, since, service: svc ?? undefined, limit: 50 });
      const fps = issues.map((i) => i.fingerprintHash);
      const metadata = await queryIssueMetadata(pid, fps);
      return { issues, metadata };
    },
    [projectId, timeRange, service],
  );

  const issues = data?.issues ?? [];
  // useCachedPromise may serialize/deserialize through JSON, which converts
  // Map to a plain object. Handle both cases.
  const rawMeta = data?.metadata;
  const getMeta = (fp: string): IssueMetadata | undefined => {
    if (rawMeta instanceof Map) return rawMeta.get(fp);
    if (rawMeta && typeof rawMeta === "object") return (rawMeta as Record<string, IssueMetadata>)[fp];
    return undefined;
  };

  return (
    <>
      {issues.map((issue: IssueRow) => {
        const meta = getMeta(issue.fingerprintHash);
        const status = meta?.status || "open";
        const hasUnhandled = issue.unhandledCount > 0;

        let iconColor = Color.Orange;
        if (status === "resolved") iconColor = Color.Green;
        else if (status === "muted" || status === "ignored") iconColor = Color.SecondaryText;
        else if (hasUnhandled) iconColor = Color.Red;

        const title = truncate(
          [issue.lastType, issue.lastMessage].filter(Boolean).join(": ") || "(unknown error)",
          80,
        );

        const accessories: { text?: string; tag?: string | { value: string; color?: string } }[] = [
          { tag: { value: formatCount(issue.eventCount), color: Color.Orange } },
        ];
        if (hasUnhandled) accessories.push({ tag: { value: "unhandled", color: Color.Red } });
        if (status !== "open") {
          accessories.push({ tag: { value: status, color: status === "resolved" ? Color.Green : Color.SecondaryText } });
        }
        accessories.push({ text: timeAgo(issue.lastSeen) });

        return (
          <List.Item
            key={issue.fingerprintHash}
            title={title}
            subtitle={issue.lastLevel || "error"}
            icon={{ source: ICON.circleFilled, tintColor: iconColor }}
            accessories={accessories}
            detail={
              <List.Item.Detail
                markdown={`**${issue.lastType || "Error"}**: ${issue.lastMessage || "(no message)"}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Events" text={String(issue.eventCount)} />
                    <List.Item.Detail.Metadata.Label title="Unhandled" text={String(issue.unhandledCount)} />
                    <List.Item.Detail.Metadata.Label title="First seen" text={timeAgo(issue.firstSeen)} />
                    <List.Item.Detail.Metadata.Label title="Last seen" text={timeAgo(issue.lastSeen)} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label title="Status" text={{ value: status, color: status === "open" ? Color.Red : Color.Green }} />
                    <List.Item.Detail.Metadata.Label title="Fingerprint" text={issue.fingerprintHash.slice(0, 16) + "…"} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action title="View Issue" icon={ICON.eye} onAction={() => push(<IssueDetailView projectId={projectId} fingerprint={issue.fingerprintHash} />)} />
                <Action
                  title="Resolve"
                  icon={ICON.checkCircle}
                  shortcut={{ modifiers: ["ctrl"], key: "r" }}
                  onAction={async () => {
                    const { safeFetch } = getApiClient();
                    const res = await safeFetch("/api/v0/projects/:projectId/issues/:fingerprintHash/status", { method: "PUT", params: { projectId, fingerprintHash: issue.fingerprintHash }, body: { status: "resolved" } });
                    if (res instanceof Error) { await showFailureToast(res); return; }
                    await showToast({ style: Toast.Style.Success, title: "Resolved" });
                    revalidate();
                  }}
                />
                <Action
                  title="Mute"
                  icon={ICON.speakerOff}
                  shortcut={{ modifiers: ["ctrl"], key: "m" }}
                  onAction={async () => {
                    const { safeFetch } = getApiClient();
                    const res = await safeFetch("/api/v0/projects/:projectId/issues/:fingerprintHash/status", { method: "PUT", params: { projectId, fingerprintHash: issue.fingerprintHash }, body: { status: "muted" } });
                    if (res instanceof Error) { await showFailureToast(res); return; }
                    await showToast({ style: Toast.Style.Success, title: "Muted" });
                    revalidate();
                  }}
                />
                <ActionPanel.Section title="Copy">
                  <Action.CopyToClipboard title="Copy Fingerprint" content={issue.fingerprintHash} />
                </ActionPanel.Section>
                <CommonActions services={services} servicesLoading={servicesLoading} revalidate={revalidate} />
              </ActionPanel>
            }
          />
        );
      })}
    </>
  );
}

interface StackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  in_app?: boolean;
}

/** Render stacktrace as markdown, preferring structured frames over raw text */
function renderStacktraceMarkdown(framesJson?: string, rawStacktrace?: string): string {
  if (framesJson) {
    try {
      const frames: StackFrame[] = JSON.parse(framesJson);
      if (frames.length > 0) {
        const ordered = [...frames].reverse();
        const lines: string[] = [];
        for (const frame of ordered) {
          const fn = frame.function || "<anonymous>";
          const file = frame.filename || frame.abs_path || "<unknown>";
          const loc = frame.lineno != null
            ? frame.colno != null ? `${file}:${frame.lineno}:${frame.colno}` : `${file}:${frame.lineno}`
            : file;
          if (frame.in_app) {
            lines.push(`  ▸ **${fn}** \`${loc}\`  ← in-app`);
          } else {
            lines.push(`    at ${fn} (${loc})`);
          }
        }
        return lines.join("\n");
      }
    } catch {
      // Invalid JSON, fall through to raw
    }
  }

  if (rawStacktrace) {
    return "```\n" + rawStacktrace.slice(0, 3000) + "\n```";
  }

  return "*(no stacktrace available)*";
}

function IssueDetailView({ projectId, fingerprint }: { projectId: string; fingerprint: string }): ReactNode {
  const { data, isLoading } = useCachedPromise(
    async (pid: string, fp: string) => queryIssueDetail({ projectId: pid, fingerprint: fp, eventsLimit: 10 }),
    [projectId, fingerprint],
  );

  if (isLoading || !data?.summary) {
    return <Detail markdown="Loading…" navigationTitle="Loading…" />;
  }

  const s = data.summary;
  const latestEvent = data.events[0];

  const markdown = [
    `# ${s.lastType || "Error"}: ${s.lastMessage || "(no message)"}`,
    "",
    "## Stacktrace",
    "",
    renderStacktraceMarkdown(latestEvent?.exceptionFrames, latestEvent?.exceptionStacktrace),
    "",
    `## Recent Events (${data.events.length})`,
    "",
    "| Time | Service | Release | Trace |",
    "|------|---------|---------|-------|",
    ...data.events.map((e: typeof data.events[number]) => {
      const ts = e.timestamp.replace("T", " ").replace(/\.\d+Z?$/, "");
      return `| ${ts} | ${e.serviceName} | ${e.release || "—"} | ${e.traceId ? e.traceId.slice(0, 12) + "…" : "—"} |`;
    }),
  ].join("\n");

  return (
    <Detail
      navigationTitle={`${s.lastType}: ${truncate(s.lastMessage, 40)}`}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Events" text={String(s.eventCount)} />
          <Detail.Metadata.Label title="Unhandled" text={String(s.unhandledCount)} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="First seen" text={s.firstSeen} />
          <Detail.Metadata.Label title="Last seen" text={s.lastSeen} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Mechanism" text={s.lastMechanism || "generic"} />
          <Detail.Metadata.Label title="Handled" text={{ value: s.lastHandled === "true" ? "Yes" : "No", color: s.lastHandled === "true" ? Color.Green : Color.Red }} />
          {s.services.length > 0 && (
            <Detail.Metadata.TagList title="Services">
              {s.services.map((svc: string) => <Detail.Metadata.TagList.Item key={svc} text={svc} color={Color.Blue} />)}
            </Detail.Metadata.TagList>
          )}
          {s.releases.length > 0 && (
            <Detail.Metadata.TagList title="Releases">
              {s.releases.map((r: string) => <Detail.Metadata.TagList.Item key={r} text={r} color={Color.Purple} />)}
            </Detail.Metadata.TagList>
          )}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Fingerprint" text={fingerprint} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Fingerprint" content={fingerprint} />
          {latestEvent?.traceId ? <Action.CopyToClipboard title="Copy Trace ID" content={latestEvent.traceId} /> : null}
        </ActionPanel>
      }
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOGS VIEW
// ═══════════════════════════════════════════════════════════════════

const SEVERITY_COLORS: Record<string, string> = {
  FATAL: Color.Red,
  ERROR: Color.Red,
  WARN: Color.Yellow,
  INFO: Color.Blue,
  DEBUG: Color.SecondaryText,
  TRACE: Color.SecondaryText,
};

function LogsView({ projectId, services, servicesLoading }: ViewProps): ReactNode {
  const timeRange = useStore((s) => s.timeRange);
  const service = useStore((s) => s.service);
  const { push } = useNavigation();

  const { data, isLoading, revalidate } = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryLogsList({ projectId: pid, since, service: svc ?? undefined, limit: 200 }),
    [projectId, timeRange, service],
  );

  const logs = data ?? [];

  return (
    <>
      {logs.map((log: LogRow, i: number) => {
        const severity = (log.severityText || "INFO").toUpperCase();
        const iconColor = SEVERITY_COLORS[severity] ?? Color.SecondaryText;
        const attrs = parseAttributes(log.logAttributes);

        return (
          <List.Item
            key={`${log.timestamp}-${i}`}
            title={truncate(log.body || "(empty)", 80)}
            subtitle={`[${log.serviceName}]`}
            icon={{ source: ICON.circleFilled, tintColor: iconColor }}
            accessories={[
              { tag: { value: severity, color: iconColor } },
              { text: formatTimestamp(log.timestamp) },
            ]}
            keywords={[log.body, log.serviceName, severity]}
            detail={
              <List.Item.Detail
                markdown={log.body || "(empty log)"}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Severity" text={{ value: severity, color: iconColor }} />
                    <List.Item.Detail.Metadata.Label title="Service" text={log.serviceName} />
                    <List.Item.Detail.Metadata.Label title="Timestamp" text={log.timestamp} />
                    <List.Item.Detail.Metadata.Separator />
                    {log.traceId ? <List.Item.Detail.Metadata.Label title="TraceId" text={log.traceId} /> : null}
                    {log.spanId ? <List.Item.Detail.Metadata.Label title="SpanId" text={log.spanId} /> : null}
                    {Object.keys(attrs).length > 0 ? <List.Item.Detail.Metadata.Separator /> : null}
                    {Object.entries(attrs).slice(0, 15).map(([k, v]) => (
                      <List.Item.Detail.Metadata.Label key={k} title={k} text={truncate(String(v), 60)} />
                    ))}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action title="View Full Log" icon={ICON.eye} onAction={() => push(<LogDetailView log={log} />)} />
                <ActionPanel.Section title="Copy">
                  <Action.CopyToClipboard title="Copy Body" content={log.body} />
                  {log.traceId ? <Action.CopyToClipboard title="Copy Trace ID" content={log.traceId} /> : null}
                </ActionPanel.Section>
                <CommonActions services={services} servicesLoading={servicesLoading} revalidate={revalidate} />
              </ActionPanel>
            }
          />
        );
      })}
    </>
  );
}

function LogDetailView({ log }: { log: LogRow }): ReactNode {
  const attrs = parseAttributes(log.logAttributes);
  const attrEntries = Object.entries(attrs);

  const markdown = [
    "# Log Record",
    "",
    "## Body",
    "```",
    log.body,
    "```",
    ...(attrEntries.length > 0
      ? [
          "",
          "## Attributes",
          "| Key | Value |",
          "|-----|-------|",
          ...attrEntries.map(([k, v]) => `| ${k} | ${truncate(String(v), 80)} |`),
        ]
      : []),
  ].join("\n");

  const severityColor = SEVERITY_COLORS[(log.severityText || "INFO").toUpperCase()] ?? Color.SecondaryText;

  return (
    <Detail
      navigationTitle={truncate(log.body, 40)}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Severity" text={{ value: log.severityText || "INFO", color: severityColor }} />
          <Detail.Metadata.Label title="Service" text={log.serviceName} />
          <Detail.Metadata.Label title="Timestamp" text={log.timestamp} />
          <Detail.Metadata.Separator />
          {log.traceId ? <Detail.Metadata.Label title="TraceId" text={log.traceId} /> : null}
          {log.spanId ? <Detail.Metadata.Label title="SpanId" text={log.spanId} /> : null}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Body" content={log.body} />
          {log.traceId ? <Action.CopyToClipboard title="Copy Trace ID" content={log.traceId} /> : null}
        </ActionPanel>
      }
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRACES VIEW
// ═══════════════════════════════════════════════════════════════════

function TracesView({ projectId, services, servicesLoading }: ViewProps): ReactNode {
  const timeRange = useStore((s) => s.timeRange);
  const service = useStore((s) => s.service);
  const { push } = useNavigation();

  const { data, isLoading, revalidate } = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryTracesList({ projectId: pid, since, service: svc ?? undefined, limit: 50 }),
    [projectId, timeRange, service],
  );

  const traces = data ?? [];

  return (
    <>
      {traces.map((trace: TraceSummaryRow) => {
        const hasErrors = trace.errorSpanCount > 0;
        const iconColor = hasErrors ? Color.Red : Color.Green;
        const durationMs = trace.durationNs / 1_000_000;

        const accessories: { text?: string; tag?: string | { value: string; color?: string } }[] = [
          { tag: { value: `${trace.spanCount} spans`, color: Color.SecondaryText } },
        ];
        if (hasErrors) {
          accessories.push({ tag: { value: `${trace.errorSpanCount} err`, color: Color.Red } });
        }
        accessories.push({ text: formatDurationMs(durationMs) });
        accessories.push({ text: timeAgo(trace.startTime) });

        return (
          <List.Item
            key={trace.traceId}
            title={trace.rootSpanName || "(no root span)"}
            subtitle={trace.services.join(", ")}
            icon={{ source: ICON.circleFilled, tintColor: iconColor }}
            accessories={accessories}
            keywords={[trace.rootSpanName, ...trace.services, trace.traceId]}
            detail={
              <List.Item.Detail
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Trace ID" text={trace.traceId} />
                    <List.Item.Detail.Metadata.Label title="Duration" text={formatDurationMs(durationMs)} />
                    <List.Item.Detail.Metadata.Label title="Spans" text={String(trace.spanCount)} />
                    <List.Item.Detail.Metadata.Label title="Errors" text={{ value: String(trace.errorSpanCount), color: hasErrors ? Color.Red : Color.Green }} />
                    <List.Item.Detail.Metadata.Label title="Start" text={trace.startTime} />
                    <List.Item.Detail.Metadata.Separator />
                    {trace.services.length > 0 && (
                      <List.Item.Detail.Metadata.TagList title="Services">
                        {trace.services.map((svc: string) => (
                          <List.Item.Detail.Metadata.TagList.Item key={svc} text={svc} color={Color.Blue} />
                        ))}
                      </List.Item.Detail.Metadata.TagList>
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action title="View Span Tree" icon={ICON.eye} onAction={() => push(<SpanTreeView projectId={projectId} traceId={trace.traceId} />)} />
                <ActionPanel.Section title="Copy">
                  <Action.CopyToClipboard title="Copy Trace ID" content={trace.traceId} />
                </ActionPanel.Section>
                <CommonActions services={services} servicesLoading={servicesLoading} revalidate={revalidate} />
              </ActionPanel>
            }
          />
        );
      })}
    </>
  );
}

// ── Span Tree View (pushed from trace list) ───────────────────────

interface FlatSpan {
  span: SpanNode;
  displayPrefix: string;
}

function flattenSpanTree(rootSpans: SpanNode[]): FlatSpan[] {
  const result: FlatSpan[] = [];

  function visit(span: SpanNode, prefix: string, isLast: boolean, isRoot: boolean) {
    const branch = isRoot ? "· " : isLast ? "└─· " : "├─· ";
    const childPrefix = isRoot ? "" : prefix + (isLast ? "  " : "│ ");
    result.push({ span, displayPrefix: prefix + branch });
    span.children.forEach((child, i) => {
      visit(child, childPrefix, i === span.children.length - 1, false);
    });
  }

  rootSpans.forEach((root, i) => {
    visit(root, "", i === rootSpans.length - 1, rootSpans.length === 1);
  });
  return result;
}

function SpanTreeView({ projectId, traceId }: { projectId: string; traceId: string }): ReactNode {
  const { push } = useNavigation();

  const { data, isLoading } = useCachedPromise(
    async (pid: string, tid: string) => {
      const res = await queryTraceSpans({ projectId: pid, traceId: tid });
      const rows = (res.data ?? []).map((row) => toTraceRow(row as Record<string, unknown>));
      const tree = buildSpanTree(rows);
      return { tree, flat: flattenSpanTree(tree.rootSpans) };
    },
    [projectId, traceId],
  );

  const flat = data?.flat ?? [];

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={true}
      navigationTitle={`Trace ${traceId.slice(0, 16)}…`}
      searchBarPlaceholder="Search spans…"
    >
      {flat.map(({ span, displayPrefix }: FlatSpan, i: number) => {
        const isError = span.statusCode === "Error";
        const iconColor = isError ? Color.Red : span.statusCode === "Ok" ? Color.Green : Color.SecondaryText;
        const durationStr = formatDurationMs(span.durationMs);

        const accessories: { text?: string; tag?: string | { value: string; color?: string } }[] = [
          { text: durationStr },
        ];
        if (isError) {
          accessories.unshift({ tag: { value: "ERROR", color: Color.Red } });
        }

        return (
          <List.Item
            key={`${span.spanId}-${i}`}
            title={`${displayPrefix}${span.spanName}`}
            subtitle={span.serviceName}
            icon={{ source: ICON.circleFilled, tintColor: iconColor }}
            accessories={accessories}
            keywords={[span.spanName, span.serviceName, span.spanId]}
            detail={
              <List.Item.Detail
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Span" text={span.spanId} />
                    <List.Item.Detail.Metadata.Label title="Service" text={span.serviceName} />
                    <List.Item.Detail.Metadata.Label title="Kind" text={span.spanKind || "Unset"} />
                    <List.Item.Detail.Metadata.Label title="Duration" text={durationStr} />
                    <List.Item.Detail.Metadata.Label title="Status" text={{ value: span.statusCode || "Unset", color: iconColor }} />
                    {span.statusMessage ? <List.Item.Detail.Metadata.Label title="Message" text={span.statusMessage} /> : null}
                    <List.Item.Detail.Metadata.Separator />
                    {Object.entries(span.spanAttributes)
                      .filter(([, v]) => v !== "")
                      .slice(0, 15)
                      .map(([k, v]) => (
                        <List.Item.Detail.Metadata.Label key={k} title={k} text={truncate(String(v), 60)} />
                      ))}
                    {span.events.length > 0 ? (
                      <>
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.Label title="Events" text={String(span.events.length)} />
                        {span.events.slice(0, 3).map((evt, ei) => (
                          <List.Item.Detail.Metadata.Label
                            key={`evt-${ei}`}
                            title={evt.name}
                            text={evt.attributes["exception.message"]
                              ? truncate(evt.attributes["exception.message"], 50)
                              : formatTimestamp(evt.timestamp)}
                          />
                        ))}
                      </>
                    ) : null}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action title="View Full Span" icon={ICON.eye} onAction={() => push(<SpanDetailView span={span} />)} />
                <ActionPanel.Section title="Copy">
                  <Action.CopyToClipboard title="Copy Span ID" content={span.spanId} />
                  <Action.CopyToClipboard title="Copy Trace ID" content={span.traceId} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function SpanDetailView({ span }: { span: SpanNode }): ReactNode {
  const allAttrs = Object.entries(span.spanAttributes).filter(([, v]) => v !== "");
  const resourceAttrs = Object.entries(span.resourceAttributes).filter(([, v]) => v !== "");

  const markdown = [
    `# ${span.spanName}`,
    "",
    `**Service:** ${span.serviceName}  `,
    `**Duration:** ${formatDurationMs(span.durationMs)}  `,
    `**Status:** ${span.statusCode || "Unset"}${span.statusMessage ? ` — ${span.statusMessage}` : ""}`,
    ...(allAttrs.length > 0 ? ["", "## Span Attributes", "| Key | Value |", "|-----|-------|", ...allAttrs.map(([k, v]) => `| ${k} | ${truncate(String(v), 80)} |`)] : []),
    ...(resourceAttrs.length > 0 ? ["", "## Resource Attributes", "| Key | Value |", "|-----|-------|", ...resourceAttrs.map(([k, v]) => `| ${k} | ${truncate(String(v), 80)} |`)] : []),
    ...(span.events.length > 0 ? ["", "## Events", ...span.events.map((evt) => [`### ${evt.name}`, ...Object.entries(evt.attributes).map(([k, v]) => `- **${k}:** ${truncate(String(v), 200)}`)].join("\n"))] : []),
  ].join("\n");

  return (
    <Detail
      navigationTitle={`${span.spanName} (${span.spanId.slice(0, 8)})`}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Span ID" text={span.spanId} />
          <Detail.Metadata.Label title="Trace ID" text={span.traceId} />
          {span.parentSpanId ? <Detail.Metadata.Label title="Parent" text={span.parentSpanId} /> : null}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Kind" text={span.spanKind || "Unset"} />
          <Detail.Metadata.Label title="Duration" text={formatDurationMs(span.durationMs)} />
          <Detail.Metadata.Label title="Start" text={span.startTime} />
          {span.scopeName ? <Detail.Metadata.Label title="Scope" text={`${span.scopeName}${span.scopeVersion ? `@${span.scopeVersion}` : ""}`} /> : null}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Span ID" content={span.spanId} />
          <Action.CopyToClipboard title="Copy Trace ID" content={span.traceId} />
        </ActionPanel>
      }
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS VIEW
// ═══════════════════════════════════════════════════════════════════

function AnalyticsView({ projectId, services, servicesLoading }: ViewProps): ReactNode {
  const timeRange = useStore((s) => s.timeRange);
  const service = useStore((s) => s.service);

  const kpis = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryAnalyticsKpis({ projectId: pid, since, service: svc ?? undefined }),
    [projectId, timeRange, service],
  );

  const pages = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryAnalyticsPages({ projectId: pid, since, service: svc ?? undefined, limit: 10 }),
    [projectId, timeRange, service],
  );

  const browsers = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryAnalyticsBrowsers({ projectId: pid, since, service: svc ?? undefined, limit: 10 }),
    [projectId, timeRange, service],
  );

  const countries = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryAnalyticsCountries({ projectId: pid, since, service: svc ?? undefined, limit: 10 }),
    [projectId, timeRange, service],
  );

  const referrers = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryAnalyticsReferrers({ projectId: pid, since, service: svc ?? undefined, limit: 10 }),
    [projectId, timeRange, service],
  );

  const events = useCachedPromise(
    async (pid: string, since: string, svc: string | null) =>
      queryAnalyticsEvents({ projectId: pid, since, service: svc ?? undefined, limit: 10 }),
    [projectId, timeRange, service],
  );

  const realtime = useCachedPromise(
    async (pid: string, _since: string, svc: string | null) =>
      queryAnalyticsRealtime({ projectId: pid, service: svc ?? undefined }),
    [projectId, timeRange, service],
  );

  const revalidateAll = useCallback(() => {
    kpis.revalidate();
    pages.revalidate();
    browsers.revalidate();
    countries.revalidate();
    referrers.revalidate();
    events.revalidate();
    realtime.revalidate();
  }, [kpis, pages, browsers, countries, referrers, events, realtime]);

  const cards: { id: string; title: string; icon: (typeof Icon)[keyof typeof Icon]; detail: ReactNode }[] = [
    {
      id: "kpis",
      title: "KPIs",
      icon: ICON.barChart,
      detail: (
        <List.Item.Detail
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Visitors" text={kpis.data ? formatCount(kpis.data.visitors) : "…"} />
              <List.Item.Detail.Metadata.Label title="Pageviews" text={kpis.data ? formatCount(kpis.data.pageviews) : "…"} />
              <List.Item.Detail.Metadata.Label title="Sessions" text={kpis.data ? formatCount(kpis.data.sessions) : "…"} />
              <List.Item.Detail.Metadata.Label title="Bounce Rate" text={kpis.data ? `${(kpis.data.bounceRate * 100).toFixed(1)}%` : "…"} />
              <List.Item.Detail.Metadata.Label title="Avg Duration" text={kpis.data ? formatDuration(kpis.data.avgDurationSec) : "…"} />
            </List.Item.Detail.Metadata>
          }
        />
      ),
    },
    {
      id: "realtime",
      title: "Realtime",
      icon: ICON.eye,
      detail: (
        <List.Item.Detail
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Active Visitors (5 min)" text={{ value: realtime.data != null ? formatCount(realtime.data) : "…", color: Color.Green }} />
            </List.Item.Detail.Metadata>
          }
        />
      ),
    },
    {
      id: "pages",
      title: "Top Pages",
      icon: ICON.document,
      detail: (
        <List.Item.Detail
          metadata={
            <Table
              headers={["Page", "Views", "Visitors"]}
              rows={(pages.data ?? []).map((p: AnalyticsPageRow) => [truncate(p.pathname, 30), formatCount(p.pageviews), formatCount(p.visitors)])}
            />
          }
        />
      ),
    },
    {
      id: "browsers",
      title: "Top Browsers",
      icon: ICON.globe,
      detail: (
        <List.Item.Detail
          metadata={
            <Table
              headers={["Browser", "Visitors", "Views"]}
              rows={(browsers.data ?? []).map((b: AnalyticsDimensionRow) => [b.name, formatCount(b.visitors), formatCount(b.pageviews)])}
            />
          }
        />
      ),
    },
    {
      id: "countries",
      title: "Top Countries",
      icon: ICON.globe,
      detail: (
        <List.Item.Detail
          metadata={
            <Table
              headers={["Country", "Visitors", "Views"]}
              rows={(countries.data ?? []).map((c: AnalyticsDimensionRow) => [c.name, formatCount(c.visitors), formatCount(c.pageviews)])}
            />
          }
        />
      ),
    },
    {
      id: "referrers",
      title: "Top Referrers",
      icon: ICON.link,
      detail: (
        <List.Item.Detail
          metadata={
            <Table
              headers={["Referrer", "Visitors", "Views"]}
              rows={(referrers.data ?? []).map((r: AnalyticsDimensionRow) => [truncate(r.name, 30), formatCount(r.visitors), formatCount(r.pageviews)])}
            />
          }
        />
      ),
    },
    {
      id: "events",
      title: "Custom Events",
      icon: ICON.bolt,
      detail: (
        <List.Item.Detail
          metadata={
            <Table
              headers={["Event", "Count", "Sessions"]}
              rows={(events.data ?? []).map((e: AnalyticsEventRow) => [e.eventName, formatCount(e.occurrences), formatCount(e.uniqueSessions)])}
            />
          }
        />
      ),
    },
  ];

  return (
    <>
      {cards.map((card) => (
        <List.Item
          key={card.id}
          title={card.title}
          icon={card.icon}
          detail={card.detail}
          actions={
            <ActionPanel>
              <CommonActions services={services} servicesLoading={servicesLoading} revalidate={revalidateAll} />
            </ActionPanel>
          }
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function StradaTui(): ReactNode {
  const view = useStore((s) => s.view);
  const projectId = useStore((s) => s.projectId);
  const projectSlug = useStore((s) => s.projectSlug);
  const timeRange = useStore((s) => s.timeRange);

  const { data: orgData, isLoading: orgLoading } = useCachedPromise(async () => {
    const orgs = await fetchOrgs();
    if (orgs.length === 0) return { org: null, projects: [] as CachedProject[] };
    const org = orgs[0]!;
    const projects = await fetchProjects(org.id);
    return { org, projects };
  }, []);

  const projects = orgData?.projects ?? [];

  // Auto-select first project if none selected
  useEffect(() => {
    if (!projectId && projects.length > 0) {
      const first = projects[0]!;
      store.setState({ projectId: first.id, projectSlug: first.slug });
    }
  }, [projectId, projects]);

  // Fetch services async (never blocks views)
  const { data: servicesData, isLoading: servicesLoading } = useCachedPromise(
    async (pid: string | null, since: string) => {
      if (!pid) return [];
      return queryServices({ projectId: pid, since });
    },
    [projectId, timeRange],
  );
  const services = servicesData ?? [];

  const isLoading = orgLoading || !projectId;

  // TODO: Use AI to generate SQL WHERE clause from natural language search query.
  // For now, search filters client-side on List.Item title/keywords.

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={true}
      searchBarPlaceholder="Search…"
      searchBarAccessory={<NavigationDropdown projects={projects} />}
    >
      {projectId && view === "issues" && (
        <IssuesView projectId={projectId} services={services} servicesLoading={servicesLoading} />
      )}
      {projectId && view === "logs" && (
        <LogsView projectId={projectId} services={services} servicesLoading={servicesLoading} />
      )}
      {projectId && view === "traces" && (
        <TracesView projectId={projectId} services={services} servicesLoading={servicesLoading} />
      )}
      {projectId && view === "analytics" && (
        <AnalyticsView projectId={projectId} services={services} servicesLoading={servicesLoading} />
      )}
    </List>
  );
}
