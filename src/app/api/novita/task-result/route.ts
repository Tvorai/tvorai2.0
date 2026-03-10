import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { downloadAndUploadToS3, completeJobWithAsset, getSignedUrlForAsset } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

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
    
    const status = data.task?.status

    // Look up the job in our DB
    const { data: job } = await supabase
        .from("generations")
        .select("id, user_id, status, cost")
        .eq("provider_job_id", taskId)
        .single()
    
    if (job) {
        if (status === "TASK_STATUS_SUCCEED" && job.status !== "succeeded") {
            const videoUrl = data.videos?.[0]?.video_url
            console.log(`[TaskResult] Job ${job.id} succeeded. Video URL: ${videoUrl}`)
            
            if (videoUrl) {
                try {
                    const s3Key = `video/${job.user_id}/${job.id}.mp4`
                    console.log(`[TaskResult] Starting upload to S3: ${s3Key}`)
                    
                    await downloadAndUploadToS3(videoUrl, s3Key, "video/mp4")
                    console.log(`[TaskResult] Uploaded to S3 successfully`)
                    
                    await completeJobWithAsset(supabase, job.id, s3Key, "video/mp4")
                    console.log(`[TaskResult] Updated job status and assets in DB`)
                    
                    // Replace the video_url in the response with our signed URL
                    const signedUrl = await getSignedUrlForAsset(s3Key)
                    console.log(`[TaskResult] Generated signed URL: ${signedUrl}`)
                    
                    // Modify data to return our signed URL to frontend
                    if (data.videos && data.videos[0]) {
                        data.videos[0].video_url = signedUrl
                    }
                } catch (e) {
                    console.error("[TaskResult] Failed to upload video result to S3", e)
                }
            }
        } else if (status === "TASK_STATUS_FAILED" && job.status !== "failed") {
            console.log(`[TaskResult] Job ${job.id} failed. Reason: ${data.task?.reason}`)
            
            await supabase.from("generations").update({ 
                status: "failed", 
                error: data.task?.reason 
            }).eq("id", job.id)
            
            // Refund
             if (job.cost) {
                 const { data: profile } = await supabase.from("profiles").select("credits").eq("id", job.user_id).single()
                 if (profile) {
                     const newCredits = (profile.credits || 0) + job.cost
                     await supabase.from("profiles").update({ credits: newCredits }).eq("id", job.user_id)
                     
                     // Log refund
                     await supabase.from("credit_transactions").insert({
                         user_id: job.user_id,
                         type: "refund",
                         amount: job.cost,
                         note: `Refund for failed job ${job.id}`,
                         balance_after: newCredits
                     })
                     console.log(`[TaskResult] Refunded ${job.cost} credits to user ${job.user_id}`)
                 }
             }
        }
    }
    
    return NextResponse.json(data)
  } catch (e: any) {
    console.error("[TaskResult] Error:", e)
    return NextResponse.json({ error: e?.message || "Upstream error" }, { status: 500 })
  }
}
