// TUI traces view — trace summary list, span tree drill-down, and
// full span detail view. Reuses buildSpanTree/toTraceRow from traces.ts.

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

import {
  queryTracesList,
  queryTraceSpans,
  type TraceSummaryRow,
} from "../tui-queries.ts";
import {
  buildSpanTree,
  toTraceRow,
  formatDurationMs,
  type SpanNode,
} from "../traces.ts";
import { useStore, ICON } from "./store.ts";
import { timeAgo, formatTimestamp, truncate } from "./helpers.ts";
import { CommonActions, type ViewProps } from "./shared.tsx";

// ── Span tree flattening ──────────────────────────────────────────

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

// ── Traces list view ──────────────────────────────────────────────

export function TracesView({ projectId, services, servicesLoading }: ViewProps): ReactNode {
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

// ── Span tree view (pushed from trace list) ───────────────────────

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
      // isShowingDetail={true}
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

// ── Span detail view (pushed from span tree) ──────────────────────

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
