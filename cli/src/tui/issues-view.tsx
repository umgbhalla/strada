// TUI issues view — list of grouped errors with detail panel, plus
// IssueDetailView pushed on action for full stacktrace and event history.

import {
  Action,
  ActionPanel,
  BarGraph,
  Color,
  Detail,
  List,
  showToast,
  Toast,
  useNavigation,
  showFailureToast,
} from "termcast";
import { useCachedPromise } from "@termcast/utils";
import type { ReactNode } from "react";
import { useCallback } from "react";

import { getApiClient } from "../api-client.ts";
import {
  queryIssuesList,
  queryIssueDetail,
  queryIssueMetadata,
  queryIssuesFrequency,
  type IssueRow,
  type IssueMetadata,
  type IssueFrequencyBucket,
  type AiFilterResult,
} from "../tui-queries.ts";
import { store, useStore, ICON } from "./store.ts";
import { timeAgo, truncate, formatCount, useAiSearch } from "./helpers.ts";
import { NavigationDropdown, CommonActions, useNavigationTitle, type ViewProps } from "./shared.tsx";

// ── Stacktrace rendering ─────────────────────────────────────────

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
            lines.push(`  ▸ **${fn}** \`${loc}\``);
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

// ── Issues list view ──────────────────────────────────────────────

// Use terminal height as page size so the first page fills the visible area.
const ISSUES_PAGE_SIZE = Math.max(10, (process.stdout.rows || 30) - 5);

// The list detail panel is roughly half the terminal width minus padding.
// Compute bar width so 30 daily bars fill the available space.
const FREQUENCY_DAYS = 30;
const FREQ_BAR_GAP = 1;
const DETAIL_WIDTH = Math.floor((process.stdout.columns || 120) / 2) - 4;
// Reserve ~6 cols for Y-axis labels + separator
const FREQ_PLOT_WIDTH = DETAIL_WIDTH - 6;
// Each bar slot is barWidth + gap, so barWidth = floor(slotWidth) - gap
const FREQ_BAR_WIDTH = Math.max(1, Math.floor(FREQ_PLOT_WIDTH / FREQUENCY_DAYS) - FREQ_BAR_GAP);

export function IssuesView({ projectId, projects, services, servicesLoading, isLoading: parentLoading }: ViewProps): ReactNode {
  const service = useStore((s) => s.service);
  const { push } = useNavigation();
  const navigationTitle = useNavigationTitle();

  const probe = useCallback(
    async (filter: AiFilterResult) => { await queryIssuesList({ projectId, aiFilter: filter, limit: 1 }); },
    [projectId],
  );
  const aiSearch = useAiSearch({ projectId, view: "issues", probe });

  // Serialize aiFilter to a stable string for useCachedPromise dependency tracking.
  // The callback parses it back from the arg so it never captures a stale closure.
  const aiFilterKey = aiSearch.aiFilter ? JSON.stringify(aiSearch.aiFilter) : "";

  const { data, isLoading, revalidate, pagination } = useCachedPromise(
    (pid: string, svc: string | null, filterKey: string) =>
      async ({ page }: { page: number }) => {
        const aiFilter: AiFilterResult | undefined = filterKey ? JSON.parse(filterKey) : undefined;
        const t0 = performance.now();
        const result = await queryIssuesList({
          projectId: pid,
          service: svc ?? undefined,
          limit: ISSUES_PAGE_SIZE,
          offset: page * ISSUES_PAGE_SIZE,
          aiFilter,
        });
        // Fetch metadata and frequency for the current page's fingerprints.
        // Flatten into each item so it survives JSON serialization
        // (useCachedPromise caches via JSON, and Map serializes to {}).
        const fps = result.data.map((i) => i.fingerprintHash);
        const [metadataMap, frequencyMap] = fps.length > 0
          ? await Promise.all([queryIssueMetadata(pid, fps), queryIssuesFrequency(pid, fps)])
          : [new Map<string, IssueMetadata>(), new Map<string, IssueFrequencyBucket[]>()];
        store.setState({ lastQueryMs: Math.round(performance.now() - t0) });
        return {
          data: result.data.map((issue) => ({
            issue,
            metadata: metadataMap.get(issue.fingerprintHash),
            frequency: frequencyMap.get(issue.fingerprintHash) || [],
          })),
          hasMore: result.hasMore,
        };
      },
    [projectId, service, aiFilterKey],
    { keepPreviousData: true },
  );

  const items: { issue: IssueRow; metadata?: IssueMetadata; frequency: IssueFrequencyBucket[] }[] = data ?? [];
  const issues = items.map((item) => item.issue);
  const getItem = (fp: string) => items.find((item) => item.issue.fingerprintHash === fp);

  return (
    <List
      isLoading={isLoading || parentLoading || aiSearch.isSearching}
      isShowingDetail={true}
      filtering={false}
      // accessoryTagsLayout={[ 10,10,16,16]}
      navigationTitle={navigationTitle}
      onSearchTextChange={aiSearch.onSearchTextChange}
      searchBarPlaceholder="unresolved since last week, service api…"
      pagination={pagination ? { pageSize: ISSUES_PAGE_SIZE, hasMore: pagination.hasMore, onLoadMore: pagination.onLoadMore } : undefined}
      searchBarAccessory={<NavigationDropdown projects={projects} />}
    >
      {issues.map((issue: IssueRow) => {
        const item = getItem(issue.fingerprintHash);
        const meta = item?.metadata;
        const status = meta?.status || "open";
        const hasUnhandled = issue.unhandledCount > 0;
        const freq = item?.frequency?.length ? buildFrequencyData(item.frequency) : null;

        let iconColor = Color.Orange;
        if (status === "resolved") iconColor = Color.Green;
        else if (status === "muted" || status === "ignored") iconColor = Color.SecondaryText;
        else if (hasUnhandled) iconColor = Color.Red;

        const title = truncate(
          [issue.lastType, issue.lastMessage].filter(Boolean).join(": ") || "(unknown error)",
          80,
        );

        // Show level, method, and URL as subtitle so users see where errors happened at a glance.
        // Prefer http.route over url.path when available (route is more concise, e.g. /users/:id).
        const subtitleParts = [issue.lastLevel || "error"];
        const urlLabel = [issue.lastHttpMethod, issue.lastHttpRoute || issue.lastUrlPath].filter(Boolean).join(" ");
        if (urlLabel) subtitleParts.push(urlLabel);
        const subtitle = subtitleParts.join(" · ");

        // Fixed-length accessories: every item must have the same count.
        // Use empty tag values to omit visually while keeping alignment.
        const accessories: { text?: string; tag?: string | { value: string; color?: string } }[] = [
          { tag: { value: formatCount(issue.eventCount), color: Color.Orange } },
          hasUnhandled ? { tag: { value: "unhandled", color: Color.Red } } : { tag: "" },
          status !== "open" ? { tag: { value: status, color: status === "resolved" ? Color.Green : Color.SecondaryText } } : { tag: "" },
          { text: timeAgo(issue.lastSeen) },
        ];

        return (
          <List.Item
            key={issue.fingerprintHash}
            title={title}
            subtitle={subtitle}
            icon={{ source: ICON.circleFilled, tintColor: iconColor }}
            accessories={accessories}
            detail={
              <List.Item.Detail
                markdown={[
                  `**${issue.lastType || "Error"}**: ${issue.lastMessage || "(no message)"}`,
                  "",
                  renderStacktraceMarkdown(issue.lastFrames, issue.lastStacktrace),
                ].join("\n")}
                metadata={
                  <>
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="Events" text={String(issue.eventCount)} />
                      <List.Item.Detail.Metadata.Label title="Unhandled" text={String(issue.unhandledCount)} />
                      <List.Item.Detail.Metadata.Label title="First seen" text={timeAgo(issue.firstSeen)} />
                      <List.Item.Detail.Metadata.Label title="Last seen" text={timeAgo(issue.lastSeen)} />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label title="Status" text={{ value: status, color: status === "open" ? Color.Red : Color.Green }} />
                      {issue.lastServiceName ? <List.Item.Detail.Metadata.Label title="Service" text={issue.lastServiceName} /> : null}
                      {issue.lastHttpMethod ? <List.Item.Detail.Metadata.Label title="Method" text={issue.lastHttpMethod} /> : null}
                      {issue.lastHttpRoute ? <List.Item.Detail.Metadata.Label title="Route" text={issue.lastHttpRoute} /> : null}
                      {issue.lastUrlPath ? <List.Item.Detail.Metadata.Label title="URL" text={issue.lastUrlPath} /> : null}
                      {issue.lastEnvironment ? <List.Item.Detail.Metadata.Label title="Env" text={issue.lastEnvironment} /> : null}
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label title="Fingerprint" text={issue.fingerprintHash.slice(0, 16) + "…"} />
                    </List.Item.Detail.Metadata>
                    {freq && (
                      <BarGraph
                        height={6}
                        labels={freq.labels}
                        barWidth={FREQ_BAR_WIDTH}
                        barGap={FREQ_BAR_GAP}
                        showYAxis={true}
                        yTicks={3}
                        showLegend={false}
                        marginTop={2}
                      >
                        <BarGraph.Series data={freq.data} color={Color.Red} />
                      </BarGraph>
                    )}
                  </>
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
    </List>
  );
}

// ── Issue detail view (pushed) ────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Build a full 30-day frequency array from sparse daily buckets, filling gaps with 0.
 * Returns parallel labels and data arrays for BarGraph. Labels show "Jan 5" on
 * the 1st of each week-ish interval to keep the axis readable.
 */
function buildFrequencyData(buckets: IssueFrequencyBucket[]): { labels: string[]; data: number[] } {
  const now = new Date();
  const labels: string[] = [];
  const data: number[] = [];
  const bucketMap = new Map<string, number>();
  for (const b of buckets) {
    try {
      const d = new Date(b.bucket);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      bucketMap.set(key, b.count);
    } catch {
      // skip malformed timestamps
    }
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    // Show label every 7 days to avoid clutter
    const dayIdx = 29 - i;
    labels.push(dayIdx % 7 === 0 ? `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}` : "");
    data.push(bucketMap.get(key) || 0);
  }
  return { labels, data };
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
    "| Time | Method | URL | Service | User |",
    "|------|--------|-----|---------|------|",
    ...data.events.map((e: typeof data.events[number]) => {
      const ts = e.timestamp.replace("T", " ").replace(/\.\d+Z?$/, "");
      const method = e.httpMethod || "—";
      const url = e.httpRoute || e.urlPath || "—";
      const user = e.userId ? truncate(e.userId, 16) : "—";
      return `| ${ts} | ${method} | ${url} | ${e.serviceName} | ${user} |`;
    }),
  ].join("\n");

  const hasFrequencyData = data.frequency.length > 0;
  const freq = hasFrequencyData ? buildFrequencyData(data.frequency) : null;

  return (
    <Detail
      navigationTitle={`${s.lastType}: ${truncate(s.lastMessage, 40)}`}
      markdown={markdown}
      metadata={
        <>
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
            {s.environments.length > 0 && (
              <Detail.Metadata.TagList title="Environments">
                {s.environments.map((env: string) => <Detail.Metadata.TagList.Item key={env} text={env} color={Color.Orange} />)}
              </Detail.Metadata.TagList>
            )}
            {s.urlPaths.length > 0 && (
              <Detail.Metadata.TagList title="URL Paths">
                {s.urlPaths.map((p: string) => <Detail.Metadata.TagList.Item key={p} text={p} color={Color.SecondaryText} />)}
              </Detail.Metadata.TagList>
            )}
            <Detail.Metadata.Separator />
            {latestEvent?.httpMethod ? <Detail.Metadata.Label title="Method" text={latestEvent.httpMethod} /> : null}
            {latestEvent?.httpRoute ? <Detail.Metadata.Label title="Route" text={latestEvent.httpRoute} /> : null}
            {latestEvent?.urlPath ? <Detail.Metadata.Label title="URL Path" text={latestEvent.urlPath} /> : null}
            {latestEvent?.userId ? <Detail.Metadata.Label title="User" text={latestEvent.userId} /> : null}
            {latestEvent?.browser ? <Detail.Metadata.Label title="Browser" text={latestEvent.browser} /> : null}
            {latestEvent?.sessionId ? <Detail.Metadata.Label title="Session" text={latestEvent.sessionId.slice(0, 12) + "…"} /> : null}
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Fingerprint" text={fingerprint} />
          </Detail.Metadata>
          {freq && (
            <BarGraph
              height={8}
              labels={freq.labels}
              barWidth={FREQ_BAR_WIDTH}
              barGap={FREQ_BAR_GAP}
              showYAxis={true}
              yTicks={3}
              showLegend={false}
              marginTop={2}
            >
              <BarGraph.Series data={freq.data} color={Color.Red} />
            </BarGraph>
          )}
        </>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Fingerprint" content={fingerprint} />
          {latestEvent?.traceId ? <Action.CopyToClipboard title="Copy Trace ID" content={latestEvent.traceId} /> : null}
          {latestEvent?.urlFull ? <Action.CopyToClipboard title="Copy URL" content={latestEvent.urlFull} /> : null}
          {latestEvent?.httpRoute ? <Action.CopyToClipboard title="Copy Route" content={latestEvent.httpRoute} /> : null}
          {latestEvent?.userId ? <Action.CopyToClipboard title="Copy User ID" content={latestEvent.userId} /> : null}
          {latestEvent?.sessionId ? <Action.CopyToClipboard title="Copy Session ID" content={latestEvent.sessionId} /> : null}
        </ActionPanel>
      }
    />
  );
}
