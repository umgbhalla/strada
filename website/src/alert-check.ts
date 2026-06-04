// Scheduled alert check handler. Runs every 5 minutes via cron trigger.
// Only processes error_threshold rules. Health check rules will be handled
// by a separate handler in the future.
//
// Flow:
//   1. Load error_threshold rules with destinations (via junction table) from D1
//   2. For each rule's org, load database config + projects
//   3. For each project, query otel_errors for fingerprints exceeding threshold
//   4. Cross-reference otel_issue_state for cooldown (LastAlertedAt)
//   5. For new/cooled-down alerts, send notifications + update LastAlertedAt

import * as orm from 'drizzle-orm'
import * as schema from 'db/src/schema.ts'
import { getLogger, flush } from '@strada.sh/sdk'
import { getDb } from './db.ts'
import { sendErrorNotification, dispatchToDestinations } from './alert-notify.ts'
import {
  executeBackendQuery,
  insertBackendRow,
  type DbConfig,
  type ProjectJwtInfo,
} from './query-backend.ts'

const logger = getLogger('alert-check')

interface AlertableError {
  fingerprintHash: string
  errorCount: number
  exceptionType: string
  exceptionMessage: string
  exceptionStacktrace: string
  firstSeen: string
  serviceName: string
  usersImpacted: number
}

interface ProjectWithJwt extends ProjectJwtInfo {
  slug: string
}

/** Main scheduled handler. Called by the cron trigger every 5 minutes. */
export async function checkAlerts(): Promise<void> {
  const db = getDb()

  // 1. Load all enabled error_threshold rules with destinations
  const rules = await db.query.alertRule.findMany({
    where: { type: 'error_threshold', enabled: true },
    with: { destinations: true, org: true },
  })

  if (rules.length === 0) return

  // 2. Group rules by orgId for dedup: project-scoped rules override org-wide ones.
  // Build the dedicated project set from ALL enabled project-scoped rules first
  // (including those with no destinations), so an org-wide rule never duplicates
  // alerts for a project that has its own rule even if that rule has no destinations.
  const allOrgRulesMap = new Map<string, typeof rules>()
  for (const rule of rules) {
    const existing = allOrgRulesMap.get(rule.orgId) ?? []
    existing.push(rule)
    allOrgRulesMap.set(rule.orgId, existing)
  }

  // Then filter to actionable rules (have destinations)
  const orgRulesMap = new Map<string, typeof rules>()
  for (const rule of rules) {
    if (!rule.destinations || rule.destinations.length === 0) {
      logger.info({ message: 'rule has no destinations, skipping', ruleId: rule.id })
      continue
    }
    const existing = orgRulesMap.get(rule.orgId) ?? []
    existing.push(rule)
    orgRulesMap.set(rule.orgId, existing)
  }

  for (const [orgId, orgRules] of orgRulesMap) {
    // Build the set from ALL enabled project-scoped rules (not just ones with destinations)
    const allRulesForOrg = allOrgRulesMap.get(orgId) ?? []
    const dedicatedProjectIds = new Set(
      allRulesForOrg.filter((r) => r.projectId).map((r) => r.projectId!),
    )

    for (const rule of orgRules) {
      try {
        await checkOrgAlerts(rule, dedicatedProjectIds)
      } catch (err) {
        logger.error({ message: 'alert check failed for org', orgId, error: String(err) })
      }
    }
  }

  // Flush SDK logs before returning. The cron handler wraps this in
  // ctx.waitUntil, so the isolate stays alive until the flush completes.
  // Without this, logs emitted near the end of the cron may be lost.
  await flush()
}

async function checkOrgAlerts(
  rule: {
    id: string
    orgId: string
    projectId: string | null
    errorThreshold: number | null
    errorWindowMinutes: number | null
    cooldownMinutes: number
    destinations: Array<{ channel: string; destination: string }>
    org: { id: string; name: string } | null
  },
  dedicatedProjectIds: Set<string>,
): Promise<void> {
  const db = getDb()

  // Load database config for this org
  const dbConfig = await db.query.database.findFirst({
    where: { orgId: rule.orgId },
  })
  if (!dbConfig) {
    logger.warn({ message: 'no database config for org', orgId: rule.orgId })
    return
  }

  // Load projects scoped by the rule. For org-wide rules (projectId = null),
  // skip projects that have a dedicated project-scoped rule to avoid
  // duplicate alerts.
  let projects = rule.projectId
    ? await db.query.project.findMany({ where: { id: rule.projectId, orgId: rule.orgId } })
    : await db.query.project.findMany({ where: { orgId: rule.orgId } })

  if (!rule.projectId) {
    projects = projects.filter((p) => !dedicatedProjectIds.has(p.id))
  }

  if (projects.length === 0) {
    return
  }
  logger.info({ message: 'checking org', orgId: rule.orgId, projectCount: projects.length, ruleProjectId: rule.projectId, backend: dbConfig.backend })

  const orgName = rule.org?.name || 'Unknown'
  const threshold = rule.errorThreshold ?? 1
  const windowMinutes = rule.errorWindowMinutes ?? 5

  for (const project of projects) {
    try {
      await checkProjectAlerts({
        project,
        dbConfig,
        rule: { threshold, windowMinutes, cooldownMinutes: rule.cooldownMinutes, destinations: rule.destinations },
        orgName,
      })
    } catch (err) {
      logger.error({ message: `alert check failed for project`, projectSlug: project.slug, error: String(err) })
    }
  }
}

async function checkProjectAlerts(ctx: {
  project: ProjectWithJwt
  dbConfig: DbConfig
  rule: {
    threshold: number
    windowMinutes: number
    cooldownMinutes: number
    destinations: Array<{ channel: string; destination: string }>
  }
  orgName: string
}): Promise<void> {
  const { project, dbConfig, rule, orgName } = ctx

  // Query errors exceeding threshold in the window
  const errors = await queryErrorsAboveThreshold({
    project,
    dbConfig,
    threshold: rule.threshold,
    windowMinutes: rule.windowMinutes,
  })

  logger.info({ message: `error groups above threshold`, projectSlug: project.slug, errorGroupCount: errors.length, threshold: rule.threshold, windowMinutes: rule.windowMinutes })

  if (errors.length === 0) return

  // Check cooldown for each fingerprint via otel_issue_state
  const fingerprints = errors.map((e) => e.fingerprintHash)
  const issueStates = await queryIssueStates({ project, dbConfig, fingerprints })

  const cooldownMs = rule.cooldownMinutes * 60 * 1000
  const now = Date.now()

  for (const error of errors) {
    const state = issueStates.get(error.fingerprintHash)
    const lastAlertedAt = state?.lastAlertedAt
      ? new Date(state.lastAlertedAt).getTime()
      : 0

    // ── Resolved issue regression detection ──
    // When an issue is resolved, we store the deployment.id values that were
    // active at resolve time. If new errors come from the SAME deployment,
    // it's just old code still running; suppress the alert. If errors come
    // from a DIFFERENT deployment, it's a regression: reopen the issue and alert.
    // Requires deployment.id to be set in the SDK (via VERCEL_DEPLOYMENT_ID,
    // WORKERS_CI_BUILD_UUID, etc.). Without it, resolved issues alert normally.
    if (state?.status === 'resolved' && state.resolvedInDeploymentIds) {
      const resolvedIds = new Set(state.resolvedInDeploymentIds.split(',').filter(Boolean))
      const currentIds = await queryErrorDeploymentIds({
        project, dbConfig, fingerprintHash: error.fingerprintHash, windowMinutes: rule.windowMinutes,
      })

      if (currentIds.length > 0) {
        const allFromSameDeployment = currentIds.every((id) => resolvedIds.has(id))
        if (allFromSameDeployment) {
          logger.debug({ message: 'resolved issue, same deployment still erroring, suppressing', fingerprintHash: error.fingerprintHash, deploymentIds: currentIds })
          continue
        }
        // Different deployment.id → regression detected
        logger.info({ message: 'regression detected via deployment.id', fingerprintHash: error.fingerprintHash, resolvedIds: [...resolvedIds], currentIds })

        // Reopen the issue
        await writeIssueStateRow({
          project, dbConfig,
          row: {
            ProjectId: project.id,
            FingerprintHash: error.fingerprintHash,
            Status: 'open',
            AssigneeMemberId: state.assigneeMemberId || '',
            ResolvedAt: null,
            ResolvedByMemberId: '',
            LastAlertedAt: new Date(now).toISOString(),
            ResolvedInDeploymentIds: '',
            Version: now,
            UpdatedAt: new Date(now).toISOString(),
          },
        })
      }
      // No deployment.id on current errors → can't determine, fall through to alert
    }

    // Skip if within cooldown
    if (lastAlertedAt > 0 && now - lastAlertedAt < cooldownMs) {
      logger.debug({ message: `skipping, within cooldown`, fingerprintHash: error.fingerprintHash, lastAlertedAt: new Date(lastAlertedAt).toISOString(), cooldownMinutes: rule.cooldownMinutes })
      continue
    }

    logger.info({ message: `sending alert for error group`, fingerprintHash: error.fingerprintHash, errorCount: error.errorCount, exceptionType: error.exceptionType, destinationCount: rule.destinations.length })
    const alertData = {
      projectSlug: project.slug,
      orgName,
      fingerprintHash: error.fingerprintHash,
      exceptionType: error.exceptionType,
      exceptionMessage: error.exceptionMessage,
      exceptionStacktrace: error.exceptionStacktrace,
      errorCount: error.errorCount,
      windowMinutes: rule.windowMinutes,
      firstSeen: error.firstSeen,
      serviceName: error.serviceName,
      usersImpacted: error.usersImpacted,
    }

    const anyDelivered = await dispatchToDestinations(
      rule.destinations,
      (dest) => sendErrorNotification(dest, alertData),
    )

    // Only update LastAlertedAt if at least one destination delivered.
    // Without this, unsupported channels (e.g. slack before it's implemented)
    // would silently mark the alert as sent and suppress future retries.
    if (!anyDelivered) {
      logger.error({ message: 'no destinations delivered, skipping cooldown update', fingerprintHash: error.fingerprintHash })
      continue
    }

    // Update LastAlertedAt in otel_issue_state
    await writeLastAlertedAt({
      project,
      dbConfig,
      fingerprintHash: error.fingerprintHash,
      currentState: state,
    })
  }
}

async function queryErrorsAboveThreshold(ctx: {
  project: ProjectWithJwt
  dbConfig: DbConfig
  threshold: number
  windowMinutes: number
}): Promise<AlertableError[]> {
  const { project, dbConfig, threshold, windowMinutes } = ctx

  const sql = [
    'SELECT',
    '    FingerprintHash,',
    '    count() AS error_count,',
    '    anyLast(ExceptionType) AS exception_type,',
    '    anyLast(ExceptionMessage) AS exception_message,',
    '    anyLast(ExceptionStacktrace) AS exception_stacktrace,',
    '    min(Timestamp) AS first_seen,',
    '    anyLast(ServiceName) AS service_name,',
    "    uniqExact(Tags['user.id']) AS users_impacted",
    'FROM otel_errors',
    `WHERE Timestamp >= now() - INTERVAL ${windowMinutes} MINUTE`,
    'GROUP BY FingerprintHash',
    `HAVING error_count >= ${threshold}`,
    'ORDER BY error_count DESC',
    'LIMIT 100',
    'FORMAT JSON',
  ].join('\n')

  const result = await executeBackendQuery({ dbConfig, project, sql })
  const rows = result.data ?? []

  return rows.map((row) => ({
    fingerprintHash: String(row.FingerprintHash ?? ''),
    errorCount: Number(row.error_count ?? 0),
    exceptionType: String(row.exception_type ?? ''),
    exceptionMessage: String(row.exception_message ?? ''),
    exceptionStacktrace: String(row.exception_stacktrace ?? ''),
    firstSeen: String(row.first_seen ?? ''),
    serviceName: String(row.service_name ?? ''),
    usersImpacted: Number(row.users_impacted ?? 0),
  }))
}

interface IssueStateInfo {
  status: string
  lastAlertedAt: string | null
  assigneeMemberId: string
  resolvedAt: string | null
  resolvedByMemberId: string
  /** Comma-separated deployment.id values that were active when the issue was resolved. Empty string if unavailable. */
  resolvedInDeploymentIds: string
}

async function queryIssueStates(ctx: {
  project: ProjectWithJwt
  dbConfig: DbConfig
  fingerprints: string[]
}): Promise<Map<string, IssueStateInfo>> {
  const { project, dbConfig, fingerprints } = ctx
  if (fingerprints.length === 0) return new Map()

  const inList = fingerprints.map((f) => `'${f}'`).join(', ')

  // Use argMax() deduplication instead of FINAL. Tinybird wraps JWT queries
  // in a subquery and FINAL is not supported on subqueries.
  const sql = [
    'SELECT',
    '    FingerprintHash,',
    '    argMax(Status, Version) AS Status,',
    '    argMax(LastAlertedAt, Version) AS LastAlertedAt,',
    '    argMax(AssigneeMemberId, Version) AS AssigneeMemberId,',
    '    argMax(ResolvedAt, Version) AS ResolvedAt,',
    '    argMax(ResolvedByMemberId, Version) AS ResolvedByMemberId,',
    '    argMax(ResolvedInDeploymentIds, Version) AS ResolvedInDeploymentIds',
    'FROM otel_issue_state',
    `WHERE FingerprintHash IN (${inList})`,
    'GROUP BY FingerprintHash',
    `LIMIT ${fingerprints.length}`,
    'FORMAT JSON',
  ].join('\n')

  try {
    const result = await executeBackendQuery({ dbConfig, project, sql })
    const map = new Map<string, IssueStateInfo>()
    for (const row of result.data ?? []) {
      map.set(String(row.FingerprintHash), {
        status: String(row.Status ?? 'open'),
        lastAlertedAt: row.LastAlertedAt ? String(row.LastAlertedAt) : null,
        assigneeMemberId: String(row.AssigneeMemberId ?? ''),
        resolvedAt: row.ResolvedAt ? String(row.ResolvedAt) : null,
        resolvedByMemberId: String(row.ResolvedByMemberId ?? ''),
        resolvedInDeploymentIds: String(row.ResolvedInDeploymentIds ?? ''),
      })
    }
    return map
  } catch (err) {
    logger.error({ message: `queryIssueStates failed, proceeding without cooldown data`, error: String(err) })
    return new Map()
  }
}

async function writeLastAlertedAt(ctx: {
  project: ProjectWithJwt
  dbConfig: DbConfig
  fingerprintHash: string
  currentState: IssueStateInfo | undefined
}): Promise<void> {
  const { project, dbConfig, fingerprintHash, currentState } = ctx
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  await insertBackendRow({
    dbConfig,
    table: 'otel_issue_state',
    row: {
      ProjectId: project.id,
      FingerprintHash: fingerprintHash,
      Status: currentState?.status || 'open',
      AssigneeMemberId: currentState?.assigneeMemberId || '',
      ResolvedAt: currentState?.resolvedAt || null,
      ResolvedByMemberId: currentState?.resolvedByMemberId || '',
      LastAlertedAt: nowIso,
      ResolvedInDeploymentIds: currentState?.resolvedInDeploymentIds || '',
      Version: now,
      UpdatedAt: nowIso,
    },
  })
}

// ── Deployment regression helpers ──────────────────────────────────
//
// These helpers query otel_errors to determine if recent errors are from
// the same deployment as when an issue was resolved, or a new one (regression).

/**
 * Query distinct deployment.id values from recent errors for a fingerprint.
 * Returns an array of non-empty deployment ID strings.
 */
async function queryErrorDeploymentIds(ctx: {
  project: ProjectWithJwt
  dbConfig: DbConfig
  fingerprintHash: string
  windowMinutes: number
}): Promise<string[]> {
  const { project, dbConfig, fingerprintHash, windowMinutes } = ctx
  const sql = [
    "SELECT DISTINCT ResourceAttributes['deployment.id'] AS deployment_id",
    'FROM otel_errors',
    `WHERE FingerprintHash = '${fingerprintHash}'`,
    `AND Timestamp >= now() - INTERVAL ${windowMinutes} MINUTE`,
    "AND ResourceAttributes['deployment.id'] != ''",
    'LIMIT 50',
    'FORMAT JSON',
  ].join('\n')

  try {
    const result = await executeBackendQuery({ dbConfig, project, sql })
    return (result.data ?? [])
      .map((row) => String(row.deployment_id ?? ''))
      .filter(Boolean)
  } catch (err) {
    logger.error({ message: 'queryErrorDeploymentIds failed', error: String(err) })
    return []
  }
}

/**
 * Write a full issue state row to ClickHouse/Tinybird. Used by the regression
 * detection logic to reopen issues when a new deployment triggers the same error.
 */
async function writeIssueStateRow(ctx: {
  project: ProjectWithJwt
  dbConfig: DbConfig
  row: {
    ProjectId: string
    FingerprintHash: string
    Status: string
    AssigneeMemberId: string
    ResolvedAt: string | null
    ResolvedByMemberId: string
    LastAlertedAt: string | null
    ResolvedInDeploymentIds: string
    Version: number
    UpdatedAt: string
  }
}): Promise<void> {
  await insertBackendRow({ dbConfig: ctx.dbConfig, table: 'otel_issue_state', row: ctx.row })
}

// ── Query helpers ──────────────────────────────────────────────────
// All query execution now goes through executeBackendQuery() from query-backend.ts.
// The queryErrorsAboveThreshold() function above calls it directly.
