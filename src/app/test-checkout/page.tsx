"use client"

import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function TestCheckoutPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push("/login")
      }
      setLoading(false)
    }
    checkSession()
  }, [router])

  const handleCheckout = async () => {
    // 1. Verify user session
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
      body: JSON.stringify({}),
    })

    if (res.status === 401) {
      router.push("/login")
      return
    }

    const data = await res.json()

    if (data.url) {
      window.location.href = data.url
    } else {
      console.error(data)
      alert("Nepodarilo sa vytvoriť checkout session")
    }
  }

  if (loading) {
    return <div style={{ padding: "40px", color: "white" }}>Načítavam...</div>
  }

  return (
    <div style={{ padding: "40px", color: "white" }}>
      <h1>Test Stripe Checkout</h1>
      <button
        onClick={handleCheckout}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: "#00C8D7",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        Kúpiť plán
      </button>
    </div>
  )
}
