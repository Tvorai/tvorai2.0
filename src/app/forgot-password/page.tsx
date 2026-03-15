"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setInfo("")
    setLoading(true)

    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim()
    const base = appUrl || origin
    const redirectTo = base ? `${base.replace(/\/$/, "")}/update-password` : undefined

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)

    if (error) {
      setError(error.message || "Nepodařilo se odeslat odkaz")
      return
    }

    setInfo("Odeslali jsme odkaz na obnovu hesla. Zkontrolujte e‑mail.")
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
      <style>{`
        .login-container {
          padding: 40px;
        }
        @media (max-width: 600px) {
          .login-container {
            padding: 20px 24px;
          }
        }
      `}</style>
      <div
        className="login-container"
        style={{
          flex: "1 1 500px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: bg,
        }}
      >
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
            <img
              src="/logo.png"
              alt="Logo"
              style={{ width: 110, height: 110, objectFit: "contain" }}
            />
          </div>
          <h1 style={{ fontSize: "clamp(36px, 4.3vw, 44px)", fontWeight: 900, marginBottom: 28, letterSpacing: 1, textTransform: "uppercase" }}>
            OBNOVA HESLA
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
                padding: "clamp(16px, 1.6vw, 18px) clamp(18px, 2vw, 22px)",
                borderRadius: 8,
                border: "none",
                outline: "none",
                fontSize: 17,
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
                padding: "clamp(16px, 1.6vw, 18px) clamp(18px, 2vw, 22px)",
                borderRadius: 8,
                border: "none",
                fontWeight: 800,
                fontSize: 17,
                cursor: "pointer",
                marginTop: 8,
                textTransform: "uppercase",
              }}
            >
              {loading ? "Odesílám…" : "Poslat odkaz na obnovu hesla"}
            </button>
          </form>
          {error ? <p style={{ color: "#F87171", marginTop: 16, fontWeight: 600 }}>{error}</p> : null}
          {info ? <p style={{ color: primary, marginTop: 16, fontWeight: 600 }}>{info}</p> : null}
          <div style={{ marginTop: 24 }}>
            <a href="/login" style={{ color: primary, textDecoration: "none", fontWeight: 800 }}>
              Zpět na přihlášení
            </a>
          </div>
        </div>
      </div>
      <div className="auth-hero-image" />
    </div>
  )
}
