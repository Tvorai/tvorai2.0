"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function PricingPage() {
  const router = useRouter()
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const [loading, setLoading] = useState<string | null>(null)

  const primary = "#00C8D7"
  const bg = "#0A0A0A"
  const surface = "#1A1A1A"
  const text = "#FFFFFF"

  useEffect(() => {
    // Check session on mount
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Optional: Redirect to login or allow viewing pricing?
        // User didn't specify, but usually pricing is public.
        // However, the checkout needs auth.
      }
    }
    checkSession()
  }, [])

  const handleSubscribe = async (planKey: string) => {
    setLoading(planKey)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push("/login")
        return
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: planKey }),
      })

      if (res.status === 401) {
        router.push("/login")
        return
      }

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert("Chyba při vytváření platby")
        setLoading(null)
      }
    } catch (e) {
      console.error(e)
      alert("Chyba připojení")
      setLoading(null)
    }
  }

  const plans = [
    {
      id: "starter",
      name: "Starter",
      monthlyPrice: 390,
      yearlyPrice: 3900,
      monthlyVideos: 15,
      monthlyImages: 80,
      yearlyVideos: 180,
      yearlyImages: 960,
      highlight: false,
    },
    {
      id: "pro",
      name: "Pro",
      monthlyPrice: 899,
      yearlyPrice: 8999,
      monthlyVideos: 40,
      monthlyImages: 180,
      yearlyVideos: 480,
      yearlyImages: 2160,
      highlight: true,
    },
    {
      id: "studio",
      name: "Studio",
      monthlyPrice: 1999,
      yearlyPrice: 19999,
      monthlyVideos: 100,
      monthlyImages: 400,
      yearlyVideos: 1200,
      yearlyImages: 4800,
      highlight: false,
    },
  ]

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: bg,
        color: text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px",
      }}
    >
      <div style={{ marginBottom: 40, display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            fontWeight: 700,
            color: billingCycle === "monthly" ? text : "#6B7280",
            cursor: "pointer",
            fontSize: 20
          }}
          onClick={() => setBillingCycle("monthly")}
        >
          Měsíčně
        </span>
        
        <div
          onClick={() => setBillingCycle(c => c === "monthly" ? "yearly" : "monthly")}
          style={{
            width: 64,
            height: 32,
            background: surface,
            borderRadius: 999,
            padding: 4,
            cursor: "pointer",
            border: `1px solid ${primary}`,
            display: "flex",
            alignItems: "center",
            position: "relative"
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              background: text,
              borderRadius: "50%",
              transform: billingCycle === "monthly" ? "translateX(0)" : "translateX(32px)",
              transition: "transform 0.3s ease",
            }}
          />
        </div>

        <span
          style={{
            fontWeight: 700,
            color: billingCycle === "yearly" ? text : "#6B7280",
            cursor: "pointer",
            fontSize: 20,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
          onClick={() => setBillingCycle("yearly")}
        >
          Ročně
          <span style={{ fontSize: 12, color: primary, fontWeight: 400 }}>2 měsíce zdarma</span>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 24,
          maxWidth: 1200,
          width: "100%",
        }}
      >
        {plans.map((plan) => {
          const isYearly = billingCycle === "yearly"
          const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice
          const videos = isYearly ? plan.yearlyVideos : plan.monthlyVideos
          const images = isYearly ? plan.yearlyImages : plan.monthlyImages
          const planKey = `${plan.id}_${billingCycle}` // e.g., starter_monthly

          return (
            <div
              key={plan.id}
              style={{
                background: "#000000",
                border: plan.highlight ? `2px solid ${primary}` : "1px solid #333",
                borderRadius: 16,
                padding: 32,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                transform: plan.highlight ? "scale(1.05)" : "none",
                zIndex: plan.highlight ? 10 : 1,
              }}
            >
              {plan.highlight && (
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: -32,
                    background: primary,
                    color: "#000",
                    padding: "4px 32px",
                    transform: "rotate(45deg)",
                    fontWeight: 800,
                    fontSize: 12,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.5)"
                  }}
                >
                  NEJOBLÍBENĚJŠÍ
                </div>
              )}
              
              <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>{plan.name}</h2>
              
              <div style={{ marginBottom: 32, textAlign: "center" }}>
                <span style={{ fontSize: 16, color: primary, fontWeight: 700, verticalAlign: "top", marginRight: 4 }}>CZK</span>
                <span style={{ fontSize: 48, fontWeight: 800 }}>{price.toLocaleString("cs-CZ").replace(/\s/g, " ")}</span>
                <div style={{ fontSize: 14, color: primary, marginTop: -4 }}>
                  {isYearly ? "Ročně" : "Měsíčně"}
                </div>
              </div>

              <div style={{ display: "grid", gap: 16, width: "100%", marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12l3 3 5-5" />
                  </svg>
                  <span style={{ fontSize: 18, fontWeight: 500 }}>{videos} videí</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12l3 3 5-5" />
                  </svg>
                  <span style={{ fontSize: 18, fontWeight: 500 }}>{images} obrázků</span>
                </div>
              </div>

              <button
                onClick={() => handleSubscribe(planKey)}
                disabled={loading !== null}
                style={{
                  width: "100%",
                  padding: "16px",
                  borderRadius: 8,
                  border: "none",
                  background: primary,
                  color: "#000",
                  fontSize: 18,
                  fontWeight: 800,
                  cursor: loading !== null ? "not-allowed" : "pointer",
                  opacity: loading !== null ? 0.7 : 1,
                  marginTop: "auto"
                }}
              >
                {loading === planKey ? "Zpracovávám..." : "Předplatit"}
              </button>
            </div>
          )
        })}
      </div>
      
      <div style={{ marginTop: 40 }}>
        <a href="/ucet" style={{ color: "#6B7280", textDecoration: "none", fontSize: 14 }}>
          Zpět na účet
        </a>
      </div>
    </div>
  )
}
