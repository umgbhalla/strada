// Health check dispatch. Called by the cron trigger every 5 minutes.
// Loads health_check rules from D1, groups them by org, and spawns a
// single HealthCheckWorkflow instance with lightweight params (IDs only,
// no credentials). The workflow resolves DB config from D1 inside each step.

import { env } from 'cloudflare:workers'
import { getLogger, flush } from '@strada.sh/sdk'
import { getDb } from './db.ts'
import type { HealthCheckWorkflowParams, CheckPayload } from './health-check-workflow.ts'

const logger = getLogger('health-check-dispatch')

export async function dispatchHealthChecks(): Promise<void> {
  const db = getDb()

  // Load all enabled health_check rules with destinations and org
  const rules = await db.query.alertRule.findMany({
    where: { type: 'health_check', enabled: true },
    with: { destinations: true, org: true, project: true },
  })

  if (rules.length === 0) return

  // Build per-check payloads, each carrying its own project and destinations
  const checks: CheckPayload[] = []

  for (const rule of rules) {
    if (!rule.checkUrl) {
      logger.warn({ message: 'health_check rule missing check_url, skipping', ruleId: rule.id })
      continue
    }
    if (!rule.destinations || rule.destinations.length === 0) {
      logger.info({ message: 'health_check rule has no destinations, skipping', ruleId: rule.id })
      continue
    }

    // Resolve the project for this check. Rules can be scoped to a project,
    // or apply to all projects in the org (use first project for ClickHouse scoping).
    let projectId = rule.projectId
    if (!projectId) {
      const firstProject = await db.query.project.findFirst({ where: { orgId: rule.orgId } })
      if (!firstProject) {
        logger.warn({ message: 'no projects in org, skipping health check', orgId: rule.orgId, ruleId: rule.id })
        continue
      }
      projectId = firstProject.id
    }

    checks.push({
      checkId: rule.id,
      orgId: rule.orgId,
      orgName: rule.org?.name ?? 'Unknown',
      projectId,
      name: rule.name,
      url: rule.checkUrl,
      method: rule.checkMethod ?? 'GET',
      intervalMinutes: rule.checkIntervalMinutes ?? 5,
      expectedStatusMin: rule.checkExpectedStatusMin ?? 200,
      expectedStatusMax: rule.checkExpectedStatusMax ?? 299,
      timeoutMs: rule.checkTimeoutMs ?? 10000,
      failureThreshold: rule.checkFailureThreshold ?? 2,
      autoDisableAfterHours: rule.checkAutoDisableAfterHours ?? 24,
      cooldownMinutes: rule.cooldownMinutes ?? 60,
      destinations: rule.destinations.map((d) => ({
        channel: d.channel,
        destination: d.destination,
      })),
    })
  }

  if (checks.length === 0) return

  // Group by orgId so each org is a separate workflow step
  const orgIds = [...new Set(checks.map((c) => c.orgId))]
  logger.info({ message: 'dispatching health check workflow', orgCount: orgIds.length, totalChecks: checks.length })

  const params: HealthCheckWorkflowParams = { checks }

  try {
    await env.HEALTH_CHECK_WORKFLOW.create({
      id: `health-${Date.now()}`,
      params,
    })
  } catch (err) {
    logger.error({ message: 'failed to create health check workflow instance', error: String(err) })
  }

  await flush()
}
