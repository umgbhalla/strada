// Self-hosted Tinybird setup command.
//
// Tinybird browser auth lives in tinybird-browser-login.ts because the local
// callback server is easier to reason about as a small isolated module.

import * as clack from "@clack/prompts";
import { goke } from "goke";
import type { GokeExecutionContext } from "goke";
import picocolors from "picocolors";
import dedent from "string-dedent";
import { loadTinybirdResources } from "./tinybird-resources.ts";
import { browserLogin } from "./tinybird-browser-login.ts";

// ── Types ──

interface DeployResponse {
  result: "success" | "failed" | "no_changes";
  deployment?: {
    id: string;
    status: string;
    new_datasource_names?: string[];
    new_pipe_names?: string[];
    errors?: Array<{ filename?: string; error: string }>;
  };
  error?: string;
  errors?: Array<{ filename?: string; error: string }>;
}

interface DeploymentStatusResponse {
  result: string;
  deployment: { id: string; status: string; live?: boolean };
}

export interface SelfhostOptions {
  token?: string;
  baseUrl?: string;
}

export const selfhostCli = goke();

selfhostCli
  .command(
    "selfhost",
    dedent`
      Set up Strada on your own Tinybird workspace.

      Authenticates with Tinybird via browser OAuth, then deploys all OTel
      datasources and materialized views to your workspace. Outputs the
      environment variables needed to configure the otel-collector.

      For non-interactive usage (CI), pass --token and --base-url directly.
    `,
  )
  .option("-t, --token [token]", "Tinybird workspace admin token (skips browser login)")
  .option("-u, --base-url [url]", "Tinybird API base URL (e.g. https://api.us-east.aws.tinybird.co)")
  .example("# Interactive setup (opens browser)")
  .example("strada selfhost")
  .example("# Non-interactive with existing token")
  .example("strada selfhost --token p.eyXXX --base-url https://api.tinybird.co")
  .action((options, context) => selfhostAction(options, context));

// ── Workspace info ──

interface WorkspaceInfo {
  name: string;
  userEmail: string;
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected JSON object response");
  }

  return { ...value };
}

function getOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function parseWorkspaceResponse(value: unknown): WorkspaceInfo {
  const record = getRecord(value);
  return {
    name: getOptionalString(record, "name") || "unknown",
    userEmail: getOptionalString(record, "user_email") || "unknown",
  };
}

function parseDeploymentsResponse(value: unknown): Array<{ id: string; status: string; live?: boolean }> {
  const record = getRecord(value);
  const deployments = record.deployments;

  if (!Array.isArray(deployments)) {
    return [];
  }

  return deployments.flatMap((deployment) => {
    const item = getRecord(deployment);
    const id = getOptionalString(item, "id");
    const status = getOptionalString(item, "status");
    const live = typeof item.live === "boolean" ? item.live : undefined;

    if (!id || !status) {
      return [];
    }

    return [{ id, status, live }];
  });
}

function parseDeployResponse(value: unknown): DeployResponse {
  const record = getRecord(value);
  const result = getOptionalString(record, "result");

  if (result !== "success" && result !== "failed" && result !== "no_changes") {
    throw new Error("Unexpected deployment response");
  }

  const deploymentRecord = record.deployment ? getRecord(record.deployment) : undefined;
  const errors = Array.isArray(record.errors)
    ? record.errors.flatMap((error) => {
        const item = getRecord(error);
        const message = getOptionalString(item, "error");
        if (!message) return [];
        return [{ filename: getOptionalString(item, "filename"), error: message }];
      })
    : undefined;

  const deploymentErrors = Array.isArray(deploymentRecord?.errors)
    ? deploymentRecord.errors.flatMap((error) => {
        const item = getRecord(error);
        const message = getOptionalString(item, "error");
        if (!message) return [];
        return [{ filename: getOptionalString(item, "filename"), error: message }];
      })
    : undefined;

  return {
    result,
    error: getOptionalString(record, "error"),
    errors,
    deployment: deploymentRecord
      ? {
          id: getOptionalString(deploymentRecord, "id") || "",
          status: getOptionalString(deploymentRecord, "status") || "",
          new_datasource_names: Array.isArray(deploymentRecord.new_datasource_names)
            ? deploymentRecord.new_datasource_names.filter((value): value is string => typeof value === "string")
            : undefined,
          new_pipe_names: Array.isArray(deploymentRecord.new_pipe_names)
            ? deploymentRecord.new_pipe_names.filter((value): value is string => typeof value === "string")
            : undefined,
          errors: deploymentErrors,
        }
      : undefined,
  };
}

function parseDeploymentStatusResponse(value: unknown): DeploymentStatusResponse {
  const record = getRecord(value);
  const deployment = getRecord(record.deployment);
  const id = getOptionalString(deployment, "id");
  const status = getOptionalString(deployment, "status");

  if (!id || !status) {
    throw new Error("Unexpected deployment status response");
  }

  return {
    result: getOptionalString(record, "result") || "unknown",
    deployment: {
      id,
      status,
      live: typeof deployment.live === "boolean" ? deployment.live : undefined,
    },
  };
}

async function fetchWorkspaceInfo(baseUrl: string, token: string): Promise<WorkspaceInfo> {
  const resp = await fetch(new URL("/v1/workspace", baseUrl).toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch workspace info: ${resp.status} ${resp.statusText}`);
  }
  return parseWorkspaceResponse(await resp.json());
}

// ── Deploy ──

interface ResourceFile {
  name: string;
  content: string;
}

async function deployResources(
  baseUrl: string,
  token: string,
  datasources: ResourceFile[],
  pipes: ResourceFile[],
): Promise<{ success: boolean; error?: string; errors?: Array<{ filename?: string; error: string }> }> {
  const base = baseUrl.replace(/\/$/, "");

  // Clean up stale non-live deployments
  try {
    const resp = await fetch(`${base}/v1/deployments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      for (const d of parseDeploymentsResponse(await resp.json())) {
        if (!d.live && d.status !== "live") {
          await fetch(`${base}/v1/deployments/${d.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
    }
  } catch {
    // ignore cleanup errors
  }

  // Build multipart form
  const formData = new FormData();
  for (const ds of datasources) {
    formData.append("data_project://", new Blob([ds.content], { type: "text/plain" }), `${ds.name}.datasource`);
  }
  for (const pipe of pipes) {
    formData.append("data_project://", new Blob([pipe.content], { type: "text/plain" }), `${pipe.name}.pipe`);
  }

  // Create deployment
  const deployResp = await fetch(`${base}/v1/deploy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const deployBody = parseDeployResponse(await deployResp.json());

  if (deployBody.result === "failed") {
    const errors = deployBody.errors ?? deployBody.deployment?.errors;
    return {
      success: false,
      ...(deployBody.error !== undefined ? { error: deployBody.error } : undefined),
      ...(errors !== undefined ? { errors } : undefined),
    };
  }

  if (deployBody.result === "no_changes") {
    return { success: true };
  }

  const deploymentId = deployBody.deployment?.id;
  if (!deploymentId) {
    return { success: false, error: "No deployment ID in response" };
  }

  // Poll until ready
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const statusResp = await fetch(`${base}/v1/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusBody = parseDeploymentStatusResponse(await statusResp.json());

    if (statusBody.deployment.status === "data_ready") {
      break;
    }
    if (statusBody.deployment.status === "failed") {
      return { success: false, error: "Deployment failed during data migration" };
    }
  }

  // Promote to live
  const promoteResp = await fetch(`${base}/v1/deployments/${deploymentId}/set-live`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!promoteResp.ok) {
    const text = await promoteResp.text();
    return { success: false, error: `Failed to promote deployment: ${text}` };
  }

  return { success: true };
}

// ── Command action ──

export async function selfhostAction(
  options: SelfhostOptions,
  { console: output, process }: GokeExecutionContext,
) {
  clack.intro(picocolors.bold("Strada — Self-hosted Tinybird setup"));

  let token = options.token;
  let baseUrl = options.baseUrl;

  // ── Auth ──
  if (token && baseUrl) {
    clack.log.info(`Using provided token for ${baseUrl}`);
  } else if (token && !baseUrl) {
    clack.log.error("--base-url is required when using --token");
    return process.exit(1);
  } else {
    clack.log.info("Opening browser to authenticate with Tinybird...");

    try {
      const auth = await browserLogin();
      token = auth.token;
      baseUrl = auth.baseUrl;

      // Fetch workspace info (the OAuth callback doesn't always include it)
      const workspace = await fetchWorkspaceInfo(baseUrl, token);

      clack.log.success(
        `Authenticated as ${picocolors.cyan(workspace.userEmail)} ` + `in workspace ${picocolors.cyan(workspace.name)}`,
      );
    } catch (err) {
      clack.log.error(err instanceof Error ? err.message : String(err));
      return process.exit(1);
    }
  }

  if (!token || !baseUrl) {
    clack.log.error("Tinybird authentication did not return a token and base URL");
    return process.exit(1);
  }

  // ── Load resources ──
  const spinner = clack.spinner();
  spinner.start("Loading Tinybird resource files...");

  let resources;
  try {
    resources = loadTinybirdResources();
  } catch (err) {
    spinner.stop("Failed to load resources");
    clack.log.error(err instanceof Error ? err.message : String(err));
    return process.exit(1);
  }

  spinner.message(`Found ${resources.datasources.length} datasources, ${resources.pipes.length} pipes`);

  // ── Deploy ──
  spinner.message("Deploying to Tinybird...");

  try {
    const result = await deployResources(baseUrl, token, resources.datasources, resources.pipes);

    if (!result.success) {
      spinner.stop("Deployment failed");
      if (result.error) clack.log.error(result.error);
      if (result.errors?.length) {
        for (const e of result.errors) {
          clack.log.error(`  ${e.filename || ""}: ${e.error}`);
        }
      }
      return process.exit(1);
    }

    spinner.stop("Deployed successfully");
  } catch (err) {
    spinner.stop("Deployment failed");
    clack.log.error(err instanceof Error ? err.message : String(err));
    return process.exit(1);
  }

  // ── Output ──
  clack.log.success("Strada is deployed to your Tinybird workspace!");

  output.log("");
  output.log(picocolors.bold("Add these environment variables to your otel-collector:"));
  output.log("");
  output.log(`  ${picocolors.cyan("TINYBIRD_ENDPOINT")}=${baseUrl}`);
  output.log(`  ${picocolors.cyan("TINYBIRD_TOKEN")}=${token}`);
  output.log("");
  output.log(picocolors.dim("ProjectId is always empty string for self-hosted — no row-level filtering needed."));
  output.log(picocolors.dim("For reads, use this same workspace admin token with Tinybird /v0/sql queries."));

  clack.outro("Done");
}
