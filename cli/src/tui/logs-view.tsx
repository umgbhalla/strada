// TUI logs view — chronological log list with severity coloring,
// plus LogDetailView pushed on action for full body and attributes.

import {
  Action,
  ActionPanel,
  Color,
  Detail,
  List,
  useNavigation,
} from "termcast";
import { useCachedPromise } from "@termcast/utils";
import type { ReactNode } from "react";
import { useCallback } from "react";

import {
  queryLogsList,
  type LogRow,
  type LogsCursor,
  type AiFilterResult,
} from "../tui-queries.ts";
import { store, useStore, ICON } from "./store.ts";
import { timeAgo, formatTimestamp, truncate, parseAttributes, useAiSearch } from "./helpers.ts";
import { NavigationDropdown, CommonActions, useNavigationTitle, type ViewProps } from "./shared.tsx";

// ── Severity color mapping ────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  FATAL: Color.Red,
  ERROR: Color.Red,
  WARN: Color.Yellow,
  INFO: Color.Blue,
  DEBUG: Color.SecondaryText,
  TRACE: Color.SecondaryText,
};

// ── Logs list view ────────────────────────────────────────────────

// Use terminal height as page size so the first page fills the visible area.
const LOGS_PAGE_SIZE = Math.max(10, (process.stdout.rows || 30) - 5);

export function LogsView({ projectId, projects, services, servicesLoading, isLoading: parentLoading }: ViewProps): ReactNode {
  const service = useStore((s) => s.service);
  const { push } = useNavigation();
  const navigationTitle = useNavigationTitle();

  const probe = useCallback(
    async (filter: AiFilterResult) => { await queryLogsList({ projectId, aiFilter: filter, limit: 1 }); },
    [projectId],
  );
  const aiSearch = useAiSearch({ projectId, view: "logs", probe });

  // Serialize aiFilter to a stable string for useCachedPromise dependency tracking.
  // The callback parses it back from the arg so it never captures a stale closure.
  const aiFilterKey = aiSearch.aiFilter ? JSON.stringify(aiSearch.aiFilter) : "";

  const { data, isLoading, revalidate, pagination } = useCachedPromise(
    (pid: string, svc: string | null, filterKey: string) =>
      async ({ cursor }: { page: number; cursor?: LogsCursor }) => {
        const aiFilter: AiFilterResult | undefined = filterKey ? JSON.parse(filterKey) : undefined;
        const t0 = performance.now();
        const result = await queryLogsList({
          projectId: pid,
          service: svc ?? undefined,
          limit: LOGS_PAGE_SIZE,
          cursor,
          aiFilter,
        });
        store.setState({ lastQueryMs: Math.round(performance.now() - t0) });
        return { data: result.data, hasMore: result.hasMore, cursor: result.cursor };
      },
    [projectId, service, aiFilterKey],
    { keepPreviousData: true },
  );

  const logs = data ?? [];

  return (
    <List
      isLoading={isLoading || parentLoading || aiSearch.isSearching}
      isShowingDetail={true}
      filtering={false}
      navigationTitle={navigationTitle}
      onSearchTextChange={aiSearch.onSearchTextChange}
      searchBarPlaceholder="errors since yesterday, service worker…"
      pagination={pagination ? { pageSize: LOGS_PAGE_SIZE, hasMore: pagination.hasMore, onLoadMore: pagination.onLoadMore } : undefined}
      searchBarAccessory={<NavigationDropdown projects={projects} />}
    >
      {logs.map((log: LogRow, i: number) => {
        const severity = (log.severityText || "INFO").toUpperCase();
        const iconColor = SEVERITY_COLORS[severity] ?? Color.SecondaryText;
        const attrs = parseAttributes(log.logAttributes);

        return (
          <List.Item
            key={`${log.timestamp}-${i}`}
            title={truncate(log.body || "(empty)", 80)}
            // subtitle={`[${log.serviceName}]`}
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
    </List>
  );
}

// ── Log detail view (pushed) ──────────────────────────────────────

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
