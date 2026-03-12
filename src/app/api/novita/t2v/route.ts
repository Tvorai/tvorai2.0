import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createJob, failJob } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  console.log("[Novita T2V] Starting generation")
  if (!key) {
    console.error("[Novita T2V] Missing NOVITA_API_KEY")
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }
  let body: { prompt?: string; duration?: number; userId?: string }
  try {
    body = await req.json()
  } catch {
    console.error("[Novita T2V] Invalid JSON body")
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const prompt = (body.prompt || "").trim()
  const duration = body.duration || 5
  const userId = body.userId
  const cost = duration === 10 ? 40 : 25

  console.log("[Novita T2V] Params:", { prompt, duration, userId, cost })

  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 })
  }
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  // 1. Check credits
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .single()

  if (profileError || !profile) {
    console.error("[Novita T2V] User profile not found:", userId)
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  if ((profile.credits || 0) < cost) {
    console.warn("[Novita T2V] Insufficient credits:", { userId, current: profile.credits, cost })
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
  }

  // 2. Deduct credits
  const newBalance = (profile.credits || 0) - cost
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newBalance })
    .eq("id", userId)

  if (updateError) {
    console.error("[Novita T2V] Failed to update credits:", updateError)
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
    if (error) console.error("[Novita T2V] Error logging transaction:", error)
  })

  let job: any
  try {
    // Initial job record (queued)
    job = await createJob(supabase, userId, "video", "wan-2.2-t2v", { prompt, duration }, cost)
    console.log("[Novita T2V] Job created in DB:", job.id)
  } catch (e) {
    console.error("[Novita T2V] Failed to create job record", e)
  }

  try {
    console.log("[Novita T2V] Calling Wan 2.2 T2V API...")
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
      console.error("[Novita T2V] API error:", { status: res.status, text })
      // Refund
      await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
      if (job) {
          await failJob(supabase, job.id, text)
      }
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = await res.json()
    const taskId = data.task_id
    console.log("[Novita T2V] API task created:", taskId)
    
    // 4. Update Job Record with task_id
    if (job) {
        await supabase.from("generation_jobs").update({ 
            provider_job_id: taskId,
            task_id: taskId,
            status: "running"
        }).eq("id", job.id)
        console.log("[Novita T2V] Job updated with taskId:", taskId)
    }

    return NextResponse.json({ taskId })
  } catch (e: any) {
    console.error("[Novita T2V] Unexpected error:", e)
    // Refund
    await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
    if (job) {
        await failJob(supabase, job.id, e?.message || "Upstream error")
    }
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
