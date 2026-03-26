import type { LogRef, PaginationCursor } from "./types.ts"

/**
 * SQL expression that computes the stable ref ID at query time.
 * Append ` AS RefId` in SELECT projections.
 */
export const REF_ID_EXPR =
  "xxHash64(concat(TraceId, SpanId, Body, toString(SeverityNumber), toString(Timestamp)))"

/**
 * Full SELECT column list for log queries, including the computed RefId
 * and nanosecond timestamp for cursor construction.
 */
export const LOG_SELECT_COLUMNS = `
    Timestamp,
    toUnixTimestamp64Nano(Timestamp) AS TimestampNano,
    ${REF_ID_EXPR} AS RefId,
    TraceId,
    SpanId,
    SeverityNumber,
    SeverityText,
    Body,
    ServiceName,
    ResourceAttributes,
    LogAttributes`.trim()

// ---------------------------------------------------------------------------
// Base64url encode / decode (no padding, isomorphic)
// ---------------------------------------------------------------------------

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

function base64urlEncode(bytes: Uint8Array): string {
  let result = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0

    result += B64[(b0 >> 2)!]!
    result += B64[(((b0 & 3) << 4) | (b1 >> 4))!]!
    if (i + 1 < bytes.length) result += B64[(((b1 & 15) << 2) | (b2 >> 6))!]!
    if (i + 2 < bytes.length) result += B64[(b2 & 63)!]!
  }
  return result
}

const B64_LOOKUP = new Uint8Array(128)
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)!]! = i

function base64urlDecode(str: string): Uint8Array {
  const len = str.length
  const byteLen = (len * 3) >> 2
  const bytes = new Uint8Array(byteLen)
  let j = 0
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[str.charCodeAt(i)!]!
    const b = i + 1 < len ? B64_LOOKUP[str.charCodeAt(i + 1)!]! : 0
    const c = i + 2 < len ? B64_LOOKUP[str.charCodeAt(i + 2)!]! : 0
    const d = i + 3 < len ? B64_LOOKUP[str.charCodeAt(i + 3)!]! : 0

    bytes[j++] = (a << 2) | (b >> 4)
    if (i + 2 < len) bytes[j++] = ((b & 15) << 4) | (c >> 2)
    if (i + 3 < len) bytes[j++] = ((c & 3) << 6) | d
  }
  return bytes
}

// ---------------------------------------------------------------------------
// Encode / decode LogRef as opaque 22-char base64url token
// ---------------------------------------------------------------------------

/**
 * Encode a (ts, refId) pair into an opaque 22-character base64url token.
 * Leading timestamp bytes mean lexicographic sort ≈ chronological order.
 */
export function encodeLogRef(ts: string, refId: string): string {
  const buf = new ArrayBuffer(16)
  const view = new DataView(buf)
  view.setBigUint64(0, BigInt(ts))
  view.setBigUint64(8, BigInt(refId))
  return base64urlEncode(new Uint8Array(buf))
}

/** Decode an opaque base64url token back to a LogRef. */
export function decodeLogRef(encoded: string): LogRef {
  const bytes = base64urlDecode(encoded)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    ts: view.getBigUint64(0).toString(),
    refId: view.getBigUint64(8).toString(),
  }
}

// ---------------------------------------------------------------------------
// Cursor serialisation
// ---------------------------------------------------------------------------

/** Encode a PaginationCursor as an opaque string token. */
export function serializeCursor(cursor: PaginationCursor): string {
  const dirByte = cursor.dir === "forward" ? 0 : 1
  const buf = new ArrayBuffer(17)
  const view = new DataView(buf)
  view.setBigUint64(0, BigInt(cursor.ts))
  view.setBigUint64(8, BigInt(cursor.refId))
  view.setUint8(16, dirByte)
  return base64urlEncode(new Uint8Array(buf))
}

/** Decode an opaque cursor token. */
export function deserializeCursor(encoded: string): PaginationCursor {
  const bytes = base64urlDecode(encoded)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    ts: view.getBigUint64(0).toString(),
    refId: view.getBigUint64(8).toString(),
    dir: view.getUint8(16) === 0 ? "forward" : "backward",
  }
}
