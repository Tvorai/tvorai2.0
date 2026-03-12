import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSignedUrlForAsset } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("id")
  if (!jobId) return NextResponse.json({ error: "Missing job ID" }, { status: 400 })

  try {
    // 1. Fetch job from DB - check both tables because of potential sync delay
    let { data: job, error } = await supabase
      .from("generation_jobs")
      .select("s3_key, type")
      .eq("id", jobId)
      .single()

    if (error || !job?.s3_key) {
      console.log("[Download] Job not found in generation_jobs or missing s3_key, checking generations table...")
      const { data: genJob, error: genError } = await supabase
        .from("generations")
        .select("s3_key, type")
        .eq("id", jobId)
        .single()
      
      job = genJob
      error = genError
    }

    if (error || !job || !job.s3_key) {
      console.error("[Download] Asset not found in any table:", { jobId, error })
      return NextResponse.json({ error: "Job or asset not found" }, { status: 404 })
    }

    // 2. Generate signed URL with forced download header
    const ext = job.type === 'video' ? 'mp4' : 'png'
    const filename = `${job.type}-${jobId}.${ext}`
    
    const downloadUrl = await getSignedUrlForAsset(job.s3_key, filename)

    // 3. Redirect user to the signed URL
    return NextResponse.redirect(downloadUrl)
  } catch (e: any) {
    console.error("[Download] Error generating link", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
