// Type declarations for cloudflare:workers module.
// At runtime in Workers, the real module is provided by the workerd runtime.
// This declaration exists only so the SDK compiles without @cloudflare/workers-types.
declare module "cloudflare:workers" {
  export function waitUntil(promise: Promise<unknown>): void;
}
