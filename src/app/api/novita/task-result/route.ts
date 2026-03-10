import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId")
  const key = process.env.NOVITA_API_KEY
  
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 })
  }
  if (!key) {
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }

  try {
    const res = await fetch(`https://api.novita.ai/v3/async/task-result?task_id=${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`
      }
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = await res.json()
    // data structure:
    // { task: { status: "TASK_STATUS_SUCCEED" | "TASK_STATUS_FAILED" | "TASK_STATUS_QUEUED" | "TASK_STATUS_PROCESSING", reason: "" }, videos: [{ video_url: "..." }] }
    
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
