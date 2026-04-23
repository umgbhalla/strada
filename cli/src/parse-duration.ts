// Parse human-readable duration strings like "1h", "24h", "7d" into
// ClickHouse SQL INTERVAL expressions. Used by CLI commands that accept
// a --since flag for time-range filtering.
//
// Supported units: s (seconds), m (minutes), h (hours), d (days), w (weeks).
// Examples: "30m" → "30 MINUTE", "24h" → "24 HOUR", "7d" → "7 DAY"

const UNIT_MAP: Record<string, string> = {
  s: "SECOND",
  m: "MINUTE",
  h: "HOUR",
  d: "DAY",
  w: "WEEK",
};

const DURATION_RE = /^(\d+)([smhdw])$/;

export function parseDuration(input: string): string {
  const match = input.match(DURATION_RE);
  if (!match) {
    throw new Error(
      `Invalid duration "${input}". Use a number followed by s, m, h, d, or w (e.g. "24h", "7d").`,
    );
  }
  const amount = match[1]!;
  const unit = UNIT_MAP[match[2]!]!;
  return `${amount} ${unit}`;
}
