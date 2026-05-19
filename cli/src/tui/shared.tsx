// TUI shared components — NavigationDropdown, ServiceFilterActions, CommonActions.
// These are used across all views for navigation, filtering, and refresh.

import {
  Action,
  ActionPanel,
  List,
} from "termcast";
import type { ReactNode } from "react";
import { useCallback } from "react";

import type { CachedProject } from "../config.ts";
import type { ServiceRow } from "../tui-queries.ts";
import { store, useStore, ICON, VIEW_OPTIONS, TIME_OPTIONS, type TuiView, type TimeRange } from "./store.ts";

// ── Shared view props ─────────────────────────────────────────────

export interface ViewProps {
  projectId: string;
  services: ServiceRow[];
  servicesLoading: boolean;
}

// ── Dropdown ──────────────────────────────────────────────────────

export function NavigationDropdown({ projects }: { projects: CachedProject[] }): ReactNode {
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

export function ServiceFilterActions({ services, isLoading }: { services: ServiceRow[]; isLoading: boolean }): ReactNode {
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

export function CommonActions({ services, servicesLoading, revalidate }: { services: ServiceRow[]; servicesLoading: boolean; revalidate: () => void }): ReactNode {
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
