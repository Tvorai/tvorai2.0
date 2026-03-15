"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [sendingSms, setSendingSms] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  function normalizePhone(input: string): string {
    return input.replace(/\s+/g, "").trim()
  }

  function isValidE164(input: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(input)
  }

  function isValidOtp(input: string): boolean {
    return /^\d{6}$/.test(input)
  }

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function sendVerificationCode() {
    setError("")
    setInfo("")
    if (sendingSms) return
    if (cooldown > 0) return

    const normalizedPhone = normalizePhone(phoneNumber)
    if (!normalizedPhone) {
      setError("Zadejte telefonní číslo ve formátu +420...")
      return
    }
    if (!isValidE164(normalizedPhone)) {
      setError("Telefonní číslo musí být ve formátu E.164, např. +420123456789.")
      return
    }

    setSendingSms(true)
    const checkRes = await fetch("/api/auth/check-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: normalizedPhone }),
    })
    const checkJson = await checkRes.json().catch(() => ({}))
    if (!checkRes.ok) {
      setSendingSms(false)
      setError(checkJson?.error || "Nepodařilo se ověřit telefonní číslo. Zkuste to prosím znovu.")
      return
    }
    if (checkJson?.exists) {
      setSendingSms(false)
      setError("telefoní číslo už je použité")
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
    })
    setSendingSms(false)

    if (error) {
      const msg = (error.message || "").toLowerCase()
      if (msg.includes("rate limit")) {
        setError("Limit pro SMS vyčerpán. Zkuste to prosím za chvíli.")
      } else {
        setError(error.message || "Odeslání SMS selhalo")
      }
      return
    }

    setOtpSent(true)
    setInfo("Ověřovací kód jsme poslali přes SMS. Zadejte 6místný kód.")
    setCooldown(120)
  }

  async function verifyCodeAndFinish() {
    setError("")
    setInfo("")
    if (verifying) return

    const normalizedEmail = email.trim()
    const normalizedPhone = normalizePhone(phoneNumber)
    const normalizedOtp = otpCode.replace(/\s+/g, "").trim()

    if (!normalizedEmail) {
      setError("Zadejte e‑mail.")
      return
    }
    if (!password) {
      setError("Zadejte heslo.")
      return
    }
    if (!normalizedPhone || !isValidE164(normalizedPhone)) {
      setError("Telefonní číslo musí být ve formátu E.164, např. +420123456789.")
      return
    }
    if (!isValidOtp(normalizedOtp)) {
      setError("Zadejte 6místný kód z SMS.")
      return
    }

    setVerifying(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: normalizedOtp,
      type: "sms",
    })
    if (error) {
      setVerifying(false)
      const msg = (error.message || "").toLowerCase()
      if (msg.includes("invalid") || msg.includes("token")) {
        setError("Kód je neplatný nebo vypršel. Pošlete si nový kód a zkuste to znovu.")
      } else {
        setError(error.message || "Ověření kódu selhalo")
      }
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setVerifying(false)
      setError("Nepodařilo se dokončit registraci. Přihlášení po ověření SMS selhalo.")
      return
    }

    const claimRes = await fetch("/api/auth/claim-phone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        phoneNumber: normalizedPhone,
        email: normalizedEmail,
      }),
    })
    const claimJson = await claimRes.json().catch(() => ({}))
    if (!claimRes.ok) {
      setVerifying(false)
      setError(
        claimJson?.error ||
          "Nepodařilo se uložit ověřené telefonní číslo. Zkuste to prosím znovu."
      )
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      email: normalizedEmail,
      password,
    })
    if (updateError) {
      setVerifying(false)
      const msg = (updateError.message || "").toLowerCase()
      if (msg.includes("already") || msg.includes("registered")) {
        setError("Tento e‑mail už je použit u jiného účtu.")
      } else {
        setError(updateError.message || "Nepodařilo se nastavit e‑mail / heslo.")
      }
      return
    }

    setVerifying(false)
    router.push("/dashboard")
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
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
            <img
              src="/logo.png"
              alt="Logo"
              style={{ width: 110, height: 110, objectFit: "contain" }}
            />
          </div>
          <h1 style={{ fontSize: "clamp(42px, 5vw, 52px)", fontWeight: 900, marginBottom: 40, letterSpacing: 1, textTransform: "uppercase" }}>
            REGISTRACE
          </h1>
          <div style={{ display: "grid", gap: 16 }}>
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
                padding: "clamp(16px, 1.6vw, 18px) clamp(18px, 2vw, 22px)",
                borderRadius: 8,
                border: "none",
                outline: "none",
                fontSize: 17,
                fontWeight: 500,
              }}
            />
            <input
              type="tel"
              placeholder="Telefon ve formátu +420 nebo +421..."
              value={phoneNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoneNumber(e.target.value)}
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
              type="button"
              onClick={sendVerificationCode}
              disabled={sendingSms || cooldown > 0}
              style={{
                width: "100%",
                background: primary,
                color: "#000000",
                padding: "clamp(16px, 1.6vw, 18px) clamp(18px, 2vw, 22px)",
                borderRadius: 8,
                border: "none",
                fontWeight: 800,
                fontSize: 19,
                cursor: "pointer",
                marginTop: 8,
                textTransform: "uppercase",
                opacity: sendingSms || cooldown > 0 ? 0.85 : 1,
              }}
            >
              {sendingSms
                ? "Odesílám…"
                : cooldown > 0
                  ? `Znovu odeslat (${cooldown}s)`
                  : "ODESLAT OVĚŘOVACÍ KÓD"}
            </button>
            {otpSent ? (
              <>
                <input
                  inputMode="numeric"
                  placeholder="SMS kód (6 číslic)"
                  value={otpCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOtpCode(e.target.value)}
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
                  type="button"
                  onClick={verifyCodeAndFinish}
                  disabled={verifying}
                  style={{
                    width: "100%",
                    background: white,
                    color: "#000000",
                    padding: "clamp(16px, 1.6vw, 18px) clamp(18px, 2vw, 22px)",
                    borderRadius: 8,
                    border: "none",
                    fontWeight: 800,
                    fontSize: 19,
                    cursor: "pointer",
                    marginTop: 4,
                    textTransform: "uppercase",
                    opacity: verifying ? 0.85 : 1,
                  }}
                >
                  {verifying ? "Ověřuji…" : "OVĚŘIT KÓD"}
                </button>
              </>
            ) : null}
          </div>
          {error ? <p style={{ color: "#F87171", marginTop: 16, fontWeight: 600 }}>{error}</p> : null}
          {info ? <p style={{ color: primary, marginTop: 16, fontWeight: 600 }}>{info}</p> : null}
          
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <p style={{ fontWeight: 600, fontSize: 16 }}>
              <span style={{ opacity: 0.7 }}>Máte účet?</span>{" "}
              <a href="/login" style={{ color: primary, textDecoration: "none", fontWeight: 800 }}>
                PŘIHLÁSIT SE
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
