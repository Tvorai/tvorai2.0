import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { downloadAndUploadToS3, completeJobWithAsset, getSignedUrlForAsset, failJob } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId")
  const jobIdFromQuery = req.nextUrl.searchParams.get("jobId")
  const key = process.env.NOVITA_API_KEY
  
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 })
  }
  if (!key) {
    return NextResponse.json({ error: "NOVITA_API_KEY is missing" }, { status: 500 })
  }

  console.log(`[TaskResult] Checking status for task: ${taskId}`)

  try {
    const res = await fetch(`https://api.novita.ai/v3/async/task-result?task_id=${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`
      }
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`[TaskResult] API error for task ${taskId}:`, { status: res.status, text })
      return NextResponse.json({ error: `Novita error ${res.status}: ${text}` }, { status: 502 })
    }

    const data = await res.json()
    const status = data.task?.status
    console.log(`[TaskResult] Task ${taskId} status: ${status}`)

    // Look up the job in our DB
    let job: any = null
    if (jobIdFromQuery) {
      const { data: byId } = await (supabase as any)
        .from("generation_jobs")
        .select("*")
        .eq("id", jobIdFromQuery)
        .maybeSingle()
      job = byId
      if (job?.id && !job?.provider_job_id && !job?.task_id) {
        try {
          await (supabase as any)
            .from("generation_jobs")
            .update({ provider_job_id: taskId, task_id: taskId, status: "running" })
            .eq("id", job.id)
        } catch {}
      }
    } else {
      const byProvider = await (supabase as any)
        .from("generation_jobs")
        .select("*")
        .eq("provider_job_id", taskId)
        .maybeSingle()

      if (!byProvider?.error && byProvider?.data) {
        job = byProvider.data
      } else {
        const byTask = await (supabase as any)
          .from("generation_jobs")
          .select("*")
          .eq("task_id", taskId)
          .maybeSingle()
        if (!byTask?.error && byTask?.data) job = byTask.data
      }
    }
    
    if (job?.id) {
        if (status === "TASK_STATUS_SUCCEED" && job.status !== "succeeded") {
            const videoUrl = data.videos?.[0]?.video_url
            console.log(`[TaskResult] Job ${job.id} succeeded. Video URL: ${videoUrl}`)
            
            if (videoUrl) {
                try {
                    const s3Key = `video/${job.user_id}/${job.id}.mp4`
                    console.log(`[TaskResult] Starting download and upload to S3: ${s3Key}`)
                    
                    await downloadAndUploadToS3(videoUrl, s3Key, "video/mp4")
                    console.log(`[TaskResult] Uploaded to S3 successfully`)
                    
                    await completeJobWithAsset(supabase, job.id, s3Key, "video/mp4", videoUrl)
                    console.log(`[TaskResult] Updated job status and assets in DB`)
                    
                    const signedUrl = await getSignedUrlForAsset(s3Key)
                    console.log(`[TaskResult] Generated signed URL: ${signedUrl}`)
                    
                    if (data.videos && data.videos[0]) {
                        data.videos[0].video_url = signedUrl
                    }
                } catch (e: any) {
                    console.error("[TaskResult] Failed to process video result", e)
                    if (job?.id) {
                        await failJob(supabase, job.id, `Processing failed: ${e.message}`)
                    }
                }
            }
        } else if (status === "TASK_STATUS_FAILED" && job.status !== "failed") {
            const reason = data.task?.reason || "Unknown Novita error"
            console.warn(`[TaskResult] Job ${job.id} failed. Reason: ${reason}`)
            
            if (job?.id) {
                await failJob(supabase, job.id, reason)
            }
            
            // Refund
            const { data: profile } = await (supabase as any)
              .from("profiles")
              .select("credits")
              .eq("id", job.user_id)
              .maybeSingle()
            if (profile) {
                await (supabase as any)
                  .from("profiles")
                  .update({ credits: ((profile as any).credits || 0) + (job.cost || 0) })
                  .eq("id", job.user_id)
                console.log(`[TaskResult] Refunded ${job.cost} credits to user ${job.user_id}`)
            }
        }
    } else {
      console.warn(`[TaskResult] No job found in DB for taskId: ${taskId}`)
    }

    return NextResponse.json({ ...data, jobId: job?.id || null })
  } catch (e: any) {
    console.error(`[TaskResult] Unexpected error for task ${taskId}:`, e)
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
