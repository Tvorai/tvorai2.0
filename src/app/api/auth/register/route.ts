import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { verifyVerificationToken } from "@/lib/otp-utils"

function normalizePhone(input: string): string {
  return input.replace(/\s+/g, "").trim()
}

function isValidE164(input: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(input)
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string

  if (!url || !service) {
    return NextResponse.json({ error: "Chybí konfigurace serveru." }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const phoneNumber = normalizePhone(String(body?.phoneNumber || ""))
  const email = String(body?.email || "").trim()
  const password = String(body?.password || "")
  const verificationToken = String(body?.verificationToken || "")

  if (!phoneNumber || !email || !password || !verificationToken) {
    return NextResponse.json({ error: "Všechna pole jsou povinná." }, { status: 400 })
  }

  if (!isValidE164(phoneNumber)) {
    return NextResponse.json(
      { error: "Telefonní číslo musí být ve formátu E.164." },
      { status: 400 }
    )
  }

  // 1. Verify the OTP verification token
  const verifiedData = verifyVerificationToken(verificationToken)
  if (!verifiedData || verifiedData.phone !== phoneNumber) {
    return NextResponse.json({ error: "Ověření telefonu vypršelo. Zkuste znovu." }, { status: 400 })
  }

  const supabaseAdmin = createClient(url, service)

  // 2. Check if a user with this email or phone already exists
  const { data: existingUser } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .or(`email.eq.${email},phone_number.eq.${phoneNumber}`)
    .maybeSingle()

  if (existingUser) {
    return NextResponse.json({ error: "Uživatel s tímto e-mailem nebo telefonem již existuje." }, { status: 409 })
  }

  // 3. Create the user in Supabase Auth
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      phone_number: phoneNumber,
      phone_verified: true,
    },
  })

  if (createError || !newUser.user) {
    return NextResponse.json({ error: createError?.message || "Registrace selhala." }, { status: 500 })
  }

  // 4. Update the profile and add credits
  // Note: The handle_new_user trigger in Supabase might have already created a profile for this user.
  // We should update it with the phone number and verified status.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      phone_number: phoneNumber,
      phone_verified: true,
    })
    .eq("id", newUser.user.id)

  if (profileError) {
    console.error("Failed to update profile:", profileError)
  }

  // 5. Add free credits (72 credits)
  const FREE_CREDITS = 72
  const { error: creditsError } = await supabaseAdmin
    .from("profiles")
    .update({ credits: FREE_CREDITS })
    .eq("id", newUser.user.id)
  
  if (creditsError) {
    console.error("Failed to add credits:", creditsError)
  }

  return NextResponse.json({ ok: true })
}
