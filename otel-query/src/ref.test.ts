import { describe, expect, it } from "vitest"
import {
  decodeLogRef,
  deserializeCursor,
  encodeLogRef,
  serializeCursor,
} from "./ref.ts"

describe("encodeLogRef / decodeLogRef", () => {
  it("round-trips a log ref", () => {
    const ts = "1705312200123456789"
    const refId = "12345678901234567890"
    const encoded = encodeLogRef(ts, refId)
    expect(typeof encoded).toBe("string")
    expect(encoded.length).toBe(22) // 16 bytes → 22 base64url chars

    const decoded = decodeLogRef(encoded)
    expect(decoded.ts).toBe(ts)
    expect(decoded.refId).toBe(refId)
  })

  it("round-trips edge case values", () => {
    const cases = [
      { ts: "0", refId: "0" },
      { ts: "1", refId: "1" },
      { ts: "18446744073709551615", refId: "18446744073709551615" }, // max uint64
    ]
    for (const { ts, refId } of cases) {
      const decoded = decodeLogRef(encodeLogRef(ts, refId))
      expect(decoded.ts).toBe(ts)
      expect(decoded.refId).toBe(refId)
    }
  })

  it("produces lexicographically ordered tokens for increasing timestamps", () => {
    const a = encodeLogRef("1000000000000000000", "0")
    const b = encodeLogRef("2000000000000000000", "0")
    expect(a < b).toBe(true)
  })
})

describe("serializeCursor / deserializeCursor", () => {
  it("round-trips a forward cursor", () => {
    const cursor = {
      ts: "1705312200123456789",
      refId: "9876543210",
      dir: "forward" as const,
    }
    const encoded = serializeCursor(cursor)
    const decoded = deserializeCursor(encoded)
    expect(decoded.ts).toBe(cursor.ts)
    expect(decoded.refId).toBe(cursor.refId)
    expect(decoded.dir).toBe("forward")
  })

  it("round-trips a backward cursor", () => {
    const cursor = {
      ts: "1705312200123456789",
      refId: "9876543210",
      dir: "backward" as const,
    }
    const decoded = deserializeCursor(serializeCursor(cursor))
    expect(decoded.dir).toBe("backward")
  })
})
