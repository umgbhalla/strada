/**
 * Cloudflare Worker app used to validate what Cloudflare OTLP destinations
 * actually export to Strada for healthy requests, handled errors, and uncaught
 * Worker exceptions.
 */

import { Spiceflow } from 'spiceflow'

export const app = new Spiceflow()
  .get('/', () => {
    return {
      ok: true,
      service: 'strada-example-app-cloudflare',
      routes: ['/ok', '/caught', '/throw', '/throw-async', '/crash-runtime'],
    }
  })
  .get('/ok', () => {
    console.log({ route: '/ok', message: 'healthy request' })
    return { ok: true, route: '/ok' }
  })
  .get('/caught', () => {
    try {
      throw new Error('handled cloudflare validation error')
    } catch (error) {
      console.error({
        route: '/caught',
        kind: 'handled',
        message: error instanceof Error ? error.message : String(error),
      })
      return Response.json(
        { ok: false, route: '/caught', handled: true },
        { status: 500 },
      )
    }
  })
  .get('/throw', () => {
    console.error({ route: '/throw', kind: 'uncaught-sync', message: 'about to throw' })
    throw new Error('uncaught cloudflare validation error')
  })
  .get('/throw-async', async () => {
    console.error({ route: '/throw-async', kind: 'uncaught-async', message: 'about to throw async' })
    await Promise.resolve()
    throw new Error('uncaught async cloudflare validation error')
  })

export default {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/crash-runtime') {
      console.error({ route: '/crash-runtime', kind: 'runtime-crash', message: 'about to crash before app.handle' })
      throw new Error('uncaught runtime crash before app.handle')
    }

    return app.handle(request)
  },
} satisfies ExportedHandler<Env>
