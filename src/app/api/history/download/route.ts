import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSignedUrlForAsset } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

function pickFirstString(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k]
    if (typeof v === "string" && v.trim()) return v
  }
  return null
}

function guessExtension(s3Key: string | null, mime: string | null, type: string | null): string {
  const key = String(s3Key ?? "").toLowerCase()
  const mimeStr = String(mime ?? "").toLowerCase()
  const t = String(type ?? "").toLowerCase()

  const dot = key.lastIndexOf(".")
  if (dot >= 0 && dot < key.length - 1) {
    const ext = key.slice(dot + 1)
    if (/^[a-z0-9]+$/.test(ext)) return ext
  }

  if (mimeStr.startsWith("video/")) return "mp4"
  if (mimeStr.startsWith("image/")) return mimeStr.split("/")[1] || "png"
  if (t.includes("video") || t === "t2v" || t === "i2v") return "mp4"
  return "png"
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("id")
  if (!jobId) return NextResponse.json({ error: "Missing job ID" }, { status: 400 })

  try {
    let job: any = null
    let source: "generation_jobs" | "generations" | null = null

    const { data: genJob, error: genJobError } = await supabase
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle()

    if (!genJobError && genJob) {
      job = genJob
      source = "generation_jobs"
    } else {
      const { data: legacyJob, error: legacyError } = await supabase
        .from("generations")
        .select("*")
        .eq("id", jobId)
        .maybeSingle()

      if (!legacyError && legacyJob) {
        job = legacyJob
        source = "generations"
      }
    }

    if (!job || !source) {
      return NextResponse.json({ error: "Job or asset not found" }, { status: 404 })
    }

    let s3Key = pickFirstString(job, [
      "s3_key",
      "storage_path",
      "output_s3_key",
      "video_s3_key",
      "result_s3_key",
    ])
    let mime = pickFirstString(job, ["mime", "content_type", "output_mime"])

    if (!s3Key && source === "generation_jobs") {
      const { data: asset } = await supabase
        .from("generation_assets")
        .select("storage_path, mime")
        .eq("job_id", jobId)
        .eq("kind", "output")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (asset?.storage_path) s3Key = asset.storage_path
      if (!mime && asset?.mime) mime = asset.mime
    }

    if (!s3Key) {
      console.error("[Download] No S3 key found for job", { jobId, source })
      return NextResponse.json({ error: "Job or asset not found" }, { status: 404 })
    }

    const ext = guessExtension(s3Key, mime, String(job?.type ?? ""))
    const safeType = String(job?.type ?? "asset") || "asset"
    const filename = `${safeType}-${jobId}.${ext}`

    const downloadUrl = await getSignedUrlForAsset(s3Key, filename)

    // 3. Redirect user to the signed URL
    return NextResponse.redirect(downloadUrl)
  } catch (e: any) {
    console.error("[Download] Error generating link", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
