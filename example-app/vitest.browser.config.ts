// Vitest browser mode config for headless Chromium tests.
// Runs SDK browser entry in a real browser via Playwright.
// The "browser" resolve condition ensures @strada.sh/sdk resolves to browser.ts.
//
// Env vars: STRADA_PROJECT_ID and STRADA_ENDPOINT must be set.
// Vite exposes env vars with the STRADA_ prefix via import.meta.env.

import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  // Vite exposes env vars matching this prefix as import.meta.env.STRADA_*
  envPrefix: "STRADA_",
  test: {
    include: ["src/browser.test.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    // Browser tests need more time for SDK flush + network round-trips
    testTimeout: 30_000,
  },
  resolve: {
    conditions: ["browser"],
  },
});
