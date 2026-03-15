"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [showResend, setShowResend] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tvorai_remembered_email")
      if (saved) {
        setEmail(saved)
        setRememberMe(true)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      if (rememberMe) {
        if (email.trim()) localStorage.setItem("tvorai_remembered_email", email.trim())
      } else {
        localStorage.removeItem("tvorai_remembered_email")
      }
    } catch {}
  }, [rememberMe, email])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")
    setInfo("")
    setShowResend(false)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      console.log("Login error:", error.message)
      if (error.message === "Invalid login credentials") {
        setError("Nesprávné přihlašovací údaje")
      } else if (error.message === "Email not confirmed") {
        setError("E-mail není potvrzen")
        setShowResend(true)
      } else {
        setError(error.message || "Přihlášení selhalo")
      }
    } else {
      router.push("/")
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
      {/* Left side - Form */}
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
        <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
          <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
            <img
              src="/logo.png"
              alt="Logo"
              style={{ width: 120, height: 120, objectFit: "contain" }}
            />
          </div>
          <h1 style={{ fontSize: "clamp(42px, 5vw, 56px)", fontWeight: 900, marginBottom: 40, letterSpacing: 1 }}>
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
                padding: "clamp(16px, 1.8vw, 18px) clamp(20px, 2.2vw, 24px)",
                borderRadius: 8,
                border: "none",
                outline: "none",
                fontSize: 18,
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
                padding: "clamp(16px, 1.8vw, 18px) clamp(20px, 2.2vw, 24px)",
                borderRadius: 8,
                border: "none",
                outline: "none",
                fontSize: 18,
                fontWeight: 500,
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: primary }}
              />
              <span style={{ fontWeight: 600, color: white, fontSize: 14 }}>Zapamatovat si mě</span>
            </label>
            <a
              href="/forgot-password"
              style={{ color: primary, textDecoration: "none", fontWeight: 600, fontSize: 14, textAlign: "left" }}
            >
              Zapomněli jste heslo?
            </a>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: primary,
                color: "#000000",
                padding: "clamp(16px, 1.8vw, 18px) clamp(20px, 2.2vw, 24px)",
                borderRadius: 8,
                border: "none",
                fontWeight: 800,
                fontSize: 20,
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
            {showResend && (
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
            )}
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
      <div className="auth-hero-image" />
    </div>
  )
}
