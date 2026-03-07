"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

type TabKey = "t2i" | "faceswap" | "i2v" | "t2v"

export default function AppPage() {
  const router = useRouter()

  const primary = "#00C8D7"
  const bg = "#0A0A0A"
  const surface = "#1A1A1A"
  const text = "#FFFFFF"
  const muted = "#C7D2FE"

  const [tab, setTab] = useState<TabKey>("t2i")
  const [prompt, setPrompt] = useState("")
  const [aspect, setAspect] = useState("1:1_2048")
  const [duration, setDuration] = useState("5")
  const [swapSrc, setSwapSrc] = useState<File | null>(null)
  const [swapDst, setSwapDst] = useState<File | null>(null)
  const [imageInput, setImageInput] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [actionError, setActionError] = useState("")

  useEffect(() => {
    let canceled = false
    async function load() {
      setLoading(true)
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess.session?.user?.id
      if (!userId) {
        router.push("/login")
        return
      }
      const { data, error } = await supabase
        .from("credit_balances")
        .select("credits_total")
        .eq("user_id", userId)
        .maybeSingle()
      if (!canceled) {
        if (!error && data) setCredits(Number(data.credits_total) || 0)
        else setCredits(0)
        setLoading(false)
      }
    }
    load()
    return () => {
      canceled = true
    }
  }, [router])

  // Clear preview and errors when switching tabs
  useEffect(() => {
    setPreviewUrl(null)
    setActionError("")
  }, [tab])

  const cost = useMemo(() => {
    if (tab === "t2i") return 12
    if (tab === "faceswap") return 20
    if (tab === "i2v") return 60
    return 60
  }, [aspect, tab])

  async function signOut() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const aspectOptions = [
    { value: "1:1_2048", label: "1:1 (2048 x 2048)" },
    { value: "16:9_1920x1080", label: "16:9 (1920 x 1080)" },
    { value: "9:16_1080x1920", label: "9:16 (1080 x 1920)" },
    { value: "4:3_1536x1152", label: "4:3 (1536 x 1152)" }
  ]

  function currentSize(): string {
    const parts = aspect.split("_")
    if (parts.length === 2) {
      const second = parts[1]
      if (second.includes("x")) return second
      if (/^\d+$/.test(second)) return `${second}x${second}`
      return second
    }
    return "2048x2048"
  }

  async function handleAction() {
    setActionError("")
    if (tab === "t2i") {
      try {
        setLoading(true)
        const res = await fetch("/api/novita/seedream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, size: currentSize() })
        })
        const data = await res.json()
        setLoading(false)
        if (!res.ok) {
          setActionError(data?.error || "Chyba generování")
          return
        }
        setPreviewUrl(data.url)
      } catch (e: any) {
        setLoading(false)
        setActionError(e?.message || "Chyba sítě")
      }
      return
    }
    if (tab === "faceswap") {
      if (!swapSrc || !swapDst) return
      try {
        setLoading(true)
        const fd = new FormData()
        fd.append("face", swapSrc)
        fd.append("target", swapDst)
        const res = await fetch("/api/novita/merge-face", { method: "POST", body: fd })
        const data = await res.json()
        setLoading(false)
        if (!res.ok) {
          setActionError(data?.error || "Chyba výměny tváří")
          return
        }
        setPreviewUrl(data.url)
      } catch (e: any) {
        setLoading(false)
        setActionError(e?.message || "Chyba sítě")
      }
      return
    }
    setActionError("Tato akce ještě není připojená")
  }

  async function handleDownload() {
    if (!previewUrl) return
    try {
      const response = await fetch(previewUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `tvorai-${Date.now()}.${blob.type.split("/")[1] || "png"}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (e) {
      console.error("Download failed", e)
      window.open(previewUrl, "_blank")
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: bg,
        color: text,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo.png"
            alt="Logo"
            style={{ width: 44, height: 44, objectFit: "contain" }}
          />
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#0E1111",
            borderRadius: 999,
            padding: "8px 16px",
            border: `2px solid ${primary}`
          }}
          title="Zůstatek kreditů"
        >
          <span style={{ fontWeight: 800, fontSize: 18 }}>{credits ?? "—"}</span>
          <img
            src="/coin.png"
            alt="Kredity"
            style={{ width: 20, height: 20, objectFit: "contain" }}
          />
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Profil"
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              background: "transparent",
              border: `2px solid ${primary}`,
              display: "grid",
              placeItems: "center",
              cursor: "pointer"
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={primary}>
              <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 2.239-8 5v3h16v-3c0-2.761-3.582-5-8-5z"/>
            </svg>
          </button>
          {menuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                marginTop: 8,
                background: surface,
                borderRadius: 12,
                border: `1px solid ${primary}`,
                minWidth: 180,
                padding: 8
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push("/app/historie")
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  color: text,
                  border: "none",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer"
                }}
              >
                Historie
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push("/app/account")
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  color: text,
                  border: "none",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer"
                }}
              >
                Účet
              </button>
              <button
                onClick={signOut}
                style={{
                  width: "100%",
                  background: "transparent",
                  color: text,
                  border: "none",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer"
                }}
              >
                Odhlásit
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <nav
        style={{
          display: "flex",
          gap: 24,
          padding: "12px 24px",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 22
        }}
      >
        {[
          { key: "t2i", label: "Z textu obrázek" },
          { key: "faceswap", label: "Výměna tváří" },
          { key: "i2v", label: "Z obrázku video" },
          { key: "t2v", label: "Z textu video" }
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as TabKey)}
            style={{
              background: "transparent",
              border: "none",
              color: text,
              cursor: "pointer",
              position: "relative",
              padding: "6px 8px",
              opacity: tab === (t.key as TabKey) ? 1 : 0.7
            }}
          >
            {t.label}
            {tab === t.key ? (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: -6,
                  height: 4,
                  background: text,
                  borderRadius: 2
                }}
              />
            ) : null}
          </button>
        ))}
      </nav>

      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28
        }}
      >
        <section>
          {tab === "t2i" ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Popis obrázku:</div>
              <div
                style={{
                  background: surface,
                  borderRadius: 24,
                  padding: 16,
                  border: "1px solid #2A2A2A",
                  boxShadow: "inset 0 0 40px rgba(0,0,0,0.4)"
                }}
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Detailní popis, např. „futuristická ulice, neon, noc, 8k, filmový styl“"
                  rows={8}
                  style={{
                    width: "100%",
                    background: "transparent",
                    color: text,
                    border: "none",
                    outline: "none",
                    resize: "vertical",
                    minHeight: 160,
                    fontSize: 16,
                    lineHeight: 1.5,
                    fontFamily: "inherit"
                  }}
                />
              </div>
              <div style={{ marginTop: 16, fontWeight: 700 }}>Rozlišení / poměr stran:</div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    background: surface,
                    borderRadius: 24,
                    padding: "10px 12px",
                    border: `1px solid #2A2A2A`,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8
                  }}
                >
                  <select
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value)}
                    style={{
                      background: "transparent",
                      color: text,
                      border: "none",
                      outline: "none",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer"
                    }}
                  >
                    {aspectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} style={{ background: "#111", color: text }}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div
                    aria-hidden
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      background: "#2A2A2A",
                      display: "grid",
                      placeItems: "center",
                      color: text
                    }}
                  >
                    ↕
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {tab === "faceswap" ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Výměna tváří:</div>
              <div style={{ display: "grid", gap: 12 }}>
                <label
                  style={{
                    background: surface,
                    borderRadius: 24,
                    padding: 16,
                    border: "1px solid #2A2A2A"
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Zdrojová tvář</div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSwapSrc(e.target.files?.[0] ?? null)}
                    style={{ color: text }}
                  />
                </label>
                <label
                  style={{
                    background: surface,
                    borderRadius: 24,
                    padding: 16,
                    border: "1px solid #2A2A2A"
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Cílový obrázek</div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSwapDst(e.target.files?.[0] ?? null)}
                    style={{ color: text }}
                  />
                </label>
              </div>
            </>
          ) : null}

          {tab === "i2v" ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Z obrázku video:</div>
              <div
                style={{
                  background: surface,
                  borderRadius: 24,
                  padding: 16,
                  border: "1px solid #2A2A2A",
                  marginBottom: 12
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageInput(e.target.files?.[0] ?? null)}
                  style={{ color: text }}
                />
              </div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Délka videa (s):</div>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                style={{
                  background: surface,
                  color: text,
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  padding: "10px 12px"
                }}
              >
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="10">10</option>
              </select>
            </>
          ) : null}

          {tab === "t2v" ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Popis videa:</div>
              <div
                style={{
                  background: surface,
                  borderRadius: 24,
                  padding: 16,
                  border: "1px solid #2A2A2A",
                  boxShadow: "inset 0 0 40px rgba(0,0,0,0.4)"
                }}
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Krátký popis videa"
                  rows={6}
                  style={{
                    width: "100%",
                    background: "transparent",
                    color: text,
                    border: "none",
                    outline: "none",
                    resize: "vertical",
                    minHeight: 120,
                    fontSize: 16,
                    lineHeight: 1.5,
                    fontFamily: "inherit"
                  }}
                />
              </div>
              <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>Délka videa (s):</div>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                style={{
                  background: surface,
                  color: text,
                  border: "1px solid #2A2A2A",
                  borderRadius: 12,
                  padding: "10px 12px"
                }}
              >
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="10">10</option>
              </select>
            </>
          ) : null}
        </section>

        <section>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Náhled:</div>
          <div
            style={{
              background: surface,
              borderRadius: 24,
              padding: 16,
              border: "4px solid #00C8D7", // Made border thicker and colored
              height: 480,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              boxShadow: "0 0 20px rgba(0,200,215,0.3)", // Added outer glow
              position: "relative"
            }}
          >
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Náhled"
                  style={{ 
                    width: "100%", 
                    height: "100%", 
                    objectFit: "contain",
                    borderRadius: 16,
                    display: "block"
                  }}
                />
                {!loading && (
                  <button
                    onClick={handleDownload}
                    style={{
                      position: "absolute",
                      bottom: 20,
                      right: 20,
                      background: primary,
                      color: text,
                      border: "none",
                      borderRadius: 12,
                      padding: "10px 16px",
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                      zIndex: 10
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Stáhnout
                  </button>
                )}
              </>
            ) : (
              <div style={{ opacity: 0.6, textAlign: "center" }}>
                <div style={{ fontSize: 14, marginBottom: 4, color: muted }}>Zde se zobrazí výsledek</div>
                <div
                  style={{
                    width: 140,
                    height: 8,
                    borderRadius: 4,
                    background:
                      "radial-gradient(100px 60px at 50% 50%, rgba(255,255,255,0.06), rgba(0,0,0,0.0))"
                  }}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      <div style={{ display: "grid", placeItems: "center", padding: "40px 24px 60px" }}>
        <button
          onClick={handleAction}
          disabled={
            loading ||
            (tab === "t2i" && !prompt.trim()) ||
            (tab === "faceswap" && (!swapSrc || !swapDst)) ||
            (tab === "i2v" && !imageInput) ||
            (tab === "t2v" && !prompt.trim())
          }
          style={{
            background: "#FF00FF", // CHANGED TO MAGENTA FOR TESTING
            color: text,
            border: "none",
            cursor:
              loading ||
              (tab === "t2i" && !prompt.trim()) ||
              (tab === "faceswap" && (!swapSrc || !swapDst)) ||
              (tab === "i2v" && !imageInput) ||
              (tab === "t2v" && !prompt.trim())
                ? "not-allowed"
                : "pointer",
            borderRadius: 999,
            padding: "20px 40px",
            fontWeight: 900,
            fontSize: 24,
            minWidth: 400,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: "0 8px 0 #800080" // Darker magenta shadow
          }}
          title=""
        >
          <span>
            {tab === "t2i" ? "VYGENEROVAT (TEST)" : null}
            {tab === "faceswap" ? "VYMĚNIT TVÁŘE (TEST)" : null}
            {tab === "i2v" ? "VYTVOŘIT VIDEO (TEST)" : null}
            {tab === "t2v" ? "VYGENEROVAT VIDEO (TEST)" : null}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#0E1111",
              padding: "6px 10px",
              borderRadius: 999,
              border: `2px solid ${text}`
            }}
          >
            <span style={{ fontWeight: 800 }}>{cost}</span>
            <img
              src="/coin.png"
              alt="Kredity"
              style={{ width: 14, height: 14, objectFit: "contain" }}
            />
          </span>
        </button>
        {actionError ? <div style={{ color: "#F87171", marginTop: 10 }}>{actionError}</div> : null}
      </div>
    </div>
  )
}

