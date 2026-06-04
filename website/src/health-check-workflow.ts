// Health check workflow. Runs as a Cloudflare Workflow, triggered by the
// website cron every 5 minutes. Each org gets its own parallel durable step.
//
// Workflow params contain ONLY IDs and check config (URL, method, thresholds).
// No credentials, no webhook URLs, no tokens. The workflow resolves
// destinations, DB config, and state from D1 inside each step.
//
// All mutable state (lastCheckedAt, lastAlertStatus, firstFailedAt, etc.)
// lives in D1 on the alert_rule table. No ClickHouse config table.

import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import * as orm from 'drizzle-orm'
import * as schema from 'db/src/schema.ts'
import { getLogger } from '@strada.sh/sdk'
import {
  insertBackendRow,
  executeBackendQuery,
  type DbConfig,
  type ProjectJwtInfo,
} from './query-backend.ts'
import {
  sendHealthCheckNotification,
  dispatchToDestinations,
} from './alert-notify.ts'
import { getDb } from './db.ts'

const logger = getLogger('health-check-workflow')

const EXCLUDED_HEADERS = new Set(['set-cookie', 'set-cookie2'])
const MAX_RESPONSE_BODY = 16_384

// ── Workflow params (lightweight, no credentials) ─────────────────

export interface CheckPayload {
  checkId: string
  orgId: string
  orgName: string
  projectId: string
  name: string
  url: string
  method: string
  intervalMinutes: number
  expectedStatusMin: number
  expectedStatusMax: number
  timeoutMs: number
  failureThreshold: number
  autoDisableAfterHours: number
  cooldownMinutes: number
}

export interface HealthCheckWorkflowParams {
  checks: CheckPayload[]
}

interface CheckResult {
  checkId: string
  url: string
  method: string
  statusCode: number
  latencyMs: number
  success: boolean
  errorMessage: string
  responseBody: string
  responseHeaders: Record<string, string>
}

export class HealthCheckWorkflow extends WorkflowEntrypoint {
  override async run(event: WorkflowEvent<HealthCheckWorkflowParams>, step: WorkflowStep) {
    const { checks } = event.payload

    const orgMap = new Map<string, CheckPayload[]>()
    for (const check of checks) {
      const existing = orgMap.get(check.orgId) ?? []
      existing.push(check)
      orgMap.set(check.orgId, existing)
    }

    await Promise.all(
      [...orgMap.entries()].map(([orgId, orgChecks]) =>
        step.do(
          `org-${orgId}`,
          { retries: { limit: 1, delay: '10 seconds' }, timeout: '5 minutes' },
          async () => { await processOrgChecks(orgId, orgChecks) },
        ),
      ),
    )
  }
}

async function processOrgChecks(orgId: string, checks: CheckPayload[]): Promise<void> {
  const db = getDb()

  // Resolve DB config from D1
  const dbConfig = await db.query.database.findFirst({ where: { orgId } })
  if (!dbConfig) {
    logger.warn({ message: 'no database config for org', orgId })
    return
  }

  // Resolve destinations per check from D1
  const checkDestinations = new Map<string, Array<{ channel: string; destination: string }>>()
  for (const check of checks) {
    const rule = await db.query.alertRule.findFirst({
      where: { id: check.checkId },
      with: { destinations: true },
    })
    checkDestinations.set(
      check.checkId,
      (rule?.destinations ?? []).map((d) => ({ channel: d.channel, destination: d.destination })),
    )
  }

  // Resolve project JWTs
  const projectCache = new Map<string, ProjectJwtInfo>()
  for (const check of checks) {
    if (!projectCache.has(check.projectId)) {
      const project = await db.query.project.findFirst({ where: { id: check.projectId } })
      if (project) {
        projectCache.set(check.projectId, {
          id: project.id,
          tinybirdJwt: project.tinybirdJwt,
          tinybirdJwtDatasources: project.tinybirdJwtDatasources,
        })
      }
    }
  }

  // Filter checks that are due (respect intervalMinutes).
  // Read state from D1 for each check.
  const dueChecks: Array<{ check: CheckPayload; project: ProjectJwtInfo; rule: typeof schema.alertRule.$inferSelect }> = []
  for (const check of checks) {
    const project = projectCache.get(check.projectId)
    if (!project) {
      logger.warn({ message: 'project not found', checkId: check.checkId, projectId: check.projectId })
      continue
    }

    // Read current state from D1
    const rule = await db.query.alertRule.findFirst({ where: { id: check.checkId } })
    if (!rule || !rule.enabled) continue

    // Check if due based on intervalMinutes
    if (check.intervalMinutes > 5 && rule.checkLastCheckedAt) {
      const intervalMs = check.intervalMinutes * 60_000
      if (Date.now() - rule.checkLastCheckedAt < intervalMs) {
        continue // not due yet
      }
    }

    dueChecks.push({ check, project, rule })
  }

  if (dueChecks.length === 0) return

  // Run all due checks in parallel
  const results = await Promise.allSettled(
    dueChecks.map(({ check }) => runCheck(check)),
  )

  // Process results: write to ClickHouse, handle alerts, update D1 state
  const nowIso = new Date().toISOString()
  const now = Date.now()

  for (let i = 0; i < results.length; i++) {
    const settled = results[i]!
    const { check, project, rule } = dueChecks[i]!
    const destinations = checkDestinations.get(check.checkId) ?? []
    let result: CheckResult

    if (settled.status === 'fulfilled') {
      result = settled.value
    } else {
      logger.error({ message: 'check execution failed', checkId: check.checkId, error: String(settled.reason) })
      result = {
        checkId: check.checkId, url: check.url, method: check.method,
        statusCode: 0, latencyMs: 0, success: false,
        errorMessage: String(settled.reason), responseBody: '', responseHeaders: {},
      }
    }

    // Write result to ClickHouse
    try {
      await insertBackendRow({
        dbConfig, table: 'otel_health_checks',
        row: {
          ProjectId: check.projectId, CheckId: result.checkId,
          Url: result.url, Method: result.method,
          StatusCode: result.statusCode, LatencyMs: result.latencyMs,
          Success: result.success ? 1 : 0, ErrorMessage: result.errorMessage,
          ResponseBody: result.responseBody, ResponseHeaders: result.responseHeaders,
          Timestamp: nowIso,
        },
      })
    } catch (err) {
      logger.error({ message: 'failed to write check result', checkId: result.checkId, error: String(err) })
    }

    // Handle alerts and update D1 state
    try {
      await handleCheckAlerts({ dbConfig, project, check, rule, destinations, currentResult: result, now })
    } catch (err) {
      logger.error({ message: 'alert handling failed', checkId: check.checkId, error: String(err) })
    }
  }
}

async function runCheck(check: CheckPayload): Promise<CheckResult> {
  const start = Date.now()
  let statusCode = 0
  let responseBody = ''
  let responseHeaders: Record<string, string> = {}
  let errorMessage = ''
  let success = false

  try {
    const res = await fetch(check.url, {
      method: check.method,
      signal: AbortSignal.timeout(check.timeoutMs),
      redirect: 'follow',
      headers: { 'User-Agent': 'Strada-Health-Check/1.0' },
    })

    statusCode = res.status
    success = statusCode >= check.expectedStatusMin && statusCode <= check.expectedStatusMax

    if (!success) {
      try {
        const body = await res.text()
        responseBody = body.slice(0, MAX_RESPONSE_BODY)
      } catch {
        responseBody = '(failed to read response body)'
      }
      for (const [key, value] of res.headers.entries()) {
        if (!EXCLUDED_HEADERS.has(key.toLowerCase())) {
          responseHeaders[key] = value
        }
      }
    }
  } catch (err: unknown) {
    const error = err as Error
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      errorMessage = `Timeout after ${check.timeoutMs}ms`
    } else {
      errorMessage = String(error.message || error)
    }
  }

  return {
    checkId: check.checkId, url: check.url, method: check.method,
    statusCode, latencyMs: Date.now() - start, success,
    errorMessage, responseBody, responseHeaders,
  }
}

async function handleCheckAlerts(ctx: {
  dbConfig: DbConfig
  project: ProjectJwtInfo
  check: CheckPayload
  rule: typeof schema.alertRule.$inferSelect
  destinations: Array<{ channel: string; destination: string }>
  currentResult: CheckResult
  now: number
}): Promise<void> {
  const { dbConfig, project, check, rule, destinations, currentResult, now } = ctx
  const db = getDb()

  // Query last N results from ClickHouse for consecutive failure detection
  const lastResults = await queryLastResults(dbConfig, project, check.checkId, check.failureThreshold)
  const allFailed = lastResults.length >= check.failureThreshold && lastResults.every((r) => !r.success)
  const wasAlerting = rule.checkLastAlertStatus === 'alerting'

  // ── Recovery: was alerting, now passing ──
  if (currentResult.success && wasAlerting) {
    logger.info({ message: 'health check recovered', checkId: check.checkId, url: check.url })

    if (destinations.length > 0) {
      await dispatchToDestinations(destinations, (dest) =>
        sendHealthCheckNotification(dest, {
          checkName: check.name, url: check.url, method: check.method,
          statusCode: currentResult.statusCode, latencyMs: currentResult.latencyMs,
          errorMessage: '', consecutiveFailures: 0, orgName: check.orgName, recovered: true,
        }),
      )
    }

    await db.update(schema.alertRule)
      .set({
        checkLastAlertStatus: 'ok',
        checkFirstFailedAt: null,
        checkLastCheckedAt: now,
        updatedAt: now,
      })
      .where(orm.eq(schema.alertRule.id, check.checkId))
      .limit(1)
    return
  }

  // ── Alert: threshold met, check cooldown ──
  if (allFailed) {
    const cooldownMs = check.cooldownMinutes * 60_000
    const lastAlertedMs = rule.lastAlertedAt ?? 0
    const cooldownElapsed = !rule.lastAlertedAt || (now - lastAlertedMs >= cooldownMs)
    const shouldAlert = (!wasAlerting || cooldownElapsed) && destinations.length > 0

    if (shouldAlert) {
      logger.info({ message: wasAlerting ? 'health check re-alert' : 'health check alert', checkId: check.checkId, consecutiveFailures: lastResults.length })

      const delivered = await dispatchToDestinations(destinations, (dest) =>
        sendHealthCheckNotification(dest, {
          checkName: check.name, url: check.url, method: check.method,
          statusCode: currentResult.statusCode, latencyMs: currentResult.latencyMs,
          errorMessage: currentResult.errorMessage, consecutiveFailures: lastResults.length,
          orgName: check.orgName, recovered: false,
        }),
      )

      await db.update(schema.alertRule)
        .set({
          checkLastAlertStatus: 'alerting',
          checkFirstFailedAt: rule.checkFirstFailedAt ?? now,
          ...(delivered ? { lastAlertedAt: now } : {}),
          checkLastCheckedAt: now,
          updatedAt: now,
        })
        .where(orm.eq(schema.alertRule.id, check.checkId))
        .limit(1)
      return
    }
  }

  // ── Auto-disable (only when failing AND threshold met) ──
  if (!currentResult.success && allFailed && check.autoDisableAfterHours > 0 && rule.checkFirstFailedAt) {
    const hoursDown = (now - rule.checkFirstFailedAt) / (1000 * 60 * 60)
    if (hoursDown >= check.autoDisableAfterHours) {
      logger.info({ message: 'auto-disabling health check', checkId: check.checkId, hoursDown })

      if (destinations.length > 0) {
        await dispatchToDestinations(destinations, (dest) =>
          sendHealthCheckNotification(dest, {
            checkName: check.name, url: check.url, method: check.method,
            statusCode: currentResult.statusCode, latencyMs: currentResult.latencyMs,
            errorMessage: `Auto-disabled after ${Math.round(hoursDown)} hours of continuous failure`,
            consecutiveFailures: lastResults.length, orgName: check.orgName, recovered: false,
          }),
        )
      }

      await db.update(schema.alertRule)
        .set({
          enabled: false,
          checkDisabledReason: 'auto',
          checkLastAlertStatus: 'alerting',
          checkLastCheckedAt: now,
          updatedAt: now,
        })
        .where(orm.eq(schema.alertRule.id, check.checkId))
        .limit(1)
      return
    }
  }

  // ── Regular state update ──
  const stateUpdate: Record<string, unknown> = {
    checkLastCheckedAt: now,
    updatedAt: now,
  }
  if (!currentResult.success && !rule.checkFirstFailedAt) {
    stateUpdate.checkFirstFailedAt = now
  }
  if (currentResult.success) {
    stateUpdate.checkFirstFailedAt = null
    if (!wasAlerting) stateUpdate.checkLastAlertStatus = 'ok'
  }

  await db.update(schema.alertRule)
    .set(stateUpdate)
    .where(orm.eq(schema.alertRule.id, check.checkId))
    .limit(1)
}

// ── ClickHouse query (only for check results, not config) ────────

async function queryLastResults(
  dbConfig: DbConfig, project: ProjectJwtInfo, checkId: string, limit: number,
): Promise<Array<{ success: boolean }>> {
  const sql = [
    'SELECT Success',
    'FROM otel_health_checks',
    `WHERE CheckId = '${checkId}'`,
    'ORDER BY Timestamp DESC',
    `LIMIT ${limit}`,
    'FORMAT JSON',
  ].join('\n')

  try {
    const result = await executeBackendQuery({ dbConfig, project, sql })
    return (result.data ?? []).map((row) => ({ success: Number(row.Success) === 1 }))
  } catch (err) {
    logger.error({ message: 'queryLastResults failed', checkId, error: String(err) })
    return []
  }
}
