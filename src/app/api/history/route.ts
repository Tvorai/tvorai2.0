import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSignedUrlForAsset } from "@/lib/storage-utils"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

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
    // Fetch generations
    const { data: jobs, error: jobsError } = await supabase
      .from("generations")
      .select(`
        id, created_at, type, status, provider, prompt, cost, s3_key, mime
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)

    if (jobsError) throw jobsError

    // Sign URLs for assets
    const jobsWithSignedUrls = await Promise.all(jobs.map(async (job) => {
      let url = null
      if (job.s3_key) {
        try {
          url = await getSignedUrlForAsset(job.s3_key)
        } catch (e) {
          console.error(`Failed to sign URL for ${job.s3_key}`, e)
        }
      }
      return { ...job, url }
    }))

    return NextResponse.json({ jobs: jobsWithSignedUrls })
  } catch (e: any) {
    console.error("History API error:", e)
    return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 })
  }
}
