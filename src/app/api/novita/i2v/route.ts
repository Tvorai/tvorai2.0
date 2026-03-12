import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createJob, failJob } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  console.log("[Novita I2V] Starting generation")
  if (!key) {
    console.error("[Novita I2V] Missing NOVITA_API_KEY")
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    console.error("[Novita I2V] Invalid form data")
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const image = formData.get("image")
  const prompt = (formData.get("prompt") as string || "").trim()
  const duration = parseInt((formData.get("duration") as string) || "5", 10)
  const userId = formData.get("userId") as string

  console.log("[Novita I2V] Params:", { prompt, duration, userId })

  if (!image || !(image instanceof File)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 })
  }
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
    console.error("[Novita I2V] User profile not found:", userId)
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  if ((profile.credits || 0) < cost) {
    console.warn("[Novita I2V] Insufficient credits:", { userId, current: profile.credits, cost })
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
  }

  // 2. Upload image to Supabase Storage
  const fileExt = image.name.split('.').pop()
  const fileName = `i2v/${userId}/${Date.now()}.${fileExt}`
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from('generations')
    .upload(fileName, image, {
      contentType: image.type,
      upsert: false
    })

  if (uploadError) {
    console.error("[Novita I2V] Upload error:", uploadError)
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 })
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase
    .storage
    .from('generations')
    .createSignedUrl(fileName, 3600)

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error("[Novita I2V] Signed URL error:", signedUrlError)
    return NextResponse.json({ error: "Failed to get image URL" }, { status: 500 })
  }

  const imageUrl = signedUrlData.signedUrl

  // 3. Deduct credits
  const newBalance = (profile.credits || 0) - cost
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newBalance })
    .eq("id", userId)

  if (updateError) {
    console.error("[Novita I2V] Failed to update credits:", updateError)
    return NextResponse.json({ error: "Failed to update credits" }, { status: 500 })
  }

  // 4. Log transaction
  supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "video_generation",
    amount: -cost,
    note: `i2v generation (${duration}s)`,
    balance_after: newBalance
  }).then(({ error }) => {
    if (error) console.error("[Novita I2V] Error logging transaction:", error)
  })

  let job: any
  try {
    // Initial job record (queued)
    job = await createJob(supabase, userId, "video", "wan-i2v", { prompt, duration, image_url: imageUrl }, cost)
    console.log("[Novita I2V] Job created in DB:", job.id)
  } catch (e) {
    console.error("[Novita I2V] Failed to create job record", e)
  }

  try {
    console.log("[Novita I2V] Calling Wan I2V API...")
    // Novita Wan 2.1 I2V
    const res = await fetch("https://api.novita.ai/v3/async/wan-i2v", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt,
        width: 832,
        height: 480, // Default resolution
        steps: 30, // Default
        seed: -1
      })
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("[Novita I2V] API error:", { status: res.status, text })
      // Refund
      await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
      if (job) {
          await failJob(supabase, job.id, text)
      }
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = await res.json()
    const taskId = data.task_id
    console.log("[Novita I2V] API task created:", taskId)

    // 5. Update Job Record with task_id
    if (job) {
        await supabase.from("generation_jobs").update({ 
            provider_job_id: taskId,
            task_id: taskId,
            status: "running"
        }).eq("id", job.id)
        console.log("[Novita I2V] Job updated with taskId:", taskId)
    }

    return NextResponse.json({ taskId })
  } catch (e: any) {
    console.error("[Novita I2V] Unexpected error:", e)
    // Refund
    await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
    if (job) {
        await failJob(supabase, job.id, e?.message || "Upstream error")
    }
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
