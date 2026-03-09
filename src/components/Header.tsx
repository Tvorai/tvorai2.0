"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function Header() {
  const router = useRouter()

  const primary = "#00C8D7"
  const surface = "#1A1A1A"
  const text = "#FFFFFF"

  const [credits, setCredits] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    let canceled = false
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess.session?.user?.id
      if (userId) {
        setUser(sess.session?.user)
        const { data, error } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", userId)
          .maybeSingle()
        if (!canceled) {
          if (!error && data) setCredits(Number(data.credits) || 0)
          else setCredits(0)
        }
      }
    }
    load()

    const handleUpdate = () => load()
    window.addEventListener("credits-updated", handleUpdate)

    return () => {
      window.removeEventListener("credits-updated", handleUpdate)
      canceled = true
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!user) return null

  return (
    <header
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        padding: "16px 24px"
      }}
    >
      <div 
        style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        onClick={() => router.push("/")}
      >
        <img
          src="/logo.png"
          alt="Logo"
          style={{ width: 44, height: 44, objectFit: "contain" }}
        />
      </div>
      
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "#0E1111",
            borderRadius: 999,
            padding: "8px 16px",
            border: `2px solid ${primary}`,
            color: text
          }}
          title="Zůstatek kreditů"
        >
          <span style={{ fontWeight: 800, fontSize: 18 }}>{credits ?? 0}</span>
          <img
            src="/coin.png"
            alt="Kredity"
            style={{ width: 20, height: 20, objectFit: "contain" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
                padding: 8,
                zIndex: 100
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false)
                  router.push("/historie")
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
                  router.push("/ucet")
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
                onClick={() => {
                  setMenuOpen(false)
                  router.push("/cenik")
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
                Ceník
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
              <a
                href="https://www.tvorai.cz/podpora"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "block",
                  width: "100%",
                  background: "transparent",
                  color: text,
                  border: "none",
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                  textDecoration: "none"
                }}
              >
                Podpora
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
