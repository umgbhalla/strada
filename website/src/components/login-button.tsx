// Client component for the login page.
// Self-hosted single-user instance: email + password sign-in only.
// Signup is disabled server-side (better-auth disableSignUp + ALLOWED_EMAIL lock),
// so there is no register form — the single owner account is seeded out-of-band.

"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { Button } from "./ui/button.tsx"
import { Input } from "./ui/input.tsx"
import { authClient } from "../auth-client.ts"

export function LoginButton({ callbackURL = "/wip" }: { callbackURL?: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await authClient.signIn.email({ email, password, callbackURL })
    if (error) {
      setError(error.message || "Sign in failed")
      setLoading(false)
      return
    }
    window.location.href = callbackURL
  }

  return (
    <form onSubmit={handleSignIn} className="flex flex-col gap-3 w-full">
      <Input
        type="email"
        placeholder="Email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      <Button type="submit" loading={loading} size="lg" className="w-full">
        Sign in
      </Button>
    </form>
  )
}
