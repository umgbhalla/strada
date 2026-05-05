import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import spiceflow from 'spiceflow/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'next/dynamic': path.resolve(__dirname, 'src/shims/next-dynamic.ts'),
      'next-themes': path.resolve(__dirname, 'src/shims/next-themes.ts'),
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
