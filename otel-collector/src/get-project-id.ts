// Extract project_id from the request hostname.
// Project-scoped: {project}-ingest.{domain} → "acme"
// Default:        ingest.{domain}, localhost, IP → "" (empty string)

export function getProjectId(request: { url: string }): string {
  const hostname = new URL(request.url).hostname;
  const match = hostname.match(/^(.+)-ingest\./);
  if (match) return match[1] ?? "";
  return "";
}
