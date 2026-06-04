// Health check workflow. Runs as a Cloudflare Workflow, triggered by the
// website cron every 5 minutes. Each org gets its own durable step.
//
// Credentials are NOT in the workflow params. The workflow resolves DB config
// from D1 inside each step, so tenant secrets never persist in Cloudflare
// Workflow state.
//
// Each check carries its own projectId and destinations (not shared per-org).
// Checks respect intervalMinutes by querying LastCheckedAt from ClickHouse.
// Auto-disable updates both ClickHouse config AND D1 alert_rule.enabled.

import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { env } from 'cloudflare:workers'
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
  type HealthCheckAlertData,
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
  destinations: Array<{ channel: string; destination: string }>
}

export interface HealthCheckWorkflowParams {
  checks: CheckPayload[]
}

// ── Internal types ────────────────────────────────────────────────

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

interface OrgContext {
  orgId: string
  dbConfig: DbConfig
  checks: Array<{ check: CheckPayload; project: ProjectJwtInfo }>
}

export class HealthCheckWorkflow extends WorkflowEntrypoint {
  override async run(event: WorkflowEvent<HealthCheckWorkflowParams>, step: WorkflowStep) {
    const { checks } = event.payload

    // Group checks by orgId for per-org steps
    const orgMap = new Map<string, CheckPayload[]>()
    for (const check of checks) {
      const existing = orgMap.get(check.orgId) ?? []
      existing.push(check)
      orgMap.set(check.orgId, existing)
    }

    for (const [orgId, orgChecks] of orgMap) {
      await step.do(
        `org-${orgId}`,
        {
          retries: { limit: 1, delay: '10 seconds' },
          timeout: '5 minutes',
        },
        async () => {
          await processOrgChecks(orgId, orgChecks)
        },
      )
    }
  }
}

async function processOrgChecks(orgId: string, checks: CheckPayload[]): Promise<void> {
  // Resolve DB config from D1 (no credentials in workflow params)
  const db = getDb()
  const dbConfig = await db.query.database.findFirst({ where: { orgId } })
  if (!dbConfig) {
    logger.warn({ message: 'no database config for org', orgId })
    return
  }

  // Resolve project JWTs for each unique projectId
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

  // Filter checks that are due (respect intervalMinutes)
  const dueChecks: Array<{ check: CheckPayload; project: ProjectJwtInfo }> = []
  for (const check of checks) {
    const project = projectCache.get(check.projectId)
    if (!project) {
      logger.warn({ message: 'project not found for check', checkId: check.checkId, projectId: check.projectId })
      continue
    }

    // Query LastCheckedAt to see if this check is due
    if (check.intervalMinutes > 5) {
      const configState = await queryCheckConfig(dbConfig, project, check.checkId)
      if (configState?.lastCheckedAt) {
        const lastMs = new Date(configState.lastCheckedAt).getTime()
        const intervalMs = check.intervalMinutes * 60_000
        if (Date.now() - lastMs < intervalMs) {
          continue // not due yet
        }
      }
    }

    dueChecks.push({ check, project })
  }

  if (dueChecks.length === 0) return

  // Run all due checks in parallel
  const results = await Promise.allSettled(
    dueChecks.map(({ check }) => runCheck(check)),
  )

  // Write results and handle alerts
  const nowIso = new Date().toISOString()
  const now = Date.now()

  for (let i = 0; i < results.length; i++) {
    const settled = results[i]!
    const { check, project } = dueChecks[i]!
    let result: CheckResult

    if (settled.status === 'fulfilled') {
      result = settled.value
    } else {
      logger.error({ message: 'check execution failed', checkId: check.checkId, url: check.url, error: String(settled.reason) })
      result = {
        checkId: check.checkId,
        url: check.url,
        method: check.method,
        statusCode: 0,
        latencyMs: 0,
        success: false,
        errorMessage: String(settled.reason),
        responseBody: '',
        responseHeaders: {},
      }
    }

    // Write result to ClickHouse
    try {
      await insertBackendRow({
        dbConfig,
        table: 'otel_health_checks',
        row: {
          ProjectId: check.projectId,
          CheckId: result.checkId,
          Url: result.url,
          Method: result.method,
          StatusCode: result.statusCode,
          LatencyMs: result.latencyMs,
          Success: result.success ? 1 : 0,
          ErrorMessage: result.errorMessage,
          ResponseBody: result.responseBody,
          ResponseHeaders: result.responseHeaders,
          Timestamp: nowIso,
        },
      })
    } catch (err) {
      logger.error({ message: 'failed to write check result', checkId: result.checkId, error: String(err) })
    }

    // Handle alerts
    try {
      await handleCheckAlerts({ dbConfig, project, check, currentResult: result, now })
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
    checkId: check.checkId,
    url: check.url,
    method: check.method,
    statusCode,
    latencyMs: Date.now() - start,
    success,
    errorMessage,
    responseBody,
    responseHeaders,
  }
}

async function handleCheckAlerts(ctx: {
  dbConfig: DbConfig
  project: ProjectJwtInfo
  check: CheckPayload
  currentResult: CheckResult
  now: number
}): Promise<void> {
  const { dbConfig, project, check, currentResult, now } = ctx
  const nowIso = new Date(now).toISOString()

  const configState = await queryCheckConfig(dbConfig, project, check.checkId)
  const lastResults = await queryLastResults(dbConfig, project, check.checkId, check.failureThreshold)
  const allFailed = lastResults.length >= check.failureThreshold && lastResults.every((r) => !r.success)
  const wasAlerting = configState?.lastAlertStatus === 'alerting'

  if (currentResult.success && wasAlerting) {
    // ── Recovery ──
    logger.info({ message: 'health check recovered', checkId: check.checkId, url: check.url })

    await dispatchToDestinations(check.destinations, (dest) =>
      sendHealthCheckNotification(dest, {
        checkName: check.name, url: check.url, method: check.method,
        statusCode: currentResult.statusCode, latencyMs: currentResult.latencyMs,
        errorMessage: '', consecutiveFailures: 0, orgName: check.orgName, recovered: true,
      }),
    )

    await updateCheckConfig(dbConfig, project, check, {
      LastAlertStatus: 'ok', FirstFailedAt: null, LastCheckedAt: nowIso, Version: now,
    })
    return
  }

  if (allFailed && !wasAlerting) {
    // ── New alert ──
    logger.info({ message: 'health check alert', checkId: check.checkId, url: check.url, consecutiveFailures: lastResults.length })

    const delivered = await dispatchToDestinations(check.destinations, (dest) =>
      sendHealthCheckNotification(dest, {
        checkName: check.name, url: check.url, method: check.method,
        statusCode: currentResult.statusCode, latencyMs: currentResult.latencyMs,
        errorMessage: currentResult.errorMessage, consecutiveFailures: lastResults.length,
        orgName: check.orgName, recovered: false,
      }),
    )

    if (delivered) {
      await updateCheckConfig(dbConfig, project, check, {
        LastAlertStatus: 'alerting', FirstFailedAt: configState?.firstFailedAt || nowIso,
        LastCheckedAt: nowIso, Version: now,
      })
    }
    return
  }

  // ── Auto-disable ──
  if (check.autoDisableAfterHours > 0 && configState?.firstFailedAt) {
    const hoursDown = (now - new Date(configState.firstFailedAt).getTime()) / (1000 * 60 * 60)
    if (hoursDown >= check.autoDisableAfterHours) {
      logger.info({ message: 'auto-disabling health check', checkId: check.checkId, hoursDown })

      await dispatchToDestinations(check.destinations, (dest) =>
        sendHealthCheckNotification(dest, {
          checkName: check.name, url: check.url, method: check.method,
          statusCode: currentResult.statusCode, latencyMs: currentResult.latencyMs,
          errorMessage: `Auto-disabled after ${Math.round(hoursDown)} hours of continuous failure`,
          consecutiveFailures: lastResults.length, orgName: check.orgName, recovered: false,
        }),
      )

      // Update ClickHouse config
      await updateCheckConfig(dbConfig, project, check, {
        Enabled: 0, DisabledReason: 'auto', LastAlertStatus: 'alerting',
        LastCheckedAt: nowIso, Version: now,
      })

      // Update D1 alert_rule.enabled so dispatch stops including this check
      try {
        const db = getDb()
        await db.update(schema.alertRule)
          .set({ enabled: false, updatedAt: Date.now() })
          .where(orm.eq(schema.alertRule.id, check.checkId))
          .limit(1)
      } catch (err) {
        logger.error({ message: 'failed to disable check in D1', checkId: check.checkId, error: String(err) })
      }
      return
    }
  }

  // ── Regular state update ──
  const updates: Record<string, unknown> = { LastCheckedAt: nowIso, Version: now }
  if (!currentResult.success && !configState?.firstFailedAt) {
    updates.FirstFailedAt = nowIso
  }
  if (currentResult.success) {
    updates.FirstFailedAt = null
    if (!wasAlerting) updates.LastAlertStatus = 'ok'
  }
  await updateCheckConfig(dbConfig, project, check, updates)
}

// ── ClickHouse query helpers ─────────────────────────────────────

interface CheckConfigState {
  lastAlertStatus: string
  firstFailedAt: string | null
  lastCheckedAt: string | null
  enabled: number
}

async function queryCheckConfig(
  dbConfig: DbConfig, project: ProjectJwtInfo, checkId: string,
): Promise<CheckConfigState | null> {
  const sql = [
    'SELECT',
    '    argMax(LastAlertStatus, Version) AS LastAlertStatus,',
    '    argMax(FirstFailedAt, Version) AS FirstFailedAt,',
    '    argMax(LastCheckedAt, Version) AS LastCheckedAt,',
    '    argMax(Enabled, Version) AS Enabled',
    'FROM otel_health_checks_config',
    `WHERE CheckId = '${checkId}'`,
    'GROUP BY CheckId',
    'LIMIT 1',
    'FORMAT JSON',
  ].join('\n')

  try {
    const result = await executeBackendQuery({ dbConfig, project, sql })
    const row = result.data?.[0]
    if (!row) return null
    return {
      lastAlertStatus: String(row.LastAlertStatus ?? ''),
      firstFailedAt: row.FirstFailedAt ? String(row.FirstFailedAt) : null,
      lastCheckedAt: row.LastCheckedAt ? String(row.LastCheckedAt) : null,
      enabled: Number(row.Enabled ?? 1),
    }
  } catch (err) {
    logger.error({ message: 'queryCheckConfig failed', checkId, error: String(err) })
    return null
  }
}

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

async function updateCheckConfig(
  dbConfig: DbConfig, project: ProjectJwtInfo, check: CheckPayload,
  updates: Record<string, unknown>,
): Promise<void> {
  const current = await queryFullCheckConfig(dbConfig, project, check.checkId)

  const row = {
    ProjectId: check.projectId,
    CheckId: check.checkId,
    Name: current?.Name ?? check.name,
    Url: current?.Url ?? check.url,
    Method: current?.Method ?? check.method,
    IntervalMinutes: current?.IntervalMinutes ?? check.intervalMinutes,
    ExpectedStatusMin: current?.ExpectedStatusMin ?? check.expectedStatusMin,
    ExpectedStatusMax: current?.ExpectedStatusMax ?? check.expectedStatusMax,
    TimeoutMs: current?.TimeoutMs ?? check.timeoutMs,
    FailureThreshold: current?.FailureThreshold ?? check.failureThreshold,
    AutoDisableAfterHours: current?.AutoDisableAfterHours ?? check.autoDisableAfterHours,
    Enabled: current?.Enabled ?? 1,
    DisabledReason: current?.DisabledReason ?? '',
    LastCheckedAt: current?.LastCheckedAt ?? null,
    LastAlertStatus: current?.LastAlertStatus ?? '',
    FirstFailedAt: current?.FirstFailedAt ?? null,
    Version: Date.now(),
    UpdatedAt: new Date().toISOString(),
    ...updates,
  }

  try {
    await insertBackendRow({ dbConfig, table: 'otel_health_checks_config', row })
  } catch (err) {
    logger.error({ message: 'updateCheckConfig failed', checkId: check.checkId, error: String(err) })
  }
}

async function queryFullCheckConfig(
  dbConfig: DbConfig, project: ProjectJwtInfo, checkId: string,
): Promise<Record<string, unknown> | null> {
  const sql = [
    'SELECT',
    '    argMax(Name, Version) AS Name,',
    '    argMax(Url, Version) AS Url,',
    '    argMax(Method, Version) AS Method,',
    '    argMax(IntervalMinutes, Version) AS IntervalMinutes,',
    '    argMax(ExpectedStatusMin, Version) AS ExpectedStatusMin,',
    '    argMax(ExpectedStatusMax, Version) AS ExpectedStatusMax,',
    '    argMax(TimeoutMs, Version) AS TimeoutMs,',
    '    argMax(FailureThreshold, Version) AS FailureThreshold,',
    '    argMax(AutoDisableAfterHours, Version) AS AutoDisableAfterHours,',
    '    argMax(Enabled, Version) AS Enabled,',
    '    argMax(DisabledReason, Version) AS DisabledReason,',
    '    argMax(LastCheckedAt, Version) AS LastCheckedAt,',
    '    argMax(LastAlertStatus, Version) AS LastAlertStatus,',
    '    argMax(FirstFailedAt, Version) AS FirstFailedAt',
    'FROM otel_health_checks_config',
    `WHERE CheckId = '${checkId}'`,
    'GROUP BY CheckId',
    'LIMIT 1',
    'FORMAT JSON',
  ].join('\n')

  try {
    const result = await executeBackendQuery({ dbConfig, project, sql })
    return result.data?.[0] ?? null
  } catch (err) {
    logger.error({ message: 'queryFullCheckConfig failed', checkId, error: String(err) })
    return null
  }
}
