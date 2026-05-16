import { describe, expect, it } from "vitest";
import type { BetterAuthPlugin } from "better-auth";
import {
  strataBetterAuth,
  type StradaAuthEventProperties,
  type StradaBetterAuthOptions,
} from "./better-auth.ts";

type HookContext = {
  path?: string;
  context: {
    newSession?: { user?: { id?: string; email?: string; name?: string } } | null;
    session?: { user?: { id?: string; email?: string; name?: string } } | null;
  };
  getCookie?: (name: string) => string | null | undefined;
};

type HookResult = { headers?: Headers };

type SignupHook = (
  user: { id?: string; email?: string; name?: string },
  context: { path?: string } | null,
) => Promise<void>;

function makeHarness(options: StradaBetterAuthOptions = {}) {
  const events: Array<{ name: string; properties: StradaAuthEventProperties }> = [];
  const plugin: BetterAuthPlugin = strataBetterAuth({
    ...options,
    track: (name, properties) => {
      events.push({ name, properties });
    },
  });

  const after = plugin.hooks?.after?.[0]?.handler as ((ctx: HookContext) => Promise<HookResult>) | undefined;
  const initResult = plugin.init?.({} as never) as {
    options?: {
      databaseHooks?: {
        user?: { create?: { after?: SignupHook } };
      };
    };
  } | undefined;
  const signupAfter = initResult?.options?.databaseHooks?.user?.create?.after;

  return { plugin, after, signupAfter, events };
}

/** Extract cookie name=value pairs from a Headers object's set-cookie header */
function parseCookiesFromHeaders(headers?: Headers): Array<{ raw: string; name: string; value: string }> {
  if (!headers) return [];
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return [];
  // Split on the first = to get name and then take the value before the first ;
  const nameValue = setCookie.split(";")[0]!;
  const eqIdx = nameValue.indexOf("=");
  const name = decodeURIComponent(nameValue.slice(0, eqIdx));
  const value = decodeURIComponent(nameValue.slice(eqIdx + 1));
  return [{ raw: setCookie, name, value }];
}

describe("strataBetterAuth", () => {
  it("sets a JS-readable user cookie and tracks email login", async () => {
    const harness = makeHarness();

    const result = await harness.after!({
      path: "/sign-in/email",
      context: {
        newSession: {
          user: { id: "user_123", email: "tommy@example.com", name: "Tommy" },
        },
      },
    });

    const cookies = parseCookiesFromHeaders(result.headers);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.name).toBe("strada_uid");
    expect(cookies[0]!.value).toBe("user_123");
    expect(cookies[0]!.raw).toContain("Path=/");
    expect(cookies[0]!.raw).toContain("SameSite=lax");
    expect(cookies[0]!.raw).toContain("Max-Age=31536000");
    // must NOT contain HttpOnly so the browser SDK can read it
    expect(cookies[0]!.raw).not.toContain("HttpOnly");

    expect(harness.events).toMatchInlineSnapshot(`
      [
        {
          "name": "auth.login",
          "properties": {
            "authMethod": "email",
            "authPath": "/sign-in/email",
            "authProvider": "email",
            "userEmail": "tommy@example.com",
            "userId": "user_123",
            "userName": "Tommy",
          },
        },
      ]
    `);
  });

  it("tracks OAuth provider from callback path", async () => {
    const harness = makeHarness({ cookieName: "custom_uid" });

    const result = await harness.after!({
      path: "/callback/google",
      context: { newSession: { user: { id: "user_oauth", email: "a@b.test" } } },
    });

    const cookies = parseCookiesFromHeaders(result.headers);
    expect(cookies[0]!.name).toBe("custom_uid");
    expect(cookies[0]!.value).toBe("user_oauth");

    expect(harness.events[0]).toMatchInlineSnapshot(`
      {
        "name": "auth.login",
        "properties": {
          "authMethod": "oauth",
          "authPath": "/callback/google",
          "authProvider": "google",
          "userEmail": "a@b.test",
          "userId": "user_oauth",
        },
      }
    `);
  });

  it("tracks account creation through database hooks", async () => {
    const harness = makeHarness();

    await harness.signupAfter!(
      { id: "new_user", email: "new@example.com", name: "New User" },
      { path: "/callback/github" },
    );

    expect(harness.events).toMatchInlineSnapshot(`
      [
        {
          "name": "auth.signup",
          "properties": {
            "authMethod": "oauth",
            "authPath": "/callback/github",
            "authProvider": "github",
            "isSignup": true,
            "userEmail": "new@example.com",
            "userId": "new_user",
            "userName": "New User",
          },
        },
      ]
    `);
  });

  it("sets the cookie but does not double-track login for email signup", async () => {
    const harness = makeHarness();

    const result = await harness.after!({
      path: "/sign-up/email",
      context: { newSession: { user: { id: "new_user", email: "new@example.com" } } },
    });

    const cookies = parseCookiesFromHeaders(result.headers);
    expect(cookies[0]!.value).toBe("new_user");
    expect(harness.events).toEqual([]);
  });

  it("clears the user cookie and tracks logout", async () => {
    const harness = makeHarness();

    const result = await harness.after!({
      path: "/sign-out",
      context: {},
      getCookie: (name) => name === "strada_uid" ? "user_123" : undefined,
    });

    const cookies = parseCookiesFromHeaders(result.headers);
    expect(cookies[0]!.name).toBe("strada_uid");
    expect(cookies[0]!.value).toBe("");
    expect(cookies[0]!.raw).toContain("Max-Age=0");

    expect(harness.events).toMatchInlineSnapshot(`
      [
        {
          "name": "auth.logout",
          "properties": {
            "authPath": "/sign-out",
            "userId": "user_123",
          },
        },
      ]
    `);
  });

  it("can omit user details", async () => {
    const harness = makeHarness({ includeUserDetails: false });

    await harness.after!({
      path: "/sign-in/email",
      context: { newSession: { user: { id: "user_123", email: "hidden@example.com" } } },
    });

    expect(harness.events[0]).toMatchInlineSnapshot(`
      {
        "name": "auth.login",
        "properties": {
          "authMethod": "email",
          "authPath": "/sign-in/email",
          "authProvider": "email",
          "userId": "user_123",
        },
      }
    `);
  });

  it("registers no hooks when disabled", () => {
    const harness = makeHarness({ enabled: false });

    expect(harness.plugin.hooks).toBeUndefined();
    expect(harness.signupAfter).toBeUndefined();
  });
});
