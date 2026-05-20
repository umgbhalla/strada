// Typed API client for the Strada website. Uses spiceflow's typed fetch client
// with the website App type imported from source for compile-time route validation.
//
// The App type is imported from "strada-website/src/app.tsx" (source, not dist).
// This avoids build-order dependencies: the website doesn't need to be built for
// the CLI to typecheck. Ambient stubs in website-stubs.d.ts cover modules that
// don't resolve under the CLI's nodenext resolution (echarts, etc).
//
// Prefer getApiClient() which reads auth from config automatically.
// Use createApiClient() only when you have explicit credentials (e.g. database create).
//
// The safeFetch client accepts `body` as a plain object (auto-serialized to JSON)
// and is fully type-safe on path params, query, body, and response. No need for
// JSON.stringify() or Content-Type headers. Auth header is set globally on the client.

import { createSpiceflowFetch } from "spiceflow/client";
import type { App } from "strada-website/src/app.tsx";
import { requireAuth } from "./config.ts";

export function createApiClient(baseUrl: string, sessionToken: string) {
  const safeFetch = createSpiceflowFetch<App>(baseUrl, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  return { safeFetch };
}

/** Create an API client from the stored auth config. Throws if not logged in. */
export function getApiClient() {
  const auth = requireAuth();
  return createApiClient(auth.baseUrl, auth.sessionToken);
}
