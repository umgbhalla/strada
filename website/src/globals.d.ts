// CSS import declarations for the website app global stylesheet.

/// <reference path="../worker-configuration.d.ts" />

declare module '*.css' {
  const content: string
  export default content
}

declare module '*.datasource?raw' {
  const content: string
  export default content
}

declare module '*.pipe?raw' {
  const content: string
  export default content
}

declare module '*.sql?raw' {
  const content: string
  export default content
}

// Test-only bindings provided by miniflare via cloudflareTest() in vite.config.ts
// Workflow binding added manually until `wrangler types` is regenerated.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: D1Migration[]
    HEALTH_CHECK_WORKFLOW: Workflow
  }
}

interface D1Migration {
  name: string
  queries: string[]
}
