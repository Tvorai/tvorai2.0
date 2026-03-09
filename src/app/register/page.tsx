"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const origin = typeof window !== "undefined" ? window.location.origin : undefined
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: origin ? `${origin}` : undefined
      }
    })
    setLoading(false)
    if (error) {
      const msg = (error.message || "").toLowerCase()
      if (msg.includes("rate limit")) {
        setError("Limit pro e‑maily vyčerpán. Zkuste to za 1–2 minuty.")
      } else if (msg.includes("already registered")) {
        setError("Uživatel již existuje. Přihlaste se nebo potvrďte e‑mail.")
      } else {
        setError(error.message || "Registrace selhala")
      }
    } else {
      if (data?.user && !data.user.confirmed_at) {
        setInfo("Registrace proběhla. Zkontrolujte e‑mail a potvrďte adresu.")
      } else {
        router.push("/")
      }
    }
  }

  async function resendConfirmation() {
    setError("")
    setInfo("")
    if (cooldown > 0) return
    if (!email) {
      setError("Zadejte e‑mail a zkuste znovu")
      return
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email
    })
    if (error) {
      setError(error.message || "Odeslání potvrzení selhalo")
    } else {
      setInfo("Poslali jsme nový potvrzovací e‑mail")
      setCooldown(60)
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer)
            return 0
          }
          return c - 1
        })
      }, 1000)
    }
  }

  const primary = "#00C8D7"
  const bg = "#0A0A0A"
  const inputBg = "#E5E7EB"
  const inputText = "#111827"
  const white = "#FFFFFF"

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: bg,
        color: white,
        display: "grid",
        placeItems: "center",
        padding: 24
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "center" }}>
          <img
            src="/logo.png"
            alt="Logo"
            style={{ width: 140, height: 140, objectFit: "contain" }}
          />
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Registrace</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              background: inputBg,
              color: inputText,
              padding: "14px 16px",
              borderRadius: 12,
              border: "none",
              outline: "none",
              fontSize: 16
            }}
          />
          <input
            type="password"
            placeholder="Heslo"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              background: inputBg,
              color: inputText,
              padding: "14px 16px",
              borderRadius: 12,
              border: "none",
              outline: "none",
              fontSize: 16
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: primary,
              color: white,
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            {loading ? "Probíhá…" : "Registrovat"}
          </button>
        </form>
        {error ? <p style={{ color: "#F87171", marginTop: 10 }}>{error}</p> : null}
        {info ? <p style={{ color: primary, marginTop: 10 }}>{info}</p> : null}
        <button
          onClick={resendConfirmation}
          disabled={cooldown > 0}
          style={{
            marginTop: 8,
            background: "transparent",
            color: primary,
            border: "none",
            cursor: cooldown > 0 ? "not-allowed" : "pointer",
            opacity: cooldown > 0 ? 0.6 : 1,
            fontWeight: 600
          }}
        >
          {cooldown > 0 ? `Zaslat znovu (${cooldown}s)` : "Zaslat potvrzovací e‑mail znovu"}
        </button>
        <p style={{ marginTop: 16, fontWeight: 600 }}>
          Máte účet? <a href="/login" style={{ color: primary, textDecoration: "none" }}>Přihlásit se</a>
        </p>
      </div>
    </div>
  )
}
