// Minimal worker entrypoint for vitest cloudflare pool.
// The real entrypoint (spiceflow/cloudflare-entrypoint) is a virtual module
// that only exists during vite dev/build. Tests import app/api directly.
export default {
  async fetch(): Promise<Response> {
    return new Response('test worker')
  },
}
