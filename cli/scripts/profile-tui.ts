// CPU-profile the Strada TUI by driving it programmatically via tuistory.
//
// Launches the TUI under `bun --cpu-prof`, navigates to the traces view,
// opens a trace with many spans, scrolls around, then sends Ctrl+C so Bun
// flushes the .cpuprofile. Finally runs profano to analyze the results.
//
// Prerequisites:
//   - `strada` CLI must be logged in (`strada login`)
//   - A project with trace data (run generate-fake-traces.ts first)
//   - tuistory, profano installed globally or via PATH
//
// Usage:
//   bun cli/scripts/profile-tui.ts
//
// The script stores profiles in cli/tmp/cpu-profiles/ and prints profano output.
//
// Navigation discovery (termcast Raycast-style TUI):
//   Ctrl+P → opens navigation dropdown (View, Project, Time Range sections)
//   Click on item name → selects it and closes dropdown
//   Enter → opens detail view (e.g. span tree for a trace)
//   Esc → goes back to list view
//   Up/Down → move cursor through list items

import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(__dirname, "..");
const profileDir = resolve(cliDir, "tmp/cpu-profiles");
const sessionName = "strada-tui-profile";

// ── Helpers ──────────────────────────────────────────────────────

function run(cmd: string, opts?: { cwd?: string; timeout?: number }): string {
  try {
    return execSync(cmd, {
      cwd: opts?.cwd ?? cliDir,
      timeout: opts?.timeout ?? 30_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const stderr = e.stderr ?? "";
    const stdout = e.stdout ?? "";
    console.error(`Command failed: ${cmd}`);
    if (stderr) console.error(`  stderr: ${stderr.slice(0, 500)}`);
    if (stdout) console.error(`  stdout: ${stdout.slice(0, 500)}`);
    throw err;
  }
}

function ts(subcommand: string, timeout = 15_000): string {
  return run(`tuistory -s ${sessionName} ${subcommand}`, { timeout });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string) {
  console.log(`[profile] ${msg}`);
}

function printSnapshot(label: string, lines = 15) {
  const snap = ts("snapshot --trim");
  console.log(`\n── ${label} ──`);
  console.log(snap.split("\n").slice(0, lines).join("\n"));
  console.log("──\n");
  return snap;
}

// ── Clean up old profiles ────────────────────────────────────────

log("Cleaning old profiles...");
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

// ── Close any existing session ───────────────────────────────────

try {
  run(`tuistory -s ${sessionName} close`, { timeout: 5_000 });
  log("Closed existing session.");
} catch {
  // No session to close
}

// ── Launch TUI with CPU profiling ────────────────────────────────

log("Launching TUI with --cpu-prof...");
const launchCmd = [
  "tuistory launch",
  `"bun --cpu-prof --cpu-prof-dir=${profileDir} ${resolve(cliDir, "src/bin.ts")}"`,
  `-s ${sessionName}`,
  "--cols 140 --rows 40",
  "--no-wait",
  `--cwd ${cliDir}`,
].join(" ");

run(launchCmd);
log("TUI launched. Waiting for initial render...");

// Wait for the TUI to show something meaningful
try {
  ts('wait "/Issues|Traces|Logs|Loading|Search/i" --timeout 20000', 25_000);
} catch {
  log("Timeout waiting for initial render.");
}

await sleep(2000);
printSnapshot("Initial render", 10);

// ── Navigate to Traces view via Ctrl+P dropdown ──────────────────

log("Opening navigation dropdown (Ctrl+P)...");
ts("press ctrl p");
await sleep(1000);

log("Clicking 'Traces' in dropdown...");
try {
  ts('click "Traces" --timeout 5000');
} catch {
  log("Click failed, trying keyboard fallback...");
  // In the dropdown: Issues is selected, down→Logs, down→Traces, enter
  ts("press down");
  await sleep(300);
  ts("press down");
  await sleep(300);
  ts("press enter");
}

await sleep(3000);
printSnapshot("Traces view");

// ── Wait for traces to load ──────────────────────────────────────

log("Waiting for traces to load...");
try {
  ts('wait "/spans/i" --timeout 15000', 20_000);
} catch {
  log("Timeout waiting for traces. Continuing...");
}
await sleep(2000);
printSnapshot("Traces loaded");

// ── Find and open a trace with many spans ────────────────────────

// Scroll through traces looking for one with lots of spans.
// The 308-span trace from opencode project is a good target.
log("Looking for a large trace...");

// Navigate down through traces to find a heavy one
for (let i = 0; i < 20; i++) {
  ts("press down");
  await sleep(150);
}
// Go back to top
for (let i = 0; i < 20; i++) {
  ts("press up");
  await sleep(150);
}

log("Opening first trace (span tree view)...");
ts("press enter");
await sleep(3000);

try {
  ts('wait "/view full span|navigate/i" --timeout 10000', 15_000);
} catch {
  log("Timeout waiting for span tree render.");
}

printSnapshot("Span tree view", 25);

// ── Exercise rendering: scroll the span tree ─────────────────────

log("Scrolling span tree to exercise rendering...");

// Rapid cursor movement through spans
for (let i = 0; i < 30; i++) {
  ts("press down");
  await sleep(100);
}
log("  scrolled down 30 items");

for (let i = 0; i < 30; i++) {
  ts("press up");
  await sleep(100);
}
log("  scrolled up 30 items");

// Mouse wheel scroll
for (let i = 0; i < 5; i++) {
  ts("scroll down 10");
  await sleep(300);
}
for (let i = 0; i < 5; i++) {
  ts("scroll up 10");
  await sleep(300);
}
log("  mouse scroll complete");

// Quick rapid movement (stress test)
for (let i = 0; i < 50; i++) {
  ts("press down");
  await sleep(50);
}
for (let i = 0; i < 50; i++) {
  ts("press up");
  await sleep(50);
}
log("  rapid movement complete");

await sleep(1000);

// ── Go back and explore another trace ────────────────────────────

log("Going back to trace list...");
ts("press esc");
await sleep(2000);

// Move to a different trace
for (let i = 0; i < 5; i++) {
  ts("press down");
  await sleep(200);
}

log("Opening second trace...");
ts("press enter");
await sleep(3000);

// Scroll the second trace
for (let i = 0; i < 20; i++) {
  ts("press down");
  await sleep(100);
}
for (let i = 0; i < 20; i++) {
  ts("press up");
  await sleep(100);
}

log("Second trace explored.");

// ── Switch back to issues view to test that too ──────────────────

log("Switching to Issues view...");
ts("press esc");
await sleep(1000);
ts("press ctrl p");
await sleep(800);

try {
  ts('click "Issues" --timeout 3000');
} catch {
  ts("press enter"); // Issues is the first option
}

await sleep(3000);

// Scroll through issues
for (let i = 0; i < 10; i++) {
  ts("press down");
  await sleep(150);
}
for (let i = 0; i < 10; i++) {
  ts("press up");
  await sleep(150);
}

log("Issues view explored.");
await sleep(1000);

// ── Stop the TUI ─────────────────────────────────────────────────

log("Sending Ctrl+C to flush .cpuprofile...");
ts("press ctrl c");
await sleep(5000);

// Close the session
try {
  ts("close");
} catch {
  // Session may already be closed if bun exited
}

// ── Find and analyze the profile ─────────────────────────────────

const profiles = readdirSync(profileDir).filter((f) => f.endsWith(".cpuprofile"));

if (profiles.length === 0) {
  console.error("\nNo .cpuprofile files found! Bun may not have flushed on exit.");
  console.error(`Check ${profileDir} manually.`);
  process.exit(1);
}

log(`Found ${profiles.length} profile(s) in ${profileDir}`);

for (const profile of profiles) {
  const profilePath = resolve(profileDir, profile);
  console.log(`\n${"═".repeat(80)}`);
  console.log(`Profile: ${profile}`);
  console.log(`${"═".repeat(80)}`);

  console.log("\n── Top functions by SELF time (hot leaves) ──\n");
  const selfResult = spawnSync("npx", ["profano", profilePath, "--sort", "self", "-n", "40"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  console.log(selfResult.stdout || selfResult.stderr);

  console.log("\n── Top functions by TOTAL time (expensive callers) ──\n");
  const totalResult = spawnSync("npx", ["profano", profilePath, "--sort", "total", "-n", "30"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  console.log(totalResult.stdout || totalResult.stderr);
}

console.log(`\nRaw profiles saved at: ${profileDir}`);
console.log("Open in Chrome DevTools: chrome://inspect → Open dedicated DevTools for Node → Load...");
