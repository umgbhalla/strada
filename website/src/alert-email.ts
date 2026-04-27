// Email template generation for error alerts.
// Uses markdown rendered to HTML via marked, wrapped in a minimal HTML shell.
// No background or text color set so emails inherit the user's system
// light/dark mode preference. Sans-serif font, Vercel-like minimal design.

import { marked } from 'marked'
import dedent from 'string-dedent'

interface ErrorAlertData {
  projectSlug: string
  orgName: string
  fingerprintHash: string
  exceptionType: string
  exceptionMessage: string
  errorCount: number
  windowMinutes: number
  firstSeen: string
  serviceName?: string
}

/** Render markdown string to a complete HTML email document. */
function wrapHtml(bodyHtml: string): string {
  return dedent`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.5;
          max-width: 600px;
          margin: 0 auto;
          padding: 32px 24px;
          -webkit-text-size-adjust: 100%;
        }
        code {
          font-family: 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.875em;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(127, 127, 127, 0.12);
        }
        pre {
          padding: 16px;
          border-radius: 8px;
          overflow-x: auto;
          background: rgba(127, 127, 127, 0.08);
        }
        pre code {
          padding: 0;
          background: none;
        }
        hr {
          border: none;
          border-top: 1px solid rgba(127, 127, 127, 0.2);
          margin: 24px 0;
        }
        a {
          color: inherit;
        }
        h1, h2, h3 {
          font-weight: 600;
        }
        p {
          margin: 12px 0;
        }
        .footer {
          font-size: 0.75em;
          opacity: 0.5;
          margin-top: 32px;
        }
      </style>
    </head>
    <body>
      ${bodyHtml}
    </body>
    </html>
  `
}

/** Build the subject line for an error alert email. */
export function buildAlertSubject(data: ErrorAlertData): string {
  const type = data.exceptionType || 'Error'
  return `[${data.projectSlug}] ${type}: ${truncate(data.exceptionMessage, 80)}`
}

/** Build the full HTML email body for an error alert. */
export function buildAlertEmailHtml(data: ErrorAlertData): string {
  const type = data.exceptionType || 'Error'
  const message = data.exceptionMessage || '(no message)'
  const service = data.serviceName ? ` in \`${data.serviceName}\`` : ''

  const md = dedent`
    ## ${type}

    ${message}

    ---

    **${data.errorCount}** errors in the last **${data.windowMinutes} minutes**${service}

    **Project:** ${data.projectSlug}

    **Fingerprint:** \`${data.fingerprintHash}\`

    **First seen:** ${data.firstSeen}

    ---

    View this issue:

    \`\`\`
    strada issues view ${data.fingerprintHash} -p ${data.projectSlug}
    \`\`\`

    <p class="footer">Strada &middot; ${data.orgName}</p>
  `

  const html = marked.parse(md, { async: false }) as string
  return wrapHtml(html)
}

/** Build a test alert email. */
export function buildTestAlertEmailHtml(orgName: string): string {
  const md = dedent`
    ## Test alert

    This is a test alert from Strada to verify your notification setup works.

    If you received this, your alert configuration is working correctly.

    ---

    <p class="footer">Strada &middot; ${orgName}</p>
  `

  const html = marked.parse(md, { async: false }) as string
  return wrapHtml(html)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '\u2026'
}
