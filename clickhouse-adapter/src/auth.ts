// Auth: extract ClickHouse credentials from Bearer token.
//
// The otel-collector sends `Authorization: Bearer <token>` where the token
// is base64("user:password"). The adapter decodes this and uses the
// credentials to authenticate with ClickHouse.
//
// This makes the adapter fully stateless — no stored ClickHouse credentials.
// The collector's TINYBIRD_TOKEN env var becomes base64(clickhouse_user:clickhouse_password).

export interface ClickHouseCredentials {
  user: string
  password: string
}

/**
 * Extract ClickHouse user:password from a Bearer token.
 * Token format: base64("user:password")
 * Returns null if the token is missing or malformed.
 */
export function parseCredentials(
  authHeader: string | null,
): ClickHouseCredentials | null {
  if (!authHeader) return null

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader

  if (!token) return null

  try {
    const decoded = atob(token)
    const colonIndex = decoded.indexOf(':')
    if (colonIndex === -1) return null

    return {
      user: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    }
  } catch {
    // Invalid base64
    return null
  }
}
