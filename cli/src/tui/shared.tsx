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
import { store, useStore, ICON, VIEW_OPTIONS, type TuiView } from "./store.ts";

// ── Shared view props ─────────────────────────────────────────────

export interface ViewProps {
  projectId: string;
  projects: CachedProject[];
  services: ServiceRow[];
  servicesLoading: boolean;
  /** Parent-level loading (org/project resolution) */
  isLoading?: boolean;
}

// ── Navigation title with timing ──────────────────────────────────

/** Format milliseconds as padded string: "120ms" or "1.2s" if >= 1000. */
function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`.padStart(5);
  }
  return `${ms}ms`.padStart(5);
}

/** Formatted title for the List showing view name + timing info. */
export function useNavigationTitle(): string {
  const view = useStore((s) => s.view);
  const queryMs = useStore((s) => s.lastQueryMs);
  const aiMs = useStore((s) => s.lastAiMs);
  const aiSql = useStore((s) => s.lastAiSql);

  const label = VIEW_OPTIONS.find((v) => v.id === view)?.label ?? "Issues";
  const parts = [label];
  if (queryMs != null) parts.push(`sql ${formatMs(queryMs)}`);
  if (aiMs != null) parts.push(`ai ${formatMs(aiMs)}`);
  if (aiSql) parts.push(aiSql);
  return parts.join(" · ");
}

// ── Dropdown ──────────────────────────────────────────────────────

export function NavigationDropdown({ projects }: { projects: CachedProject[] }): ReactNode {
  const view = useStore((s) => s.view);
  const projectSlug = useStore((s) => s.projectSlug);
  const projectId = useStore((s) => s.projectId);

  const viewLabel = VIEW_OPTIONS.find((v) => v.id === view)?.label ?? "Issues";
  const displayValue = `${viewLabel} · ${projectSlug ?? "…"}`;

  const handleChange = useCallback((value: string) => {
    if (value.startsWith("view::")) {
      store.setState({ view: value.slice(6) as TuiView });
    } else if (value.startsWith("project::")) {
      const parts = value.slice(9).split("::");
      store.setState({ projectId: parts[0] ?? null, projectSlug: parts[1] ?? null });
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
