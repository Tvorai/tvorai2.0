import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { s3Client } from "./s3"
import { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = process.env.AWS_S3_BUCKET!

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })
  await s3Client.send(command)
  return key
}

export async function getSignedUrlForAsset(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1 hour
}

export async function downloadAndUploadToS3(
  url: string,
  key: string,
  contentType?: string
): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`)
  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const mime = contentType || res.headers.get("content-type") || "application/octet-stream"
  return await uploadToS3(buffer, key, mime)
}

export async function createJob(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  provider: string,
  inputJson: any,
  cost: number,
  providerJobId?: string
) {
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      user_id: userId,
      type,
      status: providerJobId ? "running" : "succeeded", // async jobs start as running, sync as succeeded immediately (if we upload immediately)
      provider,
      provider_job_id: providerJobId,
      input_json: inputJson,
      cost,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function completeJobWithAsset(
  supabase: SupabaseClient,
  jobId: string,
  s3Key: string,
  mime: string
) {
  // 1. Create asset
  const { error: assetError } = await supabase.from("generation_assets").insert({
    job_id: jobId,
    kind: "output",
    storage_path: s3Key,
    mime,
  })
  if (assetError) throw assetError

  // 2. Update job status
  const { error: jobError } = await supabase
    .from("generation_jobs")
    .update({ status: "succeeded" })
    .eq("id", jobId)
  if (jobError) throw jobError
}
