import { type Server } from 'node:http'
import { app } from '../src/index.ts'

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`)
  }
  return parsed
}

async function main(): Promise<void> {
  const host = process.env.HOST ?? '127.0.0.1'
  const port = parsePort(process.env.PORT, 4318)

  const { server, port: actualPort } = (await app.listen(port, host)) as {
    server: Server
    port: number
  }

  console.log(`otel-collector listening on http://${host}:${actualPort}`)

  const shutdown = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown()
  })

  process.on('SIGTERM', () => {
    void shutdown()
  })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
