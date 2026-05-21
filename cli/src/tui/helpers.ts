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
// Debounces user input, calls generateAiFilter() on the website via
// useCachedPromise, and returns the structured SQL filter (where/having/orderBy)
// plus loading state. Each view passes the result as `aiFilter` to its query
// function.
//
// useCachedPromise handles caching by (text, view, projectId) key so navigating
// away and back with the same search text is instant. Abort is handled via the
// abortable ref pattern.
//
// Retry loop (inspired by crisp search-database-raycast):
// After generating a filter, the hook calls the `probe` callback to validate
// the SQL against the real database. If the query fails (bad column, syntax
// error), the error is fed back to the AI model and generation is retried.
// Up to MAX_RETRIES attempts. Retry progress is shown in the navigation title.

import { useState, useRef, useCallback, useEffect } from "react";
import { useCachedPromise } from "@termcast/utils";
import { generateAiFilter, type AiFilterResult, type PreviousFilterError } from "../tui-queries.ts";
import { store } from "./store.ts";

const MAX_RETRIES = 3;

export interface AiSearchState {
  /** Structured SQL filter from AI, or null when search is empty */
  aiFilter: AiFilterResult | null;
  /** True while the AI model is generating */
  isSearching: boolean;
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
 * Hook that debounces search text and calls the AI filter endpoint via
 * useCachedPromise. Returns the structured SQL filter to inject into queries.
 *
 * Results are cached by (searchText, view, projectId) so navigating between
 * views and back is instant when the search text hasn't changed.
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
  const [debouncedText, setDebouncedText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const probeRef = useRef(opts.probe);
  probeRef.current = opts.probe;

  const onSearchTextChange = useCallback(
    (text: string) => {
      // Abort immediately on every keystroke so in-flight requests don't
      // complete and update the store with stale results.
      abortRef.current?.abort();

      if (timerRef.current) clearTimeout(timerRef.current);

      if (!text.trim()) {
        setDebouncedText("");
        store.setState({ lastAiMs: null, lastAiSql: null });
        return;
      }

      timerRef.current = setTimeout(() => {
        setDebouncedText(text.trim());
      }, opts.debounceMs ?? 300);
    },
    [opts.debounceMs],
  );

  // Clear debounce timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const { data, isLoading } = useCachedPromise(
    async (searchText: string, view: string, projectId: string) => {
      // Capture the signal once at the start so we always check the controller
      // associated with *this* invocation, not a newer one that usePromise may
      // have swapped in after aborting us.
      const signal = abortRef.current?.signal;
      const throwIfAborted = () => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      };

      const previousErrors: PreviousFilterError[] = [];
      const probe = probeRef.current;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        throwIfAborted();

        const aiT0 = performance.now();
        const result = await generateAiFilter({
          projectId,
          searchText,
          view: view as "issues" | "logs" | "traces",
          previousErrors: previousErrors.length > 0 ? previousErrors : undefined,
        });
        const aiMs = Math.round(performance.now() - aiT0);
        store.setState({ lastAiMs: aiMs });

        throwIfAborted();

        const summary = summarizeFilter(result);

        // If no probe, accept the filter as-is
        if (!probe) {
          store.setState({ lastAiSql: summary });
          return result;
        }

        // Probe: run a lightweight query to validate the SQL
        try {
          await probe(result);
          throwIfAborted();

          store.setState({ lastAiSql: summary });
          return result;
        } catch (probeErr) {
          if ((probeErr as Error).name === "AbortError") throw probeErr;

          const errorMsg = String((probeErr as Error).message || probeErr).slice(0, 500);
          previousErrors.push({ sql: summary, error: errorMsg });

          if (attempt < MAX_RETRIES) {
            store.setState({ lastAiSql: `retrying (${attempt + 2}/${MAX_RETRIES + 1})…` });
          } else {
            store.setState({ lastAiSql: "AI search failed" });
            throw new Error(`AI search failed after ${MAX_RETRIES + 1} attempts: ${errorMsg}`);
          }
        }
      }

      // Unreachable, but satisfies TypeScript
      throw new Error("AI search failed");
    },
    [debouncedText, opts.view, opts.projectId],
    {
      execute: debouncedText.length > 0,
      abortable: abortRef,
      onError(error: Error) {
        if (error.name === "AbortError") return;
        console.error("AI search failed:", error);
        store.setState({ lastAiSql: "AI search failed" });
      },
    },
  );

  // Update the navigation title SQL on both fresh results and cache hits.
  // Cache hits skip the callback so lastAiSql wouldn't update without this.
  useEffect(() => {
    if (!debouncedText) return;
    if (data) {
      store.setState({ lastAiSql: summarizeFilter(data as AiFilterResult) });
    }
  }, [debouncedText, data]);

  return {
    aiFilter: debouncedText ? (data as AiFilterResult | undefined) ?? null : null,
    isSearching: isLoading,
    onSearchTextChange,
  };
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
