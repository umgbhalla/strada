// Backend abstraction for sending NDJSON to either Tinybird or ClickHouse.
//
// The otel-collector transforms OTLP JSON into snake_case NDJSON rows.
// The backend is responsible for delivering those rows to the storage layer:
//
// - TinybirdBackend: POST to /v0/events?name={table} with Bearer token.
//   Tinybird's `json:$.field` mappings convert snake_case → PascalCase columns.
//
// - ClickHouseBackend: Remap keys to PascalCase, then INSERT via ClickHouse
//   HTTP interface with FORMAT JSONEachLine. Uses signal kind (not physical
//   table name) for mapping lookup, so custom table names work correctly.

import { remapNdjson, type SignalKind } from "./field-mapping.ts";
import { env } from "./env.ts";

// ─── Backend interface ───

export interface Backend {
  /** Send NDJSON rows to a table. signal identifies the logical data type for field mapping. */
  send(table: string, signal: SignalKind, ndjson: string): Promise<void>;
}

// ─── Tinybird backend ───

export class TinybirdBackend implements Backend {
  constructor(
    private endpoint: string,
    private token: string,
  ) {}

  async send(table: string, _signal: SignalKind, ndjson: string): Promise<void> {
    const url = `${this.endpoint}/v0/events?name=${table}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        Authorization: `Bearer ${this.token}`,
      },
      body: ndjson,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Tinybird error for table "${table}": ${response.status} ${body}`);
    }
  }
}

// ─── ClickHouse backend ───

export class ClickHouseBackend implements Backend {
  constructor(
    private url: string,
    private database: string,
    private user: string,
    private password: string,
  ) {}

  async send(table: string, signal: SignalKind, ndjson: string): Promise<void> {
    // Remap snake_case keys → PascalCase ClickHouse column names.
    // Uses signal kind (not table name) so custom table names don't break remapping.
    const remapped = remapNdjson(ndjson, signal);

    const query = `INSERT INTO ${this.database}.${table} FORMAT JSONEachLine`;
    const endpoint = `${this.url}/?query=${encodeURIComponent(query)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": this.user,
        "X-ClickHouse-Key": this.password,
      },
      body: remapped,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`ClickHouse error for table "${table}": ${response.status} ${body}`);
    }
  }
}

// ─── Backend factory ───

export function createBackend(): Backend {
  if (env.CLICKHOUSE_URL) {
    return new ClickHouseBackend(
      env.CLICKHOUSE_URL,
      env.CLICKHOUSE_DATABASE,
      env.CLICKHOUSE_USER,
      env.CLICKHOUSE_PASSWORD,
    );
  }

  if (env.TINYBIRD_ENDPOINT && env.TINYBIRD_TOKEN) {
    return new TinybirdBackend(env.TINYBIRD_ENDPOINT, env.TINYBIRD_TOKEN);
  }

  throw new Error(
    "Missing backend configuration. Set either CLICKHOUSE_URL (for ClickHouse) " +
      "or TINYBIRD_ENDPOINT + TINYBIRD_TOKEN (for Tinybird).",
  );
}
