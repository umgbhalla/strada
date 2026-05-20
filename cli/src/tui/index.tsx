// Strada TUI — browse issues, logs, traces, and analytics in a Raycast-like terminal UI.
// Launched by the '' (empty) CLI command. Requires Bun (termcast uses OpenTUI Zig FFI).
// Uses zustand/vanilla for global state (view, project, service, time range) persisted
// via termcast Cache so selections survive restarts.
//
// Each view owns its own <List> with pagination. This component is a thin switcher
// that resolves org/project/services and delegates to the active view.

import { List } from "termcast";
import { useCachedPromise } from "@termcast/utils";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { fetchOrgs, fetchProjects } from "../orgs.ts";
import type { CachedProject } from "../config.ts";
import { queryServices } from "../tui-queries.ts";
import { store, useStore } from "./store.ts";
import { IssuesView } from "./issues-view.tsx";
import { LogsView } from "./logs-view.tsx";
import { TracesView } from "./traces-view.tsx";
import { AnalyticsView } from "./analytics-view.tsx";

export default function StradaTui(): ReactNode {
  const view = useStore((s) => s.view);
  const projectId = useStore((s) => s.projectId);
  const timeRange = useStore((s) => s.timeRange);

  const { data: orgData, isLoading: orgLoading } = useCachedPromise(async () => {
    const orgs = await fetchOrgs();
    const emptyProjects: CachedProject[] = [];
    if (orgs.length === 0) return { org: null, projects: emptyProjects };
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

  const viewProps = {
    projectId: projectId!,
    projects,
    services,
    servicesLoading,
    isLoading,
  };

  if (!projectId) {
    return <List isLoading={true} searchBarPlaceholder="Loading…" />;
  }

  if (view === "issues") return <IssuesView {...viewProps} />;
  if (view === "logs") return <LogsView {...viewProps} />;
  if (view === "traces") return <TracesView {...viewProps} />;
  if (view === "analytics") return <AnalyticsView {...viewProps} />;
  return <IssuesView {...viewProps} />;
}
