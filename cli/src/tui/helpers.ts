// TUI shared utility functions — formatting, parsing, truncation, AI search hook.

export function timeAgo(ts: string): string {
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

export function formatTimestamp(ts: string): string {
  const match = ts.match(/(\d{2}:\d{2}:\d{2})/);
  return match ? match[1]! : ts;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(seconds: number): string {
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

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export interface DurationStats {
  mean: number;
  stddev: number;
}

/** Compute mean and standard deviation for an array of durations in ms. */
export function computeDurationStats(durationsMs: number[]): DurationStats {
  if (durationsMs.length < 2) return { mean: 0, stddev: 0 };
  const mean = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length;
  const variance = durationsMs.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durationsMs.length;
  return { mean, stddev: Math.sqrt(variance) };
}

/**
 * Return a color based on how far a duration deviates from the mean.
 * >=2 stddev above mean → Red, >=1 stddev → Orange, otherwise → Green.
 */
export function durationColor(durationMs: number, stats: DurationStats): string {
  if (stats.stddev === 0) return "#34EE7F"; // Color.Green
  const z = (durationMs - stats.mean) / stats.stddev;
  if (z >= 2) return "#FF7B7B"; // Color.Red
  if (z >= 1) return "#FF9F43"; // Color.Orange
  return "#34EE7F"; // Color.Green
}

// ── AI search hook ────────────────────────────────────────────────
//
// Debounces user input, calls generateAiFilter() on the website, and returns
// the current WHERE clause plus loading state. Each view passes the result
// as `searchFilter` to its query function.

import { useState, useRef, useCallback } from "react";
import { generateAiFilter } from "../tui-queries.ts";

export interface AiSearchState {
  /** The boolean condition to inject into SQL, or empty string */
  searchFilter: string;
  /** For grouped queries, whether the condition should go in HAVING vs WHERE */
  searchFilterPlacement: "where" | "having";
  /** True while the AI model is generating */
  isSearching: boolean;
  /** The raw generated clause shown to the user as feedback */
  lastClause: string;
  /** Handler to pass to List's onSearchTextChange */
  onSearchTextChange: (text: string) => void;
}

/**
 * Hook that debounces search text and calls the AI filter endpoint.
 * Returns the generated boolean condition to inject into SQL queries.
 */
export function useAiSearch(opts: {
  projectId: string;
  view: "issues" | "logs" | "traces";
  debounceMs?: number;
}): AiSearchState {
  const [searchFilter, setSearchFilter] = useState("");
  const [searchFilterPlacement, setSearchFilterPlacement] = useState<"where" | "having">("where");
  const [isSearching, setIsSearching] = useState(false);
  const [lastClause, setLastClause] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSearchTextChange = useCallback(
    (text: string) => {
      // Cancel previous debounce timer; stale results are discarded via abortRef
      if (abortRef.current) abortRef.current.abort();
      if (timerRef.current) clearTimeout(timerRef.current);

      if (!text.trim()) {
        setSearchFilter("");
        setSearchFilterPlacement("where");
        setLastClause("");
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const result = await generateAiFilter({
            projectId: opts.projectId,
            searchText: text,
            view: opts.view,
          });
          if (controller.signal.aborted) return;

          setSearchFilter(result.condition);
          setSearchFilterPlacement(result.placement);
          setLastClause(result.condition);
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          console.error("AI search failed:", err);
          setSearchFilter("");
          setSearchFilterPlacement("where");
          setLastClause("");
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      }, opts.debounceMs ?? 500);
    },
    [opts.projectId, opts.view, opts.debounceMs],
  );

  return { searchFilter, searchFilterPlacement, isSearching, lastClause, onSearchTextChange };
}

export function parseAttributes(value: unknown): Record<string, string> {
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
