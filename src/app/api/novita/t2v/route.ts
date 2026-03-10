import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  if (!key) {
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }

  let body: { prompt?: string; duration?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const prompt = (body.prompt || "").trim()
  const duration = parseInt(body.duration || "5", 10)
  const userId = body.userId

  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 })
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

  const cost = duration === 10 ? 72 : 36

  // 1. Check credits
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  if ((profile.credits || 0) < cost) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
  }

  // 2. Deduct credits
  const newBalance = (profile.credits || 0) - cost
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newBalance })
    .eq("id", userId)

  if (updateError) {
    return NextResponse.json({ error: "Failed to update credits" }, { status: 500 })
  }

  // 3. Log transaction
  supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "video_generation",
    amount: -cost,
    note: `t2v generation (${duration}s)`,
    balance_after: newBalance
  }).then(({ error }) => {
    if (error) console.error("Error logging transaction:", error)
  })

  try {
    // Novita Wan 2.2 T2V
    const res = await fetch("https://api.novita.ai/v3/async/wan-2.2-t2v", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: { prompt },
        parameters: {
          size: "832*480",
          duration: duration === 10 ? 8 : 5 // Wan 2.2 supports 5 or 8
        }
      })
    })

    if (!res.ok) {
      const text = await res.text()
      // Refund
      await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ taskId: data.task_id })
  } catch (e: any) {
    // Refund
    await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
