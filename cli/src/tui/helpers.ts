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
// the structured SQL filter (where/having/orderBy) plus loading state. Each
// view passes the result as `aiFilter` to its query function.
//
// Retry loop (inspired by crisp search-database-raycast):
// After generating a filter, the hook calls the `probe` callback to validate
// the SQL against the real database. If the query fails (bad column, syntax
// error), the error is fed back to the AI model and generation is retried.
// Up to MAX_RETRIES attempts. Retry progress is shown in the navigation title.

import { useState, useRef, useCallback } from "react";
import { generateAiFilter, type AiFilterResult, type PreviousFilterError } from "../tui-queries.ts";
import { store } from "./store.ts";

const MAX_RETRIES = 3;

export interface AiSearchState {
  /** Structured SQL filter from AI, or null when search is empty */
  aiFilter: AiFilterResult | null;
  /** True while the AI model is generating */
  isSearching: boolean;
  /** Summary of what the AI generated, shown to user as feedback */
  lastClause: string;
  /** Handler to pass to List's onSearchTextChange */
  onSearchTextChange: (text: string) => void;
}

/** Build a human-readable summary of the generated SQL for the navigation title. */
function summarizeFilter(result: AiFilterResult): string {
  const parts = [result.where];
  if (result.having) parts.push(`HAVING ${result.having}`);
  if (result.orderBy) parts.push(`ORDER BY ${result.orderBy}`);
  return parts.join(" | ");
}

/**
 * Hook that debounces search text and calls the AI filter endpoint.
 * Returns the structured SQL filter to inject into queries.
 *
 * `probe` is called after each generation to validate the SQL. If it
 * throws, the error message is fed back to the AI for self-correction.
 * Pass a lightweight query call (e.g. with `limit: 1`) as the probe.
 */
export function useAiSearch(opts: {
  projectId: string;
  view: "issues" | "logs" | "traces";
  debounceMs?: number;
  /** Validate the generated filter by executing a probe query. Throw on failure. */
  probe?: (filter: AiFilterResult) => Promise<void>;
}): AiSearchState {
  const [aiFilter, setAiFilter] = useState<AiFilterResult | null>(null);
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
        setAiFilter(null);
        setLastClause("");
        setIsSearching(false);
        store.setState({ lastAiMs: null, lastAiSql: null });
        return;
      }

      setIsSearching(true);

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        const previousErrors: PreviousFilterError[] = [];

        try {
          // Retry loop: generate filter, probe, retry with error context if it fails
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (controller.signal.aborted) return;

            const aiT0 = performance.now();
            const result = await generateAiFilter({
              projectId: opts.projectId,
              searchText: text,
              view: opts.view,
              previousErrors: previousErrors.length > 0 ? previousErrors : undefined,
            });
            const aiMs = Math.round(performance.now() - aiT0);
            store.setState({ lastAiMs: aiMs });
            if (controller.signal.aborted) return;

            const summary = summarizeFilter(result);

            // If no probe, accept the filter as-is
            if (!opts.probe) {
              setAiFilter(result);
              setLastClause(summary);
              store.setState({ lastAiSql: summary });
              return;
            }

            // Probe: run a lightweight query to validate the SQL
            try {
              await opts.probe(result);
              if (controller.signal.aborted) return;

              // Probe succeeded: accept the filter
              setAiFilter(result);
              setLastClause(summary);
              store.setState({ lastAiSql: summary });
              return;
            } catch (probeErr) {
              if ((probeErr as Error).name === "AbortError") return;

              const errorMsg = String((probeErr as Error).message || probeErr).slice(0, 500);
              previousErrors.push({ sql: summary, error: errorMsg });

              if (attempt < MAX_RETRIES) {
                store.setState({ lastAiSql: `retrying (${attempt + 2}/${MAX_RETRIES + 1})…` });
              } else {
                // All retries exhausted
                store.setState({ lastAiSql: "AI search failed" });
                setAiFilter(null);
                setLastClause("");
              }
            }
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          console.error("AI search failed:", err);
          store.setState({ lastAiSql: "AI search failed" });
          setAiFilter(null);
          setLastClause("");
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      }, opts.debounceMs ?? 300);
    },
    [opts.projectId, opts.view, opts.debounceMs, opts.probe],
  );

  return { aiFilter, isSearching, lastClause, onSearchTextChange };
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
