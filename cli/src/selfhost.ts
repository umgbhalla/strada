// Self-hosted Tinybird setup command.
//
// Tinybird browser auth lives in tinybird-browser-login.ts because the local
// callback server is easier to reason about as a small isolated module.

import * as clack from "@clack/prompts";
import { goke } from "goke";
import type { GokeExecutionContext } from "goke";
import picocolors from "picocolors";
import dedent from "string-dedent";
import { browserLogin } from "./tinybird-browser-login.ts";
import { loadTinybirdResources } from "./tinybird-resources.ts";
import { TinybirdClient } from "./tinybird.ts";

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

async function deployResources({ client, datasources, pipes }: {
  client: TinybirdClient;
  datasources: Array<{ name: string; content: string }>;
  pipes: Array<{ name: string; content: string }>;
}) {
  const deployments = await client.listDeployments();
  if (!(deployments instanceof Error)) {
    for (const deployment of deployments) {
      if (!deployment.live && deployment.status !== "live") {
        const deleteResult = await client.deleteDeployment({ deploymentId: deployment.id });
        if (deleteResult instanceof Error) {
          console.warn(`Failed to delete stale deployment ${deployment.id}:`, deleteResult.message);
        }
      }
    }
  } else {
    console.warn("Failed to list stale deployments before deploy:", deployments.message);
  }

  const deployResponse = await client.createDeployment({ datasources, pipes });
  if (deployResponse instanceof Error) return deployResponse;
  if (deployResponse.result === "failed") {
    return new Error(deployResponse.error || deployResponse.errors?.map((error) => error.error).join("\n") || "Tinybird deployment failed");
  }
  if (deployResponse.result === "no_changes") return null;

  const deploymentId = deployResponse.deployment?.id;
  if (!deploymentId) {
    return new Error("No deployment ID in Tinybird response");
  }

  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await client.getDeploymentStatus({ deploymentId });
    if (statusResponse instanceof Error) return statusResponse;
    if (statusResponse.deployment.status === "data_ready") break;
    if (statusResponse.deployment.status === "failed" || statusResponse.deployment.status === "error") {
      return new Error(`Deployment failed with status ${statusResponse.deployment.status}`);
    }
  }

  return client.promoteDeployment({ deploymentId });
}

export async function selfhostAction(
  options: SelfhostOptions,
  { console: output, process }: GokeExecutionContext,
) {
  clack.intro(picocolors.bold("Strada — Self-hosted Tinybird setup"));

  const auth = await (async () => {
    if (options.token && options.baseUrl) {
      clack.log.info(`Using provided token for ${options.baseUrl}`);
      return { token: options.token, baseUrl: options.baseUrl };
    }

    if (options.token && !options.baseUrl) {
      return new Error("--base-url is required when using --token");
    }

    clack.log.info("Opening browser to authenticate with Tinybird...");
    return browserLogin();
  })();
  if (auth instanceof Error) {
    clack.log.error(auth.message);
    return process.exit(1);
  }

  const client = new TinybirdClient({ baseUrl: auth.baseUrl, token: auth.token });
  const workspace = await client.getWorkspace();
  if (workspace instanceof Error) {
    clack.log.error(workspace.message);
    return process.exit(1);
  }

  clack.log.success(`Authenticated as ${picocolors.cyan(workspace.user_email)} in workspace ${picocolors.cyan(workspace.name)}`);

  const spinner = clack.spinner();
  spinner.start("Loading Tinybird resource files...");

  const resources = await (async () => loadTinybirdResources())().catch((cause) => new Error(String(cause instanceof Error ? cause.message : cause)));
  if (resources instanceof Error) {
    spinner.stop("Failed to load resources");
    clack.log.error(resources.message);
    return process.exit(1);
  }

  spinner.message(`Found ${resources.datasources.length} datasources, ${resources.pipes.length} pipes`);
  spinner.message("Deploying to Tinybird...");

  const deployment = await deployResources({ client, datasources: resources.datasources, pipes: resources.pipes });
  if (deployment instanceof Error) {
    spinner.stop("Deployment failed");
    clack.log.error(deployment.message);
    return process.exit(1);
  }

  spinner.stop("Deployed successfully");
  clack.log.success("Strada is deployed to your Tinybird workspace!");

  output.log("");
  output.log(picocolors.bold("Add these environment variables to your otel-collector:"));
  output.log("");
  output.log(`  ${picocolors.cyan("TINYBIRD_ENDPOINT")}=${auth.baseUrl}`);
  output.log(`  ${picocolors.cyan("TINYBIRD_TOKEN")}=${auth.token}`);
  output.log("");
  output.log(picocolors.dim("ProjectId is always empty string for self-hosted — no row-level filtering needed."));
  output.log(picocolors.dim("For reads, use this same workspace admin token with Tinybird /v0/sql queries."));

  clack.outro("Done");
}
