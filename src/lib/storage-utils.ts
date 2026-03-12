import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { s3Client } from "./s3"
import { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = process.env.AWS_S3_BUCKET!

function parseMissingColumn(error: any): string | null {
  const message = typeof error?.message === "string" ? error.message : ""
  const match = message.match(/Could not find the '([^']+)' column/)
  return match?.[1] ?? null
}

async function safeInsertSingle(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, any>
) {
  const maxRetries = 25
  let currentPayload = { ...payload }
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase.from(table).insert(currentPayload).select().single()
    if (!error) return data

    const missing = parseMissingColumn(error)
    if (missing && Object.prototype.hasOwnProperty.call(currentPayload, missing)) {
      console.log(`[DB] Missing column '${missing}' on '${table}', retrying without it`)
      const { [missing]: _omit, ...rest } = currentPayload
      currentPayload = rest
      continue
    }

    console.error(`[DB] Insert into '${table}' failed`, { error, payload: currentPayload })
    throw error
  }

  throw new Error(`[DB] Insert into '${table}' failed after retries`)
}

async function safeUpdateById(
  supabase: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, any>
) {
  if (!id) {
    console.warn(`[DB] Cannot update '${table}' because ID is missing`, { patch })
    return
  }
  const maxRetries = 25
  let currentPatch = { ...patch }
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { error } = await supabase.from(table).update(currentPatch).eq("id", id)
    if (!error) return

    const missing = parseMissingColumn(error)
    if (missing && Object.prototype.hasOwnProperty.call(currentPatch, missing)) {
      console.log(`[DB] Missing column '${missing}' on '${table}', retrying without it`)
      const { [missing]: _omit, ...rest } = currentPatch
      currentPatch = rest
      continue
    }

    console.error(`[DB] Update '${table}' failed`, { error, id, patch: currentPatch })
    throw error
  }

  throw new Error(`[DB] Update '${table}' failed after retries`)
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET || "tvorai-history-prod"
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })
  await s3Client.send(command)
  return key
}

export async function getSignedUrlForAsset(key: string): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET || "tvorai-history-prod"
  const command = new GetObjectCommand({
    Bucket: bucket,
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
  const payload = {
    user_id: userId,
    type,
    status: providerJobId ? "running" : "queued",
    provider,
    provider_job_id: providerJobId,
    task_id: providerJobId,
    prompt: inputJson?.prompt,
    width: inputJson?.width,
    height: inputJson?.height,
    duration: inputJson?.duration,
    cost,
    input_json: inputJson,
  }

  console.log("[DB] Creating generation_jobs record", { userId, provider, type, prompt: payload.prompt })
  const data = await safeInsertSingle(supabase, "generation_jobs", payload)
  if (!data?.id) {
    console.error("[DB] Insert successful but no ID returned", { data })
  }
  console.log("[DB] Created generation_jobs record", { id: data?.id })
  return data
}

export async function completeJobWithAsset(
  supabase: SupabaseClient,
  jobId: string,
  s3Key: string,
  mime: string,
  originalUrl?: string
) {
  if (!jobId) return

  const patch: Record<string, any> = {
    status: "succeeded",
    s3_key: s3Key,
    mime,
    image_url: originalUrl,
  }

  console.log("[DB] Completing generation_jobs record", { id: jobId, s3Key })
  await safeUpdateById(supabase, "generation_jobs", jobId, patch)
  console.log("[DB] Completed generation_jobs record", { id: jobId })
}

export async function failJob(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string
) {
  if (!jobId) return

  const patch: Record<string, any> = {
    status: "failed",
    error_message: errorMessage,
    error: errorMessage,
  }

  console.log("[DB] Failing generation_jobs record", { id: jobId, error: errorMessage })
  await safeUpdateById(supabase, "generation_jobs", jobId, patch)
  console.log("[DB] Failed generation_jobs record", { id: jobId })
}
