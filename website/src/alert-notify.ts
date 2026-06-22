// Shared notification dispatch for both error alerts and health check alerts.
// Extracted from alert-check.ts so both the error alert cron and the health
// check workflow can send notifications through the same destinations.

import { env } from 'cloudflare:workers'
import { getLogger } from '@strada.sh/sdk'
import {
  buildAlertSubject,
  buildAlertEmailHtml,
  buildHealthCheckAlertSubject,
  buildHealthCheckAlertEmailHtml,
  type ErrorAlertData,
  type HealthCheckAlertData,
} from './alert-email.tsx'

const logger = getLogger('alert-notify')

export type { ErrorAlertData, HealthCheckAlertData }

interface Destination {
  channel: string
  destination: string
}

/** Returns true if the notification was delivered, false on failure or unsupported channel. */
export async function sendErrorNotification(
  dest: Destination,
  data: ErrorAlertData,
): Promise<boolean> {
  if (dest.channel === 'email') {
    const subject = buildAlertSubject(data)
    const html = await buildAlertEmailHtml(data)
    return sendEmail(dest.destination, subject, html)
  }

  if (dest.channel === 'webhook') {
    return sendWebhook(dest.destination, {
      type: 'error_alert',
      project: data.projectSlug,
      org: data.orgName,
      fingerprintHash: data.fingerprintHash,
      exceptionType: data.exceptionType,
      exceptionMessage: data.exceptionMessage,
      errorCount: data.errorCount,
      windowMinutes: data.windowMinutes,
      firstSeen: data.firstSeen,
      serviceName: data.serviceName,
    })
  }

  logger.warn({ message: 'unsupported alert channel, skipping', channel: dest.channel, destination: dest.destination })
  return false
}

/** Returns true if the notification was delivered, false on failure or unsupported channel. */
export async function sendHealthCheckNotification(
  dest: Destination,
  data: HealthCheckAlertData,
): Promise<boolean> {
  if (dest.channel === 'email') {
    const subject = buildHealthCheckAlertSubject(data)
    const html = await buildHealthCheckAlertEmailHtml(data)
    return sendEmail(dest.destination, subject, html)
  }

  if (dest.channel === 'webhook') {
    return sendWebhook(dest.destination, {
      type: data.recovered ? 'health_check_recovery' : 'health_check_alert',
      check: {
        name: data.checkName,
        url: data.url,
        method: data.method,
      },
      result: {
        statusCode: data.statusCode,
        latencyMs: data.latencyMs,
        errorMessage: data.errorMessage,
        consecutiveFailures: data.consecutiveFailures,
      },
      org: data.orgName,
    })
  }

  logger.warn({ message: 'unsupported alert channel, skipping', channel: dest.channel, destination: dest.destination })
  return false
}

/** Dispatch notifications to all destinations, return true if at least one delivered. */
export async function dispatchToDestinations(
  destinations: Destination[],
  sendFn: (dest: Destination) => Promise<boolean>,
): Promise<boolean> {
  const results = await Promise.allSettled(
    destinations.map((dest) => sendFn(dest)),
  )
  let anyDelivered = false
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ message: 'notification dispatch rejected', error: String(result.reason) })
    } else if (result.value) {
      anyDelivered = true
    }
  }
  return anyDelivered
}

// ── Internal helpers ─────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (!env.EMAIL) {
      logger.info({ message: 'email binding not configured, skipping alert email', to })
      return false
    }
    logger.info({ message: 'sending alert email', to, subject })
    await env.EMAIL.send({
      from: { email: 'alerts@updates.strada.sh', name: 'Strada' },
      to,
      subject,
      html,
    })
    logger.info({ message: 'alert email sent', to })
    return true
  } catch (err) {
    logger.error({ message: 'failed to send alert email', to, error: String(err) })
    return false
  }
}

async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    logger.info({ message: 'sending webhook', destination: url })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error({ message: 'webhook returned non-2xx', destination: url, status: res.status, body: body.slice(0, 500) })
      return false
    }
    return true
  } catch (err) {
    logger.error({ message: 'failed to send webhook', destination: url, error: String(err) })
    return false
  }
}
