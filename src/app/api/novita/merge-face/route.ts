import { NextRequest, NextResponse } from "next/server"

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const mime = file.type || "image/png"
      const base64 = result.split(",").pop() || ""
      resolve(`data:${mime};base64=${base64}`)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function POST(req: NextRequest) {
  const key = process.env.NOVITA_API_KEY
  if (!key) {
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }
  const form = await req.formData()
  const face = form.get("face")
  const target = form.get("target")
  if (!(face instanceof File) || !(target instanceof File)) {
    return NextResponse.json({ error: "Missing files 'face' and 'target'" }, { status: 400 })
  }
  try {
    const faceData = await toDataUrl(face)
    const targetData = await toDataUrl(target)
    const res = await fetch("https://api.novita.ai/v3/merge-face", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        face_image_file: faceData,
        image_file: targetData
      })
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }
    const data = (await res.json()) as { image_file?: string; image_type?: string }
    if (!data?.image_file) {
      return NextResponse.json({ error: "No image returned" }, { status: 502 })
    }
    const mime = data.image_type ? `image/${data.image_type}` : "image/png"
    const url = `data:${mime};base64,${data.image_file}`
    return NextResponse.json({ url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
