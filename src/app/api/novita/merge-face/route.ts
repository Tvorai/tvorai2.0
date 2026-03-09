import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

const COST = 18

async function toDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString("base64")
  const mime = file.type || "image/png"
  return `data:${mime};base64,${base64}`
}

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  if (!key) {
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }
  
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const face = form.get("face")
  const target = form.get("target")
  const userId = form.get("userId") as string | null

  if (!(face instanceof File) || !(target instanceof File)) {
    return NextResponse.json({ error: "Missing files 'face' and 'target'" }, { status: 400 })
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

  // 3. Log transaction
  supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "image_generation",
    amount: -COST,
    note: "faceswap generation",
    balance_after: newBalance
  }).then(({ error }) => {
    if (error) console.error("Error logging transaction:", error)
  })

  try {
    const faceData = await toDataUrl(face)
    const targetData = await toDataUrl(target)
    
    // Novita merge-face endpoint: https://api.novita.ai/v3/merge-face
    // Docs say body should be JSON with "face_image_file" and "image_file" as base64 data urls?
    // Or maybe just base64 strings?
    // The previous code used data urls.

    const res = await fetch("https://api.novita.ai/v3/merge-face", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        face_image_file: faceData, // "data:image/png;base64,..."
        image_file: targetData,
        merge_strategy: "fast" // optional?
      })
    })

    if (!res.ok) {
      const text = await res.text()
      // Refund
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = (await res.json()) as { image_file?: string; image_type?: string }
    
    if (!data?.image_file) {
      // Refund
      await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
      return NextResponse.json({ error: "No image returned" }, { status: 502 })
    }

    const mime = data.image_type ? `image/${data.image_type}` : "image/png"
    const url = `data:${mime};base64,${data.image_file}`
    
    return NextResponse.json({ url })
  } catch (e: any) {
    // Refund
    await supabase
        .from("profiles")
        .update({ credits: (profile.credits || 0) })
        .eq("id", userId)
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
