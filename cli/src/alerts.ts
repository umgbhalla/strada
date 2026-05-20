// Alert management CLI commands. Configure error alert rules and
// notification destinations (email, webhook, slack) for an org.
//
// Multiple rules per org, each typed (error_threshold, health_check).
// Destinations are org-scoped and linked to rules many-to-many.
// The website cron checks errors every 5 minutes and sends notifications
// when thresholds are exceeded.
//
// Rules can be scoped to a single project (projectId set) or apply to
// all projects in the org (projectId null). The clack interactive prompt
// lets TTY users pick a project from a list.

import * as clack from "@clack/prompts";
import { goke } from "goke";
import { z } from "zod";
import { bold, cyan, dim, green, red, yellow } from "./colors.ts";
import { getApiClient } from "./api-client.ts";
import { ensureDefaultOrg, resolveProjectId } from "./projects.ts";
import { fetchProjects } from "./orgs.ts";
import { printTable } from "./table.ts";

export const alertsCli = goke();

// ── alerts list ──────────────────────────────────────────────────

alertsCli
  .command("alerts list", "Show alert rule and destinations for the current org")
  .action(async (_options, { console: output }) => {
    const org = await ensureDefaultOrg();
    const { safeFetch } = getApiClient();

    const res = await safeFetch("/api/v0/orgs/:orgId/alerts", {
      method: "GET",
      params: { orgId: org.id },
    });
    if (res instanceof Error) throw res;

    if (!res.rule) {
      output.log(dim("No alert rule configured. Add one with:"));
      output.log("");
      output.log(`  ${cyan("strada alerts add")} --channel email --to you@example.com`);
      output.log("");
      return;
    }

    const projectLabel = res.rule.projectSlug
      ? cyan(res.rule.projectSlug)
      : dim("all projects");

    output.log("");
    output.log(bold(`Alert rule for ${cyan(org.name)}`));
    output.log(`  ${dim("Name")}         ${res.rule.name}`);
    output.log(`  ${dim("Type")}         ${res.rule.type}`);
    output.log(`  ${dim("Project")}      ${projectLabel}`);
    output.log("");
    output.log(`  ${dim("Threshold")}    ${bold(String(res.rule.errorThreshold ?? 1))} errors in ${bold(String(res.rule.errorWindowMinutes ?? 5))} minutes`);
    output.log(`  ${dim("Cooldown")}     ${bold(String(res.rule.cooldownMinutes))} minutes`);
    output.log("");

    if (res.destinations.length === 0) {
      output.log(dim("  No destinations configured."));
    } else {
      printTable(output, {
        columns: [
          { key: "channel", label: "CHANNEL", color: cyan },
          { key: "destination", label: "DESTINATION" },
          { key: "id", label: "ID", color: dim },
        ],
        rows: res.destinations.map((d: { id: string; channel: string; destination: string }) => ({
          channel: d.channel,
          destination: d.destination,
          id: d.id,
        })),
      });
    }

    output.log("");
  });

// ── alerts add ───────────────────────────────────────────────────

alertsCli
  .command("alerts add", "Add an alert destination (creates error_threshold rule if needed)")
  .option("--channel <type>", z.enum(["email", "webhook", "slack"]).describe("Notification channel"))
  .option("--to <destination>", "Email address, webhook URL, or Slack webhook URL")
  .option("--project <slug>", "Project slug to scope the alert to (omit for all projects)")
  .option("--threshold [count]", "Min errors to trigger (default: 1)")
  .option("--window [minutes]", "Time window in minutes (default: 5)")
  .option("--cooldown [minutes]", "Re-alert cooldown in minutes (default: 60)")
  .action(async (options, { console: output, process: proc }) => {
    if (!options.channel || !options.to) {
      output.log("Missing required options: --channel <email|webhook|slack> --to <destination>");
      output.log(dim("Example: strada alerts add --channel email --to you@example.com"));
      return proc.exit(1);
    }

    const org = await ensureDefaultOrg();
    const { safeFetch } = getApiClient();

    // Resolve project scope: explicit flag, interactive prompt, or null (all)
    let projectId: string | null = null;
    if (options.project) {
      const resolved = await resolveProjectId(org.id, options.project);
      projectId = resolved.id;
    } else {
      const isTty = process.stdin.isTTY && process.stdout.isTTY;
      if (isTty) {
        const projects = await fetchProjects(org.id);
        const choice = await clack.select({
          message: "Which project should this alert cover?",
          options: [
            { value: "all", label: "All projects", hint: "alerts on every project in the org" },
            ...projects.map((p) => ({ value: p.id, label: p.slug, hint: p.id })),
          ],
        });
        if (clack.isCancel(choice)) return proc.exit(0);
        projectId = choice === "all" ? null : choice;
      }
    }

    const res = await safeFetch("/api/v0/orgs/:orgId/alerts/destinations", {
      method: "POST",
      params: { orgId: org.id },
      body: {
        channel: options.channel,
        destination: options.to,
        projectId,
        ...(options.threshold ? { errorThreshold: Number(options.threshold) } : {}),
        ...(options.window ? { errorWindowMinutes: Number(options.window) } : {}),
        ...(options.cooldown ? { cooldownMinutes: Number(options.cooldown) } : {}),
      },
    });
    if (res instanceof Error) throw res;

    const scopeLabel = projectId ? `project ${cyan(options.project || projectId)}` : "all projects";
    output.log(green(`Added ${cyan(options.channel)} destination: ${options.to} (${scopeLabel})`));
  });

// ── alerts remove ────────────────────────────────────────────────

alertsCli
  .command("alerts remove <destinationId>", "Remove an alert destination by ID")
  .action(async (destinationId, _options, { console: output }) => {
    const org = await ensureDefaultOrg();
    const { safeFetch } = getApiClient();

    const res = await safeFetch("/api/v0/orgs/:orgId/alerts/destinations/:destinationId", {
      method: "DELETE",
      params: { orgId: org.id, destinationId },
    });
    if (res instanceof Error) throw res;

    output.log(green(`Destination ${cyan(destinationId)} removed`));
  });

// ── alerts test ──────────────────────────────────────────────────

alertsCli
  .command("alerts test", "Send a test alert to all destinations")
  .action(async (_options, { console: output }) => {
    const org = await ensureDefaultOrg();
    const { safeFetch } = getApiClient();

    const res = await safeFetch("/api/v0/orgs/:orgId/alerts/test", {
      method: "POST",
      params: { orgId: org.id },
      body: {},
    });
    if (res instanceof Error) throw res;

    for (const r of (res as { results: Array<{ channel: string; destination: string; ok: boolean }> }).results) {
      if (r.ok) {
        output.log(green(`  ✓ ${r.channel} → ${r.destination}`));
      } else {
        output.log(red(`  ✗ ${r.channel} → ${r.destination}`));
      }
    }
  });
