// Email template generation for error alerts.
// Uses React JSX rendered to static HTML with inline styles for reliable
// rendering across Gmail, Outlook, Apple Mail.
// Untrusted fields are auto-escaped by React's JSX.

import { renderToStaticMarkup } from 'spiceflow/federation'

export interface ErrorAlertData {
  projectSlug: string
  orgName: string
  fingerprintHash: string
  exceptionType: string
  exceptionMessage: string
  exceptionStacktrace: string
  errorCount: number
  windowMinutes: number
  firstSeen: string
  serviceName?: string
  usersImpacted?: number
}

const mono = "Consolas, 'Courier New', Monaco, Menlo, monospace"
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '\u2026'
}

function trimStacktrace(s: string, maxLines = 20): string {
  if (!s) return ''
  const lines = s.split('\n')
  if (lines.length <= maxLines) return s
  return lines.slice(0, maxLines).join('\n') + `\n... ${lines.length - maxLines} more lines`
}

function formatFirstSeen(raw: string): string {
  const match = raw.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  if (match) return `${match[1]} ${match[2]}`
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (isoMatch) return `${isoMatch[1]} ${isoMatch[2]}`
  return raw
}

// ── Shared components ──────────────────────────────────────────

function Hr() {
  return <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', margin: '24px 0' }} />
}

function Code({ children }: { children: string }) {
  return (
    <code style={{
      fontFamily: mono,
      fontSize: 13,
      padding: '2px 6px',
      borderRadius: 4,
      backgroundColor: '#f0f0f0',
    }}>
      {children}
    </code>
  )
}

function Pre({ children }: { children: string }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, backgroundColor: '#f5f5f5' }}>
      <pre style={{
        fontFamily: mono,
        fontSize: 13,
        lineHeight: 1.5,
        padding: 16,
        margin: 0,
        whiteSpace: 'pre',
        color: '#1a1a1a',
      }}>
        {children}
      </pre>
    </div>
  )
}

function Footer({ orgName }: { orgName: string }) {
  return <p style={{ fontSize: 12, opacity: 0.5, marginTop: 32 }}>Strada · {orgName}</p>
}

function EmailShell({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </head>
      <body style={{
        fontFamily: sans,
        lineHeight: 1.5,
        maxWidth: 600,
        margin: '0 auto',
        padding: '32px 24px',
        WebkitTextSizeAdjust: '100%',
      }}>
        {children}
      </body>
    </html>
  )
}

// ── Alert email ────────────────────────────────────────────────

function AlertEmail({ data }: { data: ErrorAlertData }) {
  const type = data.exceptionType || 'Error'
  const message = data.exceptionMessage || '(no message)'
  const stacktrace = trimStacktrace(data.exceptionStacktrace)
  const firstSeen = formatFirstSeen(data.firstSeen)

  return (
    <EmailShell>
      <h2 style={{ fontWeight: 600, margin: '0 0 8px 0' }}>{type}</h2>
      <p style={{ margin: '12px 0' }}>{message}</p>

      <Hr />

      <p style={{ margin: '12px 0' }}>
        <strong>{data.errorCount}</strong> errors in the last <strong>{data.windowMinutes} minutes</strong>
      </p>

      <ul style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8 }}>
        <li><strong>Org:</strong> {data.orgName}</li>
        <li><strong>Project:</strong> {data.projectSlug}</li>
        {data.serviceName && <li><strong>Service:</strong> {data.serviceName}</li>}
        {(data.usersImpacted ?? 0) > 0 && <li><strong>Users impacted:</strong> {data.usersImpacted}</li>}
        <li><strong>Fingerprint:</strong> <Code>{data.fingerprintHash}</Code></li>
        <li><strong>First seen:</strong> {firstSeen}</li>
      </ul>

      {stacktrace && (
        <>
          <Hr />
          <p style={{ margin: '12px 0' }}><strong>Stacktrace</strong></p>
          <Pre>{stacktrace}</Pre>
        </>
      )}

      <Hr />

      <p style={{ margin: '12px 0' }}>View this issue:</p>
      <p style={{ margin: '8px 0' }}>
        <code style={{
          fontFamily: mono,
          fontSize: 13,
          padding: '4px 8px',
          borderRadius: 4,
          backgroundColor: '#f0f0f0',
        }}>
          {`strada issues view ${data.fingerprintHash} -p ${data.projectSlug}`}
        </code>
      </p>

      <Footer orgName={data.orgName} />
    </EmailShell>
  )
}

function TestAlertEmail({ orgName }: { orgName: string }) {
  return (
    <EmailShell>
      <h2 style={{ fontWeight: 600, margin: '0 0 8px 0' }}>Test alert</h2>
      <p style={{ margin: '12px 0' }}>This is a test alert from Strada to verify your notification setup works.</p>
      <p style={{ margin: '12px 0' }}>If you received this, your alert configuration is working correctly.</p>
      <Hr />
      <Footer orgName={orgName} />
    </EmailShell>
  )
}

// ── Public API ─────────────────────────────────────────────────

export function buildAlertSubject(data: ErrorAlertData): string {
  const type = data.exceptionType || 'Error'
  const msg = truncate(data.exceptionMessage || '(no message)', 60)
  return `[${data.orgName}/${data.projectSlug}] ${type}: ${msg}`
}

export async function buildAlertEmailHtml(data: ErrorAlertData): Promise<string> {
  return '<!DOCTYPE html>' + await renderToStaticMarkup(<AlertEmail data={data} />)
}

export async function buildTestAlertEmailHtml(orgName: string): Promise<string> {
  return '<!DOCTYPE html>' + await renderToStaticMarkup(<TestAlertEmail orgName={orgName} />)
}
