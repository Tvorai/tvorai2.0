import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { s3Client } from "./s3"
import { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"

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
    console.log(`[DB] Attempting insert into '${table}'`, { attempt, payload: currentPayload })
    
    const { data, error } = await supabase
      .from(table)
      .insert(currentPayload)
      .select("*")
      .single()

    if (error) {
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

    // Ak Postgres vráti null kvôli RLS, ale my sme ID poslali v payloade, použijeme to naše.
    const finalData = (data && data.id) ? data : { ...currentPayload, ...data }

    if (!finalData?.id) {
      console.error(`[DB] Insert into '${table}' succeeded but NO ID returned from Supabase. Data:`, finalData)
      throw new Error(`[DB] Insert into '${table}' succeeded but no ID returned from Supabase. Check RLS policies!`)
    }

    console.log(`[DB] Insert successful, returned row:`, finalData)
    return finalData
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

export async function markJobRunningWithTaskId(
  supabase: SupabaseClient,
  jobId: string,
  taskId: string
) {
  if (!jobId || !taskId) return
  await safeUpdateById(supabase, "generation_jobs", jobId, {
    status: "running",
    provider_job_id: taskId,
    task_id: taskId,
  })
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET || "tvorai-history-prod"
  const region = process.env.AWS_REGION || "eu-north-1"
  
  console.log(`[S3] Uploading asset:`, {
    bucket,
    region,
    key,
    contentType,
    size: buffer.length
  })

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })
  
  await s3Client.send(command)
  console.log(`[S3] Upload successful: ${key}`)
  return key
}

export async function getSignedUrlForAsset(key: string, downloadName?: string): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET || "tvorai-history-prod"
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined
  })
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1 hour
}

export function getPublicUrlForAsset(key: string): string {
  const bucket = process.env.AWS_S3_BUCKET || "tvorai-history-prod"
  const region = process.env.AWS_REGION || "eu-north-1"
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
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
  // GENERUJEME UUID MANUÁLNE TU, aby sme ho vedeli aj keď RLS blokuje SELECT
  const jobId = randomUUID()

  const payload = {
    id: jobId,
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

  console.log("[DB] Creating generation_jobs record", { id: jobId, userId, provider, type, prompt: payload.prompt })
  const data = await safeInsertSingle(supabase, "generation_jobs", payload)
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

  // Získame trvalú verejnú S3 URL (aj keď bucket je private, toto je štandardný formát)
  // Prípadne môžeme použiť pôvodnú Novita URL ako fallback
  const s3PublicUrl = getPublicUrlForAsset(s3Key)

  const patch: Record<string, any> = {
    status: "succeeded",
    s3_key: s3Key,
    mime,
    image_url: s3PublicUrl || originalUrl, // Uprednostníme AWS URL
  }

  console.log("[DB] Completing generation_jobs record", { id: jobId, s3Key, imageUrl: patch.image_url })
  await safeUpdateById(supabase, "generation_jobs", jobId, patch)

  try {
    await supabase.from("generation_assets").insert({
      job_id: jobId,
      kind: "output",
      storage_path: s3Key,
      mime,
    })
  } catch {}

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
