import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createJob, completeJobWithAsset, uploadToS3, getSignedUrlForAsset, failJob } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

const COST = 12

async function toDataUrl(input: any): Promise<string> {
  if (typeof input === "string") return input
  const buffer = Buffer.from(await input.arrayBuffer())
  const base64 = buffer.toString("base64")
  const mime = input.type || "image/png"
  return `data:${mime};base64,${base64}`
}

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  console.log("[Novita MergeFace] Starting generation")
  if (!key) {
    console.error("[Novita MergeFace] Missing NOVITA_API_KEY")
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }
  let body: { face?: string; target?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    console.error("[Novita MergeFace] Invalid JSON body")
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const face = body.face
  const target = body.target
  const userId = body.userId

  console.log("[Novita MergeFace] Params:", { userId })

  if (!face || !target) {
    return NextResponse.json({ error: "Missing face or target image" }, { status: 400 })
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
    console.error("[Novita MergeFace] User profile not found:", userId)
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  if ((profile.credits || 0) < COST) {
    console.warn("[Novita MergeFace] Insufficient credits:", { userId, current: profile.credits, cost: COST })
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
  }

  // 2. Deduct credits
  const newBalance = (profile.credits || 0) - COST
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newBalance })
    .eq("id", userId)

  if (updateError) {
    console.error("[Novita MergeFace] Failed to update credits:", updateError)
    return NextResponse.json({ error: "Failed to update credits" }, { status: 500 })
  }

  // 3. Log transaction
  supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "image_generation",
    amount: -COST,
    note: "faceswap generation",
    balance_after: newBalance
  }).then(({ error }) => {
    if (error) console.error("[Novita MergeFace] Error logging transaction:", error)
  })

  // 4. Create Job Record
  let job: any
  try {
    job = await createJob(supabase, userId, "faceswap", "merge-face", {}, COST)
    if (job?.id) {
      console.log("[Novita MergeFace] Job created in DB:", job.id)
    }
  } catch (e) {
    console.error("[Novita MergeFace] Failed to create job record", e)
  }

  try {
    console.log("[Novita MergeFace] Converting images to data URLs...")
    const faceData = await toDataUrl(face)
    const targetData = await toDataUrl(target)
    
    console.log("[Novita MergeFace] Calling Merge-Face API...")
    const res = await fetch("https://api.novita.ai/v3/merge-face", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        face_image_file: faceData,
        image_file: targetData,
        merge_strategy: "fast"
      })
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("[Novita MergeFace] API error:", { status: res.status, text })
      // Refund
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
      
      if (job?.id) {
          await failJob(supabase, job.id, text)
      }
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = (await res.json()) as { image_file?: string; image_type?: string }
    
    if (!data?.image_file) {
      console.error("[Novita MergeFace] No image file in response")
      // Refund
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
        
      if (job?.id) {
          await failJob(supabase, job.id, "No image returned")
      }
      return NextResponse.json({ error: "No image returned" }, { status: 502 })
    }

    const mime = data.image_type ? `image/${data.image_type}` : "image/png"
    const url = `data:${mime};base64,${data.image_file}`
    console.log("[Novita MergeFace] API response received, image type:", mime)
    
    // 5. Upload to S3
    let finalUrl = url
    if (job?.id) {
        try {
            const buffer = Buffer.from(data.image_file, "base64")
            const s3Key = `faceswap/${userId}/${job.id}.png`
            console.log("[Novita MergeFace] Uploading to S3:", s3Key)
            await uploadToS3(buffer, s3Key, mime)
            console.log("[Novita MergeFace] Upload successful, updating job...")
            await completeJobWithAsset(supabase, job.id, s3Key, mime)
            finalUrl = await getSignedUrlForAsset(s3Key)
            console.log("[Novita MergeFace] Job completed. Signed URL generated.")
        } catch (e: any) {
            console.error("[Novita MergeFace] Failed to upload to S3", e)
            if (job?.id) {
              await failJob(supabase, job.id, `S3 upload failed: ${e.message}`)
            }
        }
    }

    return NextResponse.json({ url: finalUrl })
  } catch (e: any) {
    console.error("[Novita MergeFace] Unexpected error:", e)
    // Refund
    await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
    
    if (job?.id) {
        await failJob(supabase, job.id, e?.message || "Upstream error")
    }
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
