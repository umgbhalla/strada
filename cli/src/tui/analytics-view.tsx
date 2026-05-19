// TUI analytics view — browser analytics dashboard cards showing KPIs,
// realtime visitors, top pages, browsers, countries, referrers, and custom events.

import {
  ActionPanel,
  Color,
  List,
  Table,
} from "termcast";
import { useCachedPromise } from "@termcast/utils";
import type { ReactNode } from "react";
import { useCallback } from "react";

import {
  queryAnalyticsPages,
  queryAnalyticsKpis,
  queryAnalyticsBrowsers,
  queryAnalyticsCountries,
  queryAnalyticsReferrers,
  queryAnalyticsEvents,
  queryAnalyticsRealtime,
  type AnalyticsPageRow,
  type AnalyticsDimensionRow,
  type AnalyticsEventRow,
} from "../tui-queries.ts";
import { useStore, ICON } from "./store.ts";
import { formatCount, formatDuration, truncate } from "./helpers.ts";
import { CommonActions, type ViewProps } from "./shared.tsx";

// ── Analytics view ────────────────────────────────────────────────

export function AnalyticsView({ projectId, services, servicesLoading }: ViewProps): ReactNode {
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

  const cards: { id: string; title: string; icon: string; detail: ReactNode }[] = [
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
