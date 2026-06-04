// Health check workflow. Runs as a Cloudflare Workflow, triggered by the
// website cron every 5 minutes. Each org gets its own parallel durable step.
//
// Workflow params contain ONLY check IDs and org IDs. All config, state,
// destinations, and DB credentials are resolved from D1 inside each step.
// This ensures fresh config even for queued workflows and prevents
// sensitive data (webhook URLs, DB tokens) from persisting in workflow state.
//
// All mutable state lives in D1 on the alert_rule table. ClickHouse only
// stores append-only check results (otel_health_checks).

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

// ── Cron matching (stateless scheduling) ──────────────────────────
// Evaluates whether a UTC Date matches a standard 5-field cron expression.
// Fields: minute hour day-of-month month day-of-week
// Supports: * (any), */N (step), N-M (range), N,M (list), and combinations.
// Day-of-week: 0 and 7 are both Sunday (standard cron convention).
//
// DOM/DOW OR semantics: when both day-of-month and day-of-week are
// restricted (not *), standard cron matches if EITHER field matches.
// When only one is restricted, it's a simple AND with the other fields.

// Field definitions with min values for correct step baseline on 1-based fields.
// */2 on day-of-month should match 1,3,5... not 2,4,6... because DOM starts at 1.
const FIELD_MINS = [0, 0, 1, 1, 0] // minute, hour, dom, month, dow

export function cronMatches(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const values = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay(),
  ]

  const minute = fieldMatches(parts[0]!, values[0]!, FIELD_MINS[0]!)
  const hour = fieldMatches(parts[1]!, values[1]!, FIELD_MINS[1]!)
  const dom = fieldMatches(parts[2]!, values[2]!, FIELD_MINS[2]!)
  const month = fieldMatches(parts[3]!, values[3]!, FIELD_MINS[3]!)
  // Normalize DOW 7 → 0 (both mean Sunday)
  const dowValue = values[4]! === 7 ? 0 : values[4]!
  const dow = fieldMatches(parts[4]!, dowValue, FIELD_MINS[4]!)

  // Standard cron: when both DOM and DOW are restricted (not *), match if EITHER is true.
  // When only one is restricted, match both normally (AND).
  const domRestricted = parts[2] !== '*'
  const dowRestricted = parts[4] !== '*'
  const dayMatch = (domRestricted && dowRestricted) ? (dom || dow) : (dom && dow)

  return minute && hour && dayMatch && month
}

function fieldMatches(field: string, value: number, fieldMin: number): boolean {
  if (field === '*') return true

  return field.split(',').some((part) => {
    const [rangePart, stepStr] = part.split('/')
    const step = stepStr ? parseInt(stepStr, 10) : 1
    if (isNaN(step) || step < 1) return false

    if (rangePart === '*') {
      // */N with correct baseline for 1-based fields
      return (value - fieldMin) % step === 0
    }

    if (rangePart!.includes('-')) {
      const [startStr, endStr] = rangePart!.split('-')
      const start = parseInt(startStr!, 10)
      const end = parseInt(endStr!, 10)
      if (isNaN(start) || isNaN(end)) return false
      if (value < start || value > end) return false
      return (value - start) % step === 0
    }

    const exact = parseInt(rangePart!, 10)
    if (isNaN(exact)) return false
    return exact === value
  })
}

/** Validate that a string is a well-formed 5-field cron expression. */
export function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false
  // Each field must only contain digits, *, /, -, and commas
  return parts.every((p) => /^[0-9*\/,\-]+$/.test(p))
}

const EXCLUDED_HEADERS = new Set(['set-cookie', 'set-cookie2'])
const MAX_RESPONSE_BODY = 16_384

// ── Workflow params (minimal, no config or credentials) ───────────

export interface CheckRef {
  checkId: string
  orgId: string
}

export interface HealthCheckWorkflowParams {
  checks: CheckRef[]
}

interface CheckResult {
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

    const orgMap = new Map<string, CheckRef[]>()
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

async function processOrgChecks(orgId: string, checkRefs: CheckRef[]): Promise<void> {
  const db = getDb()

  // Resolve DB config
  const dbConfig = await db.query.database.findFirst({ where: { orgId } })
  if (!dbConfig) {
    logger.warn({ message: 'no database config for org', orgId })
    return
  }

  // Load full rules from D1 (config + state + destinations) - all in one query per check
  const rules = await Promise.all(
    checkRefs.map((ref) =>
      db.query.alertRule.findFirst({
        where: { id: ref.checkId, type: 'health_check', enabled: true },
        with: { destinations: true, org: true, project: true },
      }),
    ),
  )

  // Resolve project JWTs
  const projectCache = new Map<string, ProjectJwtInfo>()

  // Filter to due checks
  type LoadedRule = NonNullable<typeof rules[number]>
  const dueChecks: Array<{ rule: LoadedRule; project: ProjectJwtInfo }> = []

  for (const rule of rules) {
    if (!rule || !rule.checkUrl) continue

    // Resolve project for ClickHouse scoping
    let projectId = rule.projectId
    if (!projectId) {
      const firstProject = await db.query.project.findFirst({ where: { orgId } })
      if (!firstProject) continue
      projectId = firstProject.id
    }

    if (!projectCache.has(projectId)) {
      const project = await db.query.project.findFirst({ where: { id: projectId } })
      if (project) {
        projectCache.set(projectId, {
          id: project.id,
          tinybirdJwt: project.tinybirdJwt,
          tinybirdJwtDatasources: project.tinybirdJwtDatasources,
        })
      }
    }

    const project = projectCache.get(projectId)
    if (!project) continue

    // Check if due based on cron schedule (stateless, no lastCheckedAt)
    const schedule = rule.checkSchedule ?? '*/5 * * * *'
    if (!cronMatches(schedule, new Date())) {
      continue
    }

    dueChecks.push({ rule, project })
  }

  if (dueChecks.length === 0) return

  // Run all due checks in parallel
  const results = await Promise.allSettled(
    dueChecks.map(({ rule }) => runCheck(rule)),
  )

  const nowIso = new Date().toISOString()
  const now = Date.now()

  for (let i = 0; i < results.length; i++) {
    const settled = results[i]!
    const { rule, project } = dueChecks[i]!
    let result: CheckResult

    if (settled.status === 'fulfilled') {
      result = settled.value
    } else {
      logger.error({ message: 'check execution failed', checkId: rule.id, error: String(settled.reason) })
      result = {
        statusCode: 0, latencyMs: 0, success: false,
        errorMessage: String(settled.reason), responseBody: '', responseHeaders: {},
      }
    }

    // Write result to ClickHouse
    const projectId = rule.projectId ?? project.id
    try {
      await insertBackendRow({
        dbConfig, table: 'otel_health_checks',
        row: {
          ProjectId: projectId, CheckId: rule.id,
          Url: rule.checkUrl, Method: rule.checkMethod ?? 'GET',
          StatusCode: result.statusCode, LatencyMs: result.latencyMs,
          Success: result.success ? 1 : 0, ErrorMessage: result.errorMessage,
          ResponseBody: result.responseBody, ResponseHeaders: result.responseHeaders,
          Timestamp: nowIso,
        },
      })
    } catch (err) {
      logger.error({ message: 'failed to write check result', checkId: rule.id, error: String(err) })
    }

    // Handle alerts and update D1 state
    const destinations = (rule.destinations ?? []).map((d) => ({ channel: d.channel, destination: d.destination }))
    try {
      await handleCheckAlerts({ dbConfig, project, rule, destinations, currentResult: result, now })
    } catch (err) {
      logger.error({ message: 'alert handling failed', checkId: rule.id, error: String(err) })
    }
  }
}

async function runCheck(rule: { checkUrl: string | null; checkMethod: string | null; checkTimeoutMs: number | null; checkExpectedStatusMin: number | null; checkExpectedStatusMax: number | null }): Promise<CheckResult> {
  const url = rule.checkUrl!
  const method = rule.checkMethod ?? 'GET'
  const timeoutMs = rule.checkTimeoutMs ?? 10000
  const expectedMin = rule.checkExpectedStatusMin ?? 200
  const expectedMax = rule.checkExpectedStatusMax ?? 299

  const start = Date.now()
  let statusCode = 0
  let responseBody = ''
  let responseHeaders: Record<string, string> = {}
  let errorMessage = ''
  let success = false

  try {
    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: { 'User-Agent': 'Strada-Health-Check/1.0' },
    })

    statusCode = res.status
    success = statusCode >= expectedMin && statusCode <= expectedMax

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
      errorMessage = `Timeout after ${timeoutMs}ms`
    } else {
      errorMessage = String(error.message || error)
    }
  }

  return {
    statusCode, latencyMs: Date.now() - start, success,
    errorMessage, responseBody, responseHeaders,
  }
}

async function handleCheckAlerts(ctx: {
  dbConfig: DbConfig
  project: ProjectJwtInfo
  rule: typeof schema.alertRule.$inferSelect & { org: { name: string } | null }
  destinations: Array<{ channel: string; destination: string }>
  currentResult: CheckResult
  now: number
}): Promise<void> {
  const { dbConfig, project, rule, destinations, currentResult, now } = ctx
  const db = getDb()
  const orgName = rule.org?.name ?? 'Unknown'
  const checkName = rule.name
  const url = rule.checkUrl ?? ''
  const method = rule.checkMethod ?? 'GET'
  const failureThreshold = rule.checkFailureThreshold ?? 2
  const cooldownMinutes = rule.cooldownMinutes ?? 60
  const autoDisableAfterHours = rule.checkAutoDisableAfterHours ?? 24

  // Query last N results from ClickHouse
  const lastResults = await queryLastResults(dbConfig, project, rule.id, failureThreshold)
  const allFailed = lastResults.length >= failureThreshold && lastResults.every((r) => !r.success)
  const wasAlerting = rule.checkLastAlertStatus === 'alerting'

  // ── Recovery ──
  if (currentResult.success && wasAlerting) {
    logger.info({ message: 'health check recovered', checkId: rule.id })

    if (destinations.length > 0) {
      await dispatchToDestinations(destinations, (dest) =>
        sendHealthCheckNotification(dest, {
          checkName, url, method, statusCode: currentResult.statusCode,
          latencyMs: currentResult.latencyMs, errorMessage: '',
          consecutiveFailures: 0, orgName, recovered: true,
        }),
      )
    }

    await db.update(schema.alertRule)
      .set({ checkLastAlertStatus: 'ok', checkFirstFailedAt: null, updatedAt: now })
      .where(orm.eq(schema.alertRule.id, rule.id))
      .limit(1)
    return
  }

  // ── Auto-disable (checked BEFORE re-alert so cooldown can't starve it) ──
  if (!currentResult.success && allFailed && autoDisableAfterHours > 0 && rule.checkFirstFailedAt) {
    const hoursDown = (now - rule.checkFirstFailedAt) / (1000 * 60 * 60)
    if (hoursDown >= autoDisableAfterHours) {
      logger.info({ message: 'auto-disabling health check', checkId: rule.id, hoursDown })

      if (destinations.length > 0) {
        await dispatchToDestinations(destinations, (dest) =>
          sendHealthCheckNotification(dest, {
            checkName, url, method, statusCode: currentResult.statusCode,
            latencyMs: currentResult.latencyMs,
            errorMessage: `Auto-disabled after ${Math.round(hoursDown)} hours of continuous failure`,
            consecutiveFailures: lastResults.length, orgName, recovered: false,
          }),
        )
      }

      await db.update(schema.alertRule)
        .set({
          enabled: false, checkDisabledReason: 'auto', checkLastAlertStatus: 'alerting',
          updatedAt: now,
        })
        .where(orm.eq(schema.alertRule.id, rule.id))
        .limit(1)
      return
    }
  }

  // ── Alert / re-alert ──
  if (allFailed) {
    const cooldownMs = cooldownMinutes * 60_000
    const lastAlertedMs = rule.lastAlertedAt ?? 0
    const cooldownElapsed = !rule.lastAlertedAt || (now - lastAlertedMs >= cooldownMs)
    const shouldAlert = (!wasAlerting || cooldownElapsed) && destinations.length > 0

    if (shouldAlert) {
      logger.info({ message: wasAlerting ? 'health check re-alert' : 'health check alert', checkId: rule.id, consecutiveFailures: lastResults.length })

      const delivered = await dispatchToDestinations(destinations, (dest) =>
        sendHealthCheckNotification(dest, {
          checkName, url, method, statusCode: currentResult.statusCode,
          latencyMs: currentResult.latencyMs, errorMessage: currentResult.errorMessage,
          consecutiveFailures: lastResults.length, orgName, recovered: false,
        }),
      )

      await db.update(schema.alertRule)
        .set({
          checkLastAlertStatus: 'alerting',
          checkFirstFailedAt: rule.checkFirstFailedAt ?? now,
          ...(delivered ? { lastAlertedAt: now } : {}),
          updatedAt: now,
        })
        .where(orm.eq(schema.alertRule.id, rule.id))
        .limit(1)
      return
    }
  }

  // ── Regular state update ──
  const stateUpdate: Record<string, unknown> = { updatedAt: now }
  if (!currentResult.success && !rule.checkFirstFailedAt) {
    stateUpdate.checkFirstFailedAt = now
  }
  if (currentResult.success) {
    stateUpdate.checkFirstFailedAt = null
    if (!wasAlerting) stateUpdate.checkLastAlertStatus = 'ok'
  }

  await db.update(schema.alertRule)
    .set(stateUpdate)
    .where(orm.eq(schema.alertRule.id, rule.id))
    .limit(1)
}

// ── ClickHouse query (only for check results) ────────────────────

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
