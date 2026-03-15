import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { completeJobWithAsset, downloadAndUploadToS3, failJob, getSignedUrlForAsset } from "@/lib/storage-utils"

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

async function finalizeNovitaVideoJob(
  supabase: ReturnType<typeof createClient>,
  job: any
): Promise<any> {
  const taskId = String(job?.provider_job_id ?? job?.task_id ?? "")
  const key = process.env.NOVITA_API_KEY
  if (!taskId || !key) return job

  const res = await fetch(`https://api.novita.ai/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) return job

  const data = await res.json().catch(() => null)
  const status = data?.task?.status

  if (status === "TASK_STATUS_SUCCEED") {
    const videoUrl = data?.videos?.[0]?.video_url
    if (!videoUrl) return job

    const userId = String(job?.user_id ?? "")
    const jobId = String(job?.id ?? "")
    if (!userId || !jobId) return job

    const s3Key = `video/${userId}/${jobId}.mp4`
    await downloadAndUploadToS3(videoUrl, s3Key, "video/mp4")
    await completeJobWithAsset(supabase as any, jobId, s3Key, "video/mp4", videoUrl)
    return { ...job, status: "succeeded", s3_key: s3Key, mime: "video/mp4" }
  }

  if (status === "TASK_STATUS_FAILED") {
    const jobId = String(job?.id ?? "")
    const reason = String(data?.task?.reason || "Unknown Novita error")
    if (jobId) await failJob(supabase as any, jobId, reason)

    const userId = String(job?.user_id ?? "")
    const cost = Number(job?.cost || 0)
    if (userId && cost > 0) {
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .maybeSingle()
      if (profile) {
        await (supabase as any)
          .from("profiles")
          .update({ credits: ((profile as any).credits || 0) + cost })
          .eq("id", userId)
      }
    }
    return { ...job, status: "failed", error: reason }
  }

  return job
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

    const candidates = merged
      .filter((j) => {
        const status = String(j?.status ?? "").toLowerCase()
        if (status === "succeeded" || status === "failed") return false
        const taskId = String(j?.provider_job_id ?? "").trim()
        if (!taskId) return false
        return normalizeType(j?.type, j?.mime, j?.s3_key) === "video"
      })
      .slice(0, 2)

    for (const job of candidates) {
      try {
        const updated = await finalizeNovitaVideoJob(supabase as any, job)
        Object.assign(job, updated)
      } catch {}
    }

    const jobIds = merged.map((j) => String(j?.id ?? "")).filter(Boolean)
    const assetMap = new Map<string, { storage_path: string; mime: string | null }>()
    if (jobIds.length > 0) {
      const { data: assets } = await supabase
        .from("generation_assets")
        .select("job_id, storage_path, mime, kind")
        .in("job_id", jobIds)
        .eq("kind", "output")

      for (const a of assets || []) {
        const id = String((a as any)?.job_id ?? "")
        const path = String((a as any)?.storage_path ?? "")
        if (!id || !path) continue
        if (!assetMap.has(id)) assetMap.set(id, { storage_path: path, mime: (a as any)?.mime ?? null })
      }
    }

    const jobsWithSignedUrls = await Promise.all(
      merged.map(async (job: any) => {
        let s3Key = pickFirstString(job, ["s3_key", "storage_path", "output_s3_key", "video_s3_key", "result_s3_key"])
        let mime = pickFirstString(job, ["mime", "content_type", "output_mime"])
        if (!s3Key) {
          const asset = assetMap.get(String(job?.id ?? ""))
          if (asset?.storage_path) s3Key = asset.storage_path
          if (!mime && asset?.mime) mime = asset.mime
        }
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
