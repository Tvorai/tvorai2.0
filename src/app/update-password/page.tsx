"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function UpdatePasswordPage() {
  const router = useRouter()

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let canceled = false
    supabase.auth.getSession().then(({ data }) => {
      if (canceled) return
      setReady(true)
      if (!data.session) {
        setError("Odkaz na obnovenie hesla je neplatný alebo expiroval. Skúste to znova.")
      }
    })
    return () => {
      canceled = true
    }
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setInfo("")

    if (!password || password.length < 6) {
      setError("Heslo musí mať aspoň 6 znakov.")
      return
    }
    if (password !== confirm) {
      setError("Heslá sa nezhodujú.")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message || "Nepodarilo sa zmeniť heslo")
      return
    }

    setInfo("Heslo bolo zmenené. Presmerovávam na prihlásenie…")
    setTimeout(() => router.push("/login"), 1500)
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
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
            <img
              src="/logo.png"
              alt="Logo"
              style={{ width: 100, height: 100, objectFit: "contain" }}
            />
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 28, letterSpacing: 1, textTransform: "uppercase" }}>
            NOVÉ HESLO
          </h1>

          {!ready ? (
            <div>Načítanie…</div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
              <input
                type="password"
                placeholder="Nové heslo"
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
              <input
                type="password"
                placeholder="Potvrdiť heslo"
                value={confirm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
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
                disabled={loading || !!error}
                style={{
                  width: "100%",
                  background: primary,
                  color: "#000000",
                  padding: "16px 20px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: "pointer",
                  marginTop: 8,
                  textTransform: "uppercase",
                  opacity: loading || !!error ? 0.8 : 1,
                }}
              >
                {loading ? "Ukladám…" : "Nastaviť nové heslo"}
              </button>
            </form>
          )}

          {error ? <p style={{ color: "#F87171", marginTop: 16, fontWeight: 600 }}>{error}</p> : null}
          {info ? <p style={{ color: primary, marginTop: 16, fontWeight: 600 }}>{info}</p> : null}
          <div style={{ marginTop: 24 }}>
            <a href="/login" style={{ color: primary, textDecoration: "none", fontWeight: 800 }}>
              Späť na prihlásenie
            </a>
          </div>
        </div>
      </div>
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

