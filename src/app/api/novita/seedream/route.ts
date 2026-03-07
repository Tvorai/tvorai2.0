import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  if (!key) {
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }
  let body: { prompt?: string; size?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const prompt = (body.prompt || "").trim()
  const size = body.size || "2048x2048"
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 })
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
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }
    const data = (await res.json()) as { images?: string[] }
    const url = data?.images?.[0]
    if (!url) {
      return NextResponse.json({ error: "No image URL returned" }, { status: 502 })
    }
    return NextResponse.json({ url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
