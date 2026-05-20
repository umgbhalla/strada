// TUI issues view — list of grouped errors with detail panel, plus
// IssueDetailView pushed on action for full stacktrace and event history.

import {
  Action,
  ActionPanel,
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

import { getApiClient } from "../api-client.ts";
import {
  queryIssuesList,
  queryIssueDetail,
  queryIssueMetadata,
  type IssueRow,
  type IssueMetadata,
} from "../tui-queries.ts";
import { useStore, ICON } from "./store.ts";
import { timeAgo, truncate, formatCount, useAiSearch } from "./helpers.ts";
import { NavigationDropdown, CommonActions, type ViewProps } from "./shared.tsx";

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

export function IssuesView({ projectId, projects, services, servicesLoading, isLoading: parentLoading }: ViewProps): ReactNode {
  const timeRange = useStore((s) => s.timeRange);
  const service = useStore((s) => s.service);
  const { push } = useNavigation();

  const aiSearch = useAiSearch({ projectId, view: "issues" });

  const { data, isLoading, revalidate, pagination } = useCachedPromise(
    (pid: string, since: string, svc: string | null, filter: string) =>
      async ({ page }: { page: number }) => {
        const result = await queryIssuesList({
          projectId: pid,
          since,
          service: svc ?? undefined,
          limit: ISSUES_PAGE_SIZE,
          offset: page * ISSUES_PAGE_SIZE,
          searchFilter: filter || undefined,
        });
        // Fetch metadata for the current page's fingerprints.
        // Flatten metadata into each item so it survives JSON serialization
        // (useCachedPromise caches via JSON, and Map serializes to {}).
        const fps = result.data.map((i) => i.fingerprintHash);
        const metadataMap = fps.length > 0 ? await queryIssueMetadata(pid, fps) : new Map<string, IssueMetadata>();
        return {
          data: result.data.map((issue) => ({
            issue,
            metadata: metadataMap.get(issue.fingerprintHash),
          })),
          hasMore: result.hasMore,
        };
      },
    [projectId, timeRange, service, aiSearch.searchFilter],
    { keepPreviousData: true },
  );

  const items: { issue: IssueRow; metadata?: IssueMetadata }[] = data ?? [];
  const issues = items.map((item) => item.issue);
  const getMeta = (fp: string): IssueMetadata | undefined => {
    return items.find((item) => item.issue.fingerprintHash === fp)?.metadata;
  };

  return (
    <List
      isLoading={isLoading || parentLoading || aiSearch.isSearching}
      isShowingDetail={true}
      filtering={false}
      onSearchTextChange={aiSearch.onSearchTextChange}
      searchBarPlaceholder="AI search errors…"
      pagination={pagination ? { pageSize: ISSUES_PAGE_SIZE, hasMore: pagination.hasMore, onLoadMore: pagination.onLoadMore } : undefined}
      searchBarAccessory={<NavigationDropdown projects={projects} />}
    >
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
                markdown={[
                  `**${issue.lastType || "Error"}**: ${issue.lastMessage || "(no message)"}`,
                  "",
                  renderStacktraceMarkdown(issue.lastFrames, issue.lastStacktrace),
                ].join("\n")}
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
    </List>
  );
}

// ── Issue detail view (pushed) ────────────────────────────────────

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
