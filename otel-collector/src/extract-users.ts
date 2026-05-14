// Extract Strada user profile updates from reserved OTLP log events.
// Trusted server SDKs emit event.name = "strada.user.identify" through /v1/logs;
// the collector stores the raw log and upserts the latest profile into otel_users.

import { ATTR } from "@strada.sh/sdk/src/attrs";
import type { ExportLogsServiceRequest } from "./otlp-types.ts";
import type { OtelUserRow } from "./otel-row-types.ts";
import { convertAttributes, nanosToRFC3339 } from "./transform-attributes.ts";

const PROFILE_ATTRIBUTE_PREFIX = "strada.user.attributes.";
const USER_IDENTIFY_EVENT_NAME = "strada.user.identify";

export function extractUsersFromLogs(body: ExportLogsServiceRequest, projectId: string): string {
  const rows: string[] = [];

  for (const rl of body.resourceLogs ?? []) {
    for (const sl of rl.scopeLogs ?? []) {
      for (const log of sl.logRecords ?? []) {
        const attrs = convertAttributes(log.attributes);
        const eventName = attrs[ATTR["event.name"]] || log.eventName || "";
        if (eventName !== USER_IDENTIFY_EVENT_NAME) continue;

        const userId = attrs[ATTR["user.id"]] || "";
        if (!userId) continue;

        const timestampNano = log.timeUnixNano && log.timeUnixNano !== "0"
          ? log.timeUnixNano
          : (log.observedTimeUnixNano ?? "0");
        const timestamp = nanosToRFC3339(timestampNano);

        const row: OtelUserRow = {
          project_id: projectId,
          user_id: userId,
          email: attrs[ATTR["user.email"]] || "",
          name: attrs[ATTR["user.name"]] || "",
          full_name: attrs[ATTR["user.full_name"]] || "",
          user_hash: attrs[ATTR["user.hash"]] || "",
          image: attrs[ATTR["user.image"]] || "",
          organization_id: attrs[ATTR["organization.id"]] || "",
          organization_name: attrs[ATTR["organization.name"]] || "",
          attributes: extractProfileAttributes(attrs),
          last_seen: timestamp,
          version: timestampToEpochMs(timestampNano),
          updated_at: timestamp,
        };

        rows.push(JSON.stringify(row));
      }
    }
  }

  return rows.length > 0 ? rows.join("\n") + "\n" : "";
}

function extractProfileAttributes(attrs: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith(PROFILE_ATTRIBUTE_PREFIX)) {
      result[key.slice(PROFILE_ATTRIBUTE_PREFIX.length)] = value;
    }
  }
  return result;
}

function timestampToEpochMs(nanos: string): number {
  if (!nanos || nanos === "0") return Date.now();
  return Number(BigInt(nanos) / 1_000_000n);
}
