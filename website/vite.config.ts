import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { spiceflowPlugin } from 'spiceflow/vite'

const port = parseInt(process.env.PORT || '5444', 10)

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, '..', 'db', 'drizzle')).catch(() => [])

  return {
    server: { port, strictPort: true },
    clearScreen: false,
    resolve: {
      alias: {
        '@ui': path.resolve(__dirname, 'src/ui'),
      },
    },

    plugins: [
      process.env.VITEST
        ? cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            main: './src/test-worker-entrypoint.ts',
            miniflare: {
              bindings: { TEST_MIGRATIONS: migrations },
            },
          })
        : cloudflare({
            viteEnvironment: {
              name: 'rsc',
              childEnvironments: ['ssr'],
            },
          }),
      react(),
      spiceflowPlugin({ entry: './src/app.tsx' }),
      tailwindcss(),
    ],
    test: {
      setupFiles: ['./src/apply-migrations.ts'],
    },
  }
})
