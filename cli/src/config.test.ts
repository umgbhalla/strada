// Tests for cwd-scoped CLI config resolution. These keep folder/org/project selection predictable.

import { describe, expect, test } from "vitest";
import { normalizeScope, resolveScopedEntry } from "./config.ts";

describe("scoped config", () => {
  test("resolves each field from the closest matching scope", () => {
    const resolved = resolveScopedEntry({
      scoped: {
        "/": { sessionToken: "root-token", baseUrl: "https://strada.sh" },
        "/Users/tommy/app": { orgId: "org_1", orgName: "Acme" },
        "/Users/tommy/app/packages/api": { projectId: "proj_api", projectSlug: "api" },
      },
    }, "/Users/tommy/app/packages/api/src");

    expect(resolved).toMatchInlineSnapshot(`
      {
        "baseUrl": "https://strada.sh",
        "orgId": "org_1",
        "orgName": "Acme",
        "projectId": "proj_api",
        "projectSlug": "api",
        "sessionToken": "root-token",
      }
    `);
  });

  test("does not match sibling paths with the same prefix", () => {
    const resolved = resolveScopedEntry({
      scoped: {
        "/Users/tommy/app": { orgId: "org_app", projectSlug: "api" },
      },
    }, "/Users/tommy/app2");

    expect(resolved).toMatchInlineSnapshot("{}");
  });

  test("normalizes relative scopes from cwd", () => {
    const normalized = normalizeScope(".");

    expect(normalized).toBe(process.cwd());
  });
});
