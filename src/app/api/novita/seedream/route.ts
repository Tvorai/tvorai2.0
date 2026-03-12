import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createJob, completeJobWithAsset, downloadAndUploadToS3, getSignedUrlForAsset, failJob } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

const COST = 12

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  console.log("[Novita] Starting Seedream generation")
  if (!key) {
    console.error("[Novita] Missing NOVITA_API_KEY")
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }
  let body: { prompt?: string; size?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    console.error("[Novita] Invalid JSON body")
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const prompt = (body.prompt || "").trim()
  const size = body.size || "2048x2048"
  const userId = body.userId

  console.log("[Novita] Params:", { prompt, size, userId })

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
    console.error("[Novita] User profile not found:", userId)
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  if ((profile.credits || 0) < COST) {
    console.warn("[Novita] Insufficient credits:", { userId, current: profile.credits, cost: COST })
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
  }

  // 2. Deduct credits
  const newBalance = (profile.credits || 0) - COST
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newBalance })
    .eq("id", userId)

  if (updateError) {
    console.error("[Novita] Failed to update credits:", updateError)
    return NextResponse.json({ error: "Failed to update credits" }, { status: 500 })
  }

  // 3. Log transaction (async)
  supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "image_generation",
    amount: -COST,
    note: "t2i generation",
    balance_after: newBalance
  }).then(({ error }) => {
    if (error) console.error("[Novita] Error logging transaction:", error)
  })

  // 4. Create Job Record
  let job: any
  try {
    job = await createJob(supabase, userId, "image", "seedream", { prompt, size }, COST)
    console.log("[Novita] Job created in DB:", job.id)
  } catch (e) {
    console.error("[Novita] Failed to create job record", e)
    // Continue anyway, but history won't work well
  }

  try {
    console.log("[Novita] Calling Seedream-4.0 API...")
    const res = await fetch("https://api.novita.ai/v3/seedream-4.0", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        size,
        sequential_image_generation: "disabled",
        watermark: false
      })
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("[Novita] API error:", { status: res.status, text })
      // Refund credits if generation failed
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) }) // Restore original
        .eq("id", userId)
      
      if (job) {
          await failJob(supabase, job.id, text)
      }
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = (await res.json()) as { images?: string[] }
    const url = data?.images?.[0]
    console.log("[Novita] API response received, image URL:", url)
    
    if (!url) {
      console.error("[Novita] No image URL in response")
      // Refund if no URL
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
        
      if (job) {
          await failJob(supabase, job.id, "No image URL returned")
      }
      return NextResponse.json({ error: "No image URL returned" }, { status: 502 })
    }

    // 5. Upload to S3 and save asset
    let finalUrl = url
    if (job) {
        try {
            const s3Key = `t2i/${userId}/${job.id}.png`
            console.log("[Novita] Uploading to S3:", s3Key)
            await downloadAndUploadToS3(url, s3Key, "image/png")
            console.log("[Novita] Upload successful, updating job...")
            await completeJobWithAsset(supabase, job.id, s3Key, "image/png", url)
            finalUrl = await getSignedUrlForAsset(s3Key)
            console.log("[Novita] Job completed. Signed URL generated.")
        } catch (e: any) {
            console.error("[Novita] Failed to upload to S3", e)
            if (job) {
              await failJob(supabase, job.id, `S3 upload failed: ${e.message}`)
            }
        }
    }

    return NextResponse.json({ url: finalUrl })
  } catch (e: any) {
    console.error("[Novita] Unexpected error:", e)
    // Refund on exception
    await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
        
    if (job) {
        await failJob(supabase, job.id, e?.message || "Upstream error")
    }
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
