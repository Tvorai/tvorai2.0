import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSignedUrlForAsset } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

function isVideoType(input: any): boolean {
  const t = String(input ?? "").toLowerCase()
  return (
    t === "video" ||
    t === "t2v" ||
    t === "i2v" ||
    t === "text_to_video" ||
    t === "image_to_video" ||
    t.includes("video")
  )
}

function normalizeType(input: any, mime?: any, s3Key?: any): string {
  const mimeStr = String(mime ?? "").toLowerCase()
  const s3 = String(s3Key ?? "").toLowerCase()
  if (mimeStr.startsWith("video/")) return "video"
  if (s3.endsWith(".mp4") || s3.endsWith(".mov") || s3.endsWith(".webm")) return "video"
  if (isVideoType(input)) return "video"
  return String(input ?? "")
}

function pickFirstString(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === "string" && v.trim()) return v
  }
  return null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 })
  }

  // Verify user token
  // We can't use supabase.auth.getUser() with the service role client directly from the header token easily without creating a new client with that token.
  // Instead, let's just trust the client to pass the user ID? No, that's insecure.
  // We should create a client with the user's token.
  
  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await userSupabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    console.log("[History] Fetch jobs", { userId: user.id })

    const [{ data: generations, error: generationsError }, { data: genJobs, error: genJobsError }] = await Promise.all([
      supabase
      .from("generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
      supabase
        .from("generation_jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ])

    if (generationsError) throw generationsError
    if (genJobsError) throw genJobsError

    const combined = [...(generations || []), ...(genJobs || [])]
    const byId = new Map<string, any>()
    for (const j of combined) {
      const id = String(j?.id ?? "")
      if (!id) continue
      const existing = byId.get(id)
      if (!existing) {
        byId.set(id, j)
        continue
      }
      byId.set(id, { ...existing, ...j })
    }

    const merged = Array.from(byId.values()).sort((a, b) => {
      const at = new Date(a?.created_at ?? 0).getTime()
      const bt = new Date(b?.created_at ?? 0).getTime()
      return bt - at
    }).slice(0, 50)

    const jobsWithSignedUrls = await Promise.all(
      merged.map(async (job: any) => {
        const s3Key = pickFirstString(job, ["s3_key", "storage_path", "output_s3_key", "video_s3_key", "result_s3_key"])
        const mime = pickFirstString(job, ["mime", "content_type", "output_mime"])
        const normalized = normalizeType(job.type, mime, s3Key)

        let url: string | null = pickFirstString(job, [
          "url",
          "video_url",
          "result_url",
          "output_url",
          "image_url",
        ])

        if (s3Key) {
          try {
            url = await getSignedUrlForAsset(s3Key)
          } catch (e) {
            console.error(`[History] Failed to sign URL`, { s3Key, error: e })
          }
        }

        const thumbnailS3Key = pickFirstString(job, ["thumbnail_s3_key", "poster_s3_key", "thumb_s3_key"])
        let thumbnail_url: string | null = pickFirstString(job, ["thumbnail_url", "poster", "poster_url"])
        if (thumbnailS3Key) {
          try {
            thumbnail_url = await getSignedUrlForAsset(thumbnailS3Key)
          } catch (e) {
            console.error(`[History] Failed to sign thumbnail`, { s3Key: thumbnailS3Key, error: e })
          }
        }

        console.log("[History] Job map", { id: job.id, type: job.type, s3_key: s3Key, url })

        return { ...job, type: normalized, url, thumbnail_url }
      })
    )

    console.log("[History] Return jobs", { count: jobsWithSignedUrls.length })
    return NextResponse.json({ jobs: jobsWithSignedUrls })
  } catch (e: any) {
    console.error("History API error:", e)
    return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 })
  }
}
