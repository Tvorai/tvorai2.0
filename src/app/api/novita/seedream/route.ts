import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createJob, completeJobWithAsset, downloadAndUploadToS3, getSignedUrlForAsset } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

const COST = 12

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  if (!key) {
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }
  let body: { prompt?: string; size?: string; userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const prompt = (body.prompt || "").trim()
  const size = body.size || "2048x2048"
  const userId = body.userId

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
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  if ((profile.credits || 0) < COST) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
  }

  // 2. Deduct credits
  const newBalance = (profile.credits || 0) - COST
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newBalance })
    .eq("id", userId)

  if (updateError) {
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
    if (error) console.error("Error logging transaction:", error)
  })

  // 4. Create Job Record
  let job: any
  try {
    job = await createJob(supabase, userId, "image", "seedream", { prompt, size }, COST)
  } catch (e) {
    console.error("Failed to create job record", e)
    // Continue anyway, but history won't work well
  }

  try {
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
      // Refund credits if generation failed
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) }) // Restore original
        .eq("id", userId)
      
      if (job) {
          await supabase.from("generations").update({ status: "failed", error: text }).eq("id", job.id)
      }
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = (await res.json()) as { images?: string[] }
    const url = data?.images?.[0]
    
    if (!url) {
      // Refund if no URL
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
        
      if (job) {
          await supabase.from("generations").update({ status: "failed", error: "No image URL returned" }).eq("id", job.id)
      }
      return NextResponse.json({ error: "No image URL returned" }, { status: 502 })
    }

    // 5. Upload to S3 and save asset
    let finalUrl = url
    if (job) {
        try {
            const s3Key = `t2i/${userId}/${job.id}.png`
            await downloadAndUploadToS3(url, s3Key, "image/png")
            await completeJobWithAsset(supabase, job.id, s3Key, "image/png")
            // Return signed URL or the original?
            // Returning signed URL ensures we verify S3 works, but original is faster.
            // Let's return signed URL to be consistent with history view.
            finalUrl = await getSignedUrlForAsset(s3Key)
        } catch (e) {
            console.error("Failed to upload to S3", e)
            // If S3 fails, we still return the Novita URL so user gets their image
        }
    }

    return NextResponse.json({ url: finalUrl })
  } catch (e: any) {
    // Refund on exception
    await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
        
    if (job) {
        await supabase.from("generations").update({ status: "failed", error: e?.message }).eq("id", job.id)
    }
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
