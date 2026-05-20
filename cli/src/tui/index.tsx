// Strada TUI — browse issues, logs, traces, and analytics in a Raycast-like terminal UI.
// Launched by the '' (empty) CLI command. Requires Bun (termcast uses OpenTUI Zig FFI).
// Uses zustand/vanilla for global state (view, project, service, time range) persisted
// via termcast Cache so selections survive restarts.
//
// Single dropdown accessory with 3 sections: View, Project, Time Range.
// Service filter is in the action panel (shared across all views via zustand).
// All queries come from tui-queries.ts so they stay in sync with CLI commands.

import { List } from "termcast";
import { useCachedPromise } from "@termcast/utils";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { fetchOrgs, fetchProjects } from "../orgs.ts";
import { queryServices } from "../tui-queries.ts";
import { store, useStore } from "./store.ts";
import { NavigationDropdown } from "./shared.tsx";
import { IssuesView } from "./issues-view.tsx";
import { LogsView } from "./logs-view.tsx";
import { TracesView } from "./traces-view.tsx";
import { AnalyticsView } from "./analytics-view.tsx";

export default function StradaTui(): ReactNode {
  const view = useStore((s) => s.view);
  const projectId = useStore((s) => s.projectId);
  const projectSlug = useStore((s) => s.projectSlug);
  const timeRange = useStore((s) => s.timeRange);

  const { data: orgData, isLoading: orgLoading } = useCachedPromise(async () => {
    const orgs = await fetchOrgs();
    if (orgs.length === 0) return { org: null, projects: [] as ReturnType<typeof fetchProjects> extends Promise<infer T> ? T : never };
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

  const pagination = useStore((s) => s.pagination);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={true}
      searchBarPlaceholder="Search…"
      pagination={pagination}
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
