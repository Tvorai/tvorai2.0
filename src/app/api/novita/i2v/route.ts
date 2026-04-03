import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createJob, failJob, getSignedUrlForAsset, uploadToS3 } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

function parseMissingColumn(error: any): string | null {
  const message = typeof error?.message === "string" ? error.message : ""
  const match = message.match(/Could not find the '([^']+)' column/)
  return match?.[1] ?? null
}

async function safeUpdateJobById(id: string, patch: Record<string, any>) {
  const maxRetries = 25
  let currentPatch = { ...patch }
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { error } = await supabase.from("generation_jobs").update(currentPatch).eq("id", id)
    if (!error) return
    const missing = parseMissingColumn(error)
    if (missing && Object.prototype.hasOwnProperty.call(currentPatch, missing)) {
      const { [missing]: _omit, ...rest } = currentPatch
      currentPatch = rest
      continue
    }
    throw error
  }
}

function extFromFile(file: File): string {
  const name = (file.name || "").toLowerCase()
  const parts = name.split(".")
  const ext = parts.length > 1 ? parts[parts.length - 1] : ""
  if (ext) return ext
  const mime = (file.type || "").toLowerCase()
  if (mime.includes("png")) return "png"
  if (mime.includes("webp")) return "webp"
  if (mime.includes("gif")) return "gif"
  return "jpg"
}

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
  const ratio = (formData.get("ratio") as string) || "16:9"
  const userId = formData.get("userId") as string

  console.log("[Novita I2V] Params:", { prompt, duration, ratio, userId })

  if (!image || !(image instanceof File)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 })
  }
  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 })
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

  const cost = duration === 10 ? 72 : 36
  const { width, height } = (() => {
    if (ratio === "1:1") return { width: 640, height: 640 }
    if (ratio === "9:16") return { width: 480, height: 832 }
    return { width: 832, height: 480 }
  })()

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

  // 2. Deduct credits
  const newBalance = (profile.credits || 0) - cost
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newBalance })
    .eq("id", userId)

  if (updateError) {
    console.error("[Novita I2V] Failed to update credits:", updateError)
    return NextResponse.json({ error: "Failed to update credits" }, { status: 500 })
  }

  // 3. Log transaction
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
  let imageUrl: string | null = null
  try {
    // Initial job record (queued)
    job = await createJob(supabase, userId, "video", "wan-i2v", { prompt, duration, ratio, width, height }, cost)
    if (job?.id) {
      console.log("[Novita I2V] Job created in DB:", job.id)
    }
  } catch (e) {
    console.error("[Novita I2V] Failed to create job record", e)
  }

  try {
    if (!job?.id) {
      throw new Error("Job not created")
    }

    const ext = extFromFile(image)
    const inputKey = `inputs/${userId}/${job.id}.${ext}`
    const contentType = image.type || "image/jpeg"
    const buffer = Buffer.from(await image.arrayBuffer())

    await uploadToS3(buffer, inputKey, contentType)
    imageUrl = await getSignedUrlForAsset(inputKey)

    try {
      await safeUpdateJobById(job.id, {
        image_url: imageUrl,
        prompt,
        status: "queued",
        input_json: {
          ...(job.input_json || {}),
          prompt,
          duration,
          ratio,
          width,
          height,
          image_url: imageUrl,
          input_s3_key: inputKey,
        },
      })
    } catch (e) {
      console.error("[Novita I2V] Failed to update job with input url", e)
    }

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
        width,
        height,
        duration,
        steps: 30, // Default
        seed: -1
      })
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("[Novita I2V] API error:", { status: res.status, text })
      // Refund
      await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
      if (job?.id) {
          await failJob(supabase, job.id, text)
      }
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = await res.json()
    console.log("[NOVITA] raw response:", JSON.stringify(data, null, 2))
    const taskId = data.task_id || data.job_id || data.data?.task_id

    if (!taskId) {
      console.error("[Novita I2V] No task_id in response")
      // Refund
      await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
      if (job?.id) {
          await failJob(supabase, job.id, "No task_id returned from Novita")
      }
      return NextResponse.json({ error: "No task_id returned from Novita" }, { status: 502 })
    }

    console.log("[Novita I2V] API task created:", taskId)

    // 5. Update Job Record with task_id and status running
    if (job?.id) {
      try {
        await safeUpdateJobById(job.id, {
          provider_job_id: taskId,
          task_id: taskId,
          status: "running",
        })
        console.log("[Novita I2V] Job updated with taskId:", taskId, "status: running")
      } catch (e) {
        console.error("[Novita I2V] Failed to update job with taskId:", e)
      }
    }

    return NextResponse.json({ taskId, jobId: job?.id || null })
  } catch (e: any) {
    console.error("[Novita I2V] Unexpected error:", e)
    // Refund
    await supabase.from("profiles").update({ credits: profile.credits }).eq("id", userId)
    if (job?.id) {
        await failJob(supabase, job.id, e?.message || "Upstream error")
    }
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
