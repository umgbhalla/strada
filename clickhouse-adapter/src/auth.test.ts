import { describe, it, expect } from 'vitest'
import { parseCredentials } from './auth.ts'

describe('parseCredentials', () => {
  it('parses base64(user:password) from Bearer token', () => {
    // base64("default:mypassword") = "ZGVmYXVsdDpteXBhc3N3b3Jk"
    const creds = parseCredentials('Bearer ZGVmYXVsdDpteXBhc3N3b3Jk')
    expect(creds).toEqual({ user: 'default', password: 'mypassword' })
  })

  it('handles empty password', () => {
    // base64("default:") = "ZGVmYXVsdDo="
    const creds = parseCredentials('Bearer ZGVmYXVsdDo=')
    expect(creds).toEqual({ user: 'default', password: '' })
  })

  it('handles password with colons', () => {
    // base64("admin:pass:with:colons") = "YWRtaW46cGFzczp3aXRoOmNvbG9ucw=="
    const creds = parseCredentials('Bearer YWRtaW46cGFzczp3aXRoOmNvbG9ucw==')
    expect(creds).toEqual({ user: 'admin', password: 'pass:with:colons' })
  })

  it('works without Bearer prefix', () => {
    const creds = parseCredentials('ZGVmYXVsdDpteXBhc3N3b3Jk')
    expect(creds).toEqual({ user: 'default', password: 'mypassword' })
  })

  it('returns null for missing header', () => {
    expect(parseCredentials(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseCredentials('')).toBeNull()
  })

  it('returns null for Bearer with empty token', () => {
    expect(parseCredentials('Bearer ')).toBeNull()
  })

  it('returns null for invalid base64', () => {
    expect(parseCredentials('Bearer !!!invalid!!!')).toBeNull()
  })

  it('returns null when decoded string has no colon', () => {
    // base64("nocolon") = "bm9jb2xvbg=="
    expect(parseCredentials('Bearer bm9jb2xvbg==')).toBeNull()
  })
})
