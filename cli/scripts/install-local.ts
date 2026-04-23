// Script to install the strada CLI into ~/.local/bin for local development.
// Creates a bash wrapper pointing at the built dist/bin.js so `strada` is in PATH.
// Run after building: pnpm build && pnpm tsx scripts/install-local.ts

import { writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binPath = resolve(__dirname, '../dist/bin.js')
const installDir = join(homedir(), '.local', 'bin')
const installPath = join(installDir, 'strada')

const script = `#!/usr/bin/env bash\nexec node ${binPath} "$@"\n`

mkdirSync(installDir, { recursive: true })
writeFileSync(installPath, script)
chmodSync(installPath, 0o755)

console.log(`installed strada → ${installPath}`)
console.log(`points to       → ${binPath}`)
