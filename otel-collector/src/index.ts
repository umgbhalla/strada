// OTel collector — receives OTLP HTTP/JSON and forwards to Tinybird or ClickHouse.
//
// Config resolution: the collector shares a D1 binding with the website.
// On each request, it extracts the project ID from the hostname, queries D1
// for the project's database credentials, and creates the appropriate backend.
//
// Project isolation: project_id is the ULID from the `project` table.
// Each project gets a subdomain: {projectId}-ingest.strada.sh

import { env } from "cloudflare:workers";
import { createCollectorApp } from "./app.ts";

const app = createCollectorApp({ db: env.DB, anonymousRateLimiter: env.ANON_INGEST_RATE_LIMITER });

export default {
  fetch(request: Request): Promise<Response> {
    return app.handle(request);
  },
} satisfies ExportedHandler<Env>;

export { app };
