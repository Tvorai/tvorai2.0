import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { signVerificationToken } from "@/lib/otp-utils"

function normalizePhone(input: string): string {
  return input.replace(/\s+/g, "").trim()
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string

  if (!url || !service) {
    return NextResponse.json({ error: "Chybí konfigurace serveru." }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const phoneNumber = normalizePhone(String(body?.phoneNumber || ""))
  const token = String(body?.token || "").trim()

  if (!phoneNumber || !token) {
    return NextResponse.json({ error: "Telefonní číslo a kód jsou povinné." }, { status: 400 })
  }

  const supabaseAdmin = createClient(url, service)

  // 1. Verify OTP using Supabase
  const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
    phone: phoneNumber,
    token: token,
    type: "sms",
  })

  if (verifyError || !verifyData.user) {
    return NextResponse.json(
      { error: verifyError?.message || "Kód je neplatný nebo vypršel." },
      { status: 400 }
    )
  }

  // 2. We don't want the user to be logged in yet.
  // Since verifyOtp created a user (if it didn't exist), we keep it for now but we'll delete it during the final registration step if needed.
  // Actually, better to delete it NOW if it doesn't have an email yet, so it doesn't create a partial user.
  if (!verifyData.user.email) {
    await supabaseAdmin.auth.admin.deleteUser(verifyData.user.id)
  }

  // 3. Return a signed verification token
  const verificationToken = signVerificationToken(phoneNumber)

  return NextResponse.json({ ok: true, verificationToken })
}
