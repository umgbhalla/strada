import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import spiceflow from 'spiceflow/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      '@strada.sh/ui/src': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    spiceflow({
      entry: './src/main.tsx',
    }),
    react(),
    tailwindcss(),
  ],
})
