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
  const [videoRatio, setVideoRatio] = useState("16:9")
  const [swapSrc, setSwapSrc] = useState<File | null>(null)
  const [swapDst, setSwapDst] = useState<File | null>(null)
  const [imageInput, setImageInput] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
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
      setUserId(userId)
      const { data, error } = await supabase
        .from("profiles")
        .select("credits, phone_verified")
        .eq("id", userId)
        .maybeSingle()
      
      console.log("[DEBUG] Supabase profile fetch:", { data, error, userId })
      
      if (!canceled) {
        if (!error && data) {
          /* Skip phone verification check for now
          if (!data.phone_verified) {
            // User logged in but phone not verified or registration not finished
            await supabase.auth.signOut()
            router.push("/login")
            return
          }
          */
          const userCredits = Number(data.credits) || 0
          console.log("[DEBUG] Setting credits to:", userCredits)
          setCredits(userCredits)
        } else {
          console.log("[DEBUG] No profile or error, setting credits to 0")
          setCredits(0)
        }
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
    setPreviewJobId(null)
    setActionError("")
  }, [tab])

  const cost = useMemo(() => {
    if (tab === "t2i") return 12
    if (tab === "faceswap") return 12
    if (tab === "i2v" || tab === "t2v") {
      return duration === "10" ? 72 : 36
    }
    return 12
  }, [tab, duration])

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

  async function resizeImageFile(file: File, maxDim: number): Promise<File> {
    const isImage = (file.type || "").toLowerCase().startsWith("image/")
    if (!isImage) return file

    const bitmap = await createImageBitmap(file)
    const w = bitmap.width
    const h = bitmap.height

    const scale = Math.min(1, maxDim / Math.max(w, h))
    if (scale >= 1) return file

    const outW = Math.max(1, Math.round(w * scale))
    const outH = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement("canvas")
    canvas.width = outW
    canvas.height = outH

    const ctx = canvas.getContext("2d")
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, outW, outH)

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.92
      )
    })

    const baseName = (file.name || "image").replace(/\.[^/.]+$/, "")
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" })
  }

  async function handleAction() {
    setActionError("")

    // Check credits
    if (credits === null) return
    console.log("[DEBUG] Credits check:", { credits, cost, tab, duration })
    if (Number(credits) < Number(cost)) {
      setActionError(`Nedostatek kreditů pro tuto akci (potřeba: ${cost}, máte: ${credits})`)
      return
    }

    if (tab === "t2i") {
      try {
        setLoading(true)
        const res = await fetch("/api/novita/seedream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, size: currentSize(), userId })
        })
        const data = await res.json()
        setLoading(false)
        if (!res.ok) {
          setActionError(data?.error || "Chyba generování")
          return
        }
        setPreviewUrl(data.url)
        setPreviewJobId(data.jobId || null)
        setCredits((c) => (c !== null ? c - cost : null))
        window.dispatchEvent(new Event("credits-updated"))
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
        const face = await resizeImageFile(swapSrc, 2048)
        const target = await resizeImageFile(swapDst, 2048)
        const fd = new FormData()
        fd.append("face", face)
        fd.append("target", target)
        if (userId) fd.append("userId", userId)
        const res = await fetch("/api/novita/merge-face", { method: "POST", body: fd })
        const data = await res.json()
        setLoading(false)
        if (!res.ok) {
          setActionError(data?.error || "Chyba výměny tváří")
          return
        }
        setPreviewUrl(data.url)
        setPreviewJobId(data.jobId || null)
        setCredits((c) => (c !== null ? c - cost : null))
        window.dispatchEvent(new Event("credits-updated"))
      } catch (e: any) {
        setLoading(false)
        setActionError(e?.message || "Chyba sítě")
      }
      return
    }

    if (tab === "i2v") {
      if (!imageInput) return
      try {
        setLoading(true)
        const fd = new FormData()
        fd.append("image", imageInput)
        fd.append("prompt", prompt)
        fd.append("duration", duration)
        fd.append("ratio", videoRatio)
        if (userId) fd.append("userId", userId)

        const res = await fetch("/api/novita/i2v", {
          method: "POST",
          body: fd
        })
        const data = await res.json()
        if (!res.ok) {
          setLoading(false)
          setActionError(data?.error || "Chyba generování videa")
          return
        }
        setPreviewJobId(data.jobId || null)
        setCredits((c) => (c !== null ? c - cost : null))
        window.dispatchEvent(new Event("credits-updated"))
        pollTask(data.taskId, data.jobId || null)
      } catch (e: any) {
        setLoading(false)
        setActionError(e?.message || "Chyba sítě")
      }
      return
    }

    if (tab === "t2v") {
      try {
        setLoading(true)
        const res = await fetch("/api/novita/t2v", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, duration, userId, ratio: videoRatio })
        })
        const data = await res.json()
        if (!res.ok) {
          setLoading(false)
          setActionError(data?.error || "Chyba generování videa")
          return
        }
        setPreviewJobId(data.jobId || null)
        setCredits((c) => (c !== null ? c - cost : null))
        window.dispatchEvent(new Event("credits-updated"))
        pollTask(data.taskId, data.jobId || null)
      } catch (e: any) {
        setLoading(false)
        setActionError(e?.message || "Chyba sítě")
      }
      return
    }
  }

  async function pollTask(taskId: string, jobId: string | null) {
    try {
      if (jobId) setPreviewJobId(jobId)
      const url = jobId
        ? `/api/novita/task-result?taskId=${encodeURIComponent(taskId)}&jobId=${encodeURIComponent(jobId)}`
        : `/api/novita/task-result?taskId=${encodeURIComponent(taskId)}`
      const res = await fetch(url)
      const data = await res.json()
      
      if (!res.ok) {
        setLoading(false)
        setActionError(data?.error || "Chyba při kontrole stavu")
        return
      }

      const status = data.task?.status
      if (status === "TASK_STATUS_SUCCEED") {
        setLoading(false)
        if (data.jobId) setPreviewJobId(data.jobId)
        const videoUrl = data.videos?.[0]?.video_url
        if (videoUrl) {
          setPreviewUrl(videoUrl)
        } else {
          setActionError("Video URL nenalezena")
        }
      } else if (status === "TASK_STATUS_FAILED") {
        setLoading(false)
        setActionError(data.task?.reason || "Generování selhalo")
      } else {
        // Continue polling
        setTimeout(() => pollTask(taskId, jobId), 3000)
      }
    } catch (e: any) {
       // Network error during poll, retry once or twice? Or just stop.
       // For now, retry after delay, but if persistent error, maybe stop?
       // We'll just retry.
       console.error("Poll error", e)
       setTimeout(() => pollTask(taskId, jobId), 3000)
    }
  }

  async function handleDownload() {
    if (!previewUrl) return
    try {
      if (previewJobId) {
        window.location.href = `/api/history/download?id=${encodeURIComponent(previewJobId)}`
        return
      }
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
      <style>{`
        .app-grid {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
        }
        @media (max-width: 900px) {
          .app-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

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

      <div className="app-grid">
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

              <div style={{ fontWeight: 700, marginBottom: 8 }}>Prompt (popis videa):</div>
              <div
                style={{
                  background: surface,
                  borderRadius: 24,
                  padding: 16,
                  border: "1px solid #2A2A2A",
                  boxShadow: "inset 0 0 40px rgba(0,0,0,0.4)",
                  marginBottom: 12
                }}
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Popište pohyb nebo změnu, např. 'zoom out, natural motion'"
                  rows={4}
                  style={{
                    width: "100%",
                    background: "transparent",
                    color: text,
                    border: "none",
                    outline: "none",
                    resize: "vertical",
                    minHeight: 80,
                    fontSize: 16,
                    lineHeight: 1.5,
                    fontFamily: "inherit"
                  }}
                />
              </div>
              
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                  marginTop: 12
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Délka videa (s):</div>
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
                    <option value="5">5</option>
                    <option value="10">10</option>
                  </select>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Poměr stran:</div>
                  <select
                    value={videoRatio}
                    onChange={(e) => setVideoRatio(e.target.value)}
                    style={{
                      background: surface,
                      color: text,
                      border: "1px solid #2A2A2A",
                      borderRadius: 12,
                      padding: "10px 12px"
                    }}
                  >
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </div>
              </div>
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
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                  marginTop: 12
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Délka videa (s):</div>
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
                    <option value="5">5</option>
                    <option value="10">10</option>
                  </select>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Poměr stran:</div>
                  <select
                    value={videoRatio}
                    onChange={(e) => setVideoRatio(e.target.value)}
                    style={{
                      background: surface,
                      color: text,
                      border: "1px solid #2A2A2A",
                      borderRadius: 12,
                      padding: "10px 12px"
                    }}
                  >
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </div>
              </div>
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
              border: "1px solid #2A2A2A",
              height: 280, // Even smaller height to be absolutely sure
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.5)",
              position: "relative"
            }}
          >
            {previewUrl ? (
              <>
                {tab === "i2v" || tab === "t2v" || previewUrl.endsWith(".mp4") ? (
                  <video
                    src={previewUrl}
                    controls
                    autoPlay
                    loop
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      borderRadius: 16,
                      display: "block"
                    }}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
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
                )}
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

      <div style={{ display: "grid", placeItems: "center", padding: "8px 24px 28px" }}>
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
            background: primary,
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
            padding: "18px 28px",
            fontWeight: 900,
            fontSize: 20,
            minWidth: 360,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: "0 6px 0 rgba(0, 0, 0, 0.35)",
            transition: "all 0.2s ease",
            opacity: loading ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.opacity = "0.8";
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.opacity = "1";
          }}
          onMouseDown={(e) => {
            if (!loading) e.currentTarget.style.opacity = "0.7";
          }}
          onMouseUp={(e) => {
            if (!loading) e.currentTarget.style.opacity = "0.8";
          }}
          title=""
        >
          <span>
            {tab === "t2i" ? "Generovat obrázek" : null}
            {tab === "faceswap" ? "Vyměnit tváře" : null}
            {tab === "i2v" ? "Vytvořit video" : null}
            {tab === "t2v" ? "Vygenerovat video" : null}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              padding: "6px 2px",
              borderRadius: 999,
              border: `none`
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
        {loading && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, color: "#CCCCCC", fontSize: 14, fontWeight: 500 }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: "spin 1s linear infinite" }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <style jsx>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
            Kontent se momentálně generuje, prosíme o strpení
          </div>
        )}
        {actionError ? <div style={{ color: "#F87171", marginTop: 10 }}>{actionError}</div> : null}
      </div>
    </div>
  )
}

