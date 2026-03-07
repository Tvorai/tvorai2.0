"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function LoginPage() {
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
    setInfo("")
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message || "Přihlášení selhalo")
    } else {
      router.push("/app")
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
        display: "flex",
        flexWrap: "wrap",
      }}
    >
      {/* Left side - Form */}
      <div
        style={{
          flex: "1 1 500px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 40,
          background: bg,
        }}
      >
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
            <img
              src="/logo.png"
              alt="Logo"
              style={{ width: 100, height: 100, objectFit: "contain" }}
            />
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 900, marginBottom: 40, letterSpacing: 1 }}>
            PŘIHLÁŠENÍ
          </h1>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
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
                padding: "16px 20px",
                borderRadius: 8,
                border: "none",
                outline: "none",
                fontSize: 16,
                fontWeight: 500,
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
                padding: "16px 20px",
                borderRadius: 8,
                border: "none",
                outline: "none",
                fontSize: 16,
                fontWeight: 500,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: primary,
                color: "#000000",
                padding: "16px 20px",
                borderRadius: 8,
                border: "none",
                fontWeight: 800,
                fontSize: 18,
                cursor: "pointer",
                marginTop: 8,
                textTransform: "uppercase",
              }}
            >
              {loading ? "Probíhá…" : "PŘIHLÁSIT SE"}
            </button>
          </form>
          {error ? <p style={{ color: "#F87171", marginTop: 16, fontWeight: 600 }}>{error}</p> : null}
          {info ? <p style={{ color: primary, marginTop: 16, fontWeight: 600 }}>{info}</p> : null}
          
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <button
              onClick={resendConfirmation}
              disabled={cooldown > 0}
              style={{
                background: "transparent",
                color: primary,
                border: "none",
                cursor: cooldown > 0 ? "not-allowed" : "pointer",
                opacity: cooldown > 0 ? 0.6 : 1,
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {cooldown > 0 ? `Zaslat znovu (${cooldown}s)` : "Zaslat potvrzovací e‑mail znovu"}
            </button>
            <p style={{ fontWeight: 600, fontSize: 16 }}>
              <span style={{ opacity: 0.7 }}>Nemáte účet?</span>{" "}
              <a href="/register" style={{ color: primary, textDecoration: "none", fontWeight: 800 }}>
                REGISTROVAT
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Image */}
      <div
        style={{
          flex: "1 1 500px",
          minHeight: "40vh",
          backgroundImage: "url('/login-imagine.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    </div>
  )
}
