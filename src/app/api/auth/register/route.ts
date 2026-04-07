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
  const phoneNumber = body?.phoneNumber ? normalizePhone(String(body.phoneNumber)) : null
  const email = String(body?.email || "").trim()
  const password = String(body?.password || "")
  const verificationToken = body?.verificationToken ? String(body.verificationToken) : null

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail a heslo jsou povinné." }, { status: 400 })
  }

  if (phoneNumber && !isValidE164(phoneNumber)) {
    return NextResponse.json(
      { error: "Telefonní číslo musí být ve formátu E.164." },
      { status: 400 }
    )
  }

  // 1. Verify the OTP verification token if provided
  if (phoneNumber && verificationToken) {
    const verifiedData = verifyVerificationToken(verificationToken)
    if (!verifiedData || verifiedData.phone !== phoneNumber) {
      return NextResponse.json({ error: "Ověření telefonu vypršelo. Zkuste znovu." }, { status: 400 })
    }
  }

  const supabaseAdmin = createClient(url, service)

  // 2. Check if a user with this email or phone already exists in Profiles
  const orCondition = phoneNumber 
    ? `email.eq.${email},phone_number.eq.${phoneNumber}`
    : `email.eq.${email}`

  const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, phone_number")
    .or(orCondition)
    .maybeSingle()

  if (profileCheckError) {
    console.error("Profile check error:", profileCheckError)
  }

  if (existingProfile) {
    if (existingProfile.email === email) {
      return NextResponse.json({ error: "Uživatel s tímto e-mailem již existuje." }, { status: 409 })
    }
    if (existingProfile.phone_number === phoneNumber) {
      return NextResponse.json({ error: "Uživatel s tímto telefonním číslem již existuje." }, { status: 409 })
    }
  }

  // 2b. Double check in Supabase Auth (security measure)
  const { data: authUserByEmail } = await supabaseAdmin.auth.admin.getUserByEmail(email)
  if (authUserByEmail?.user) {
    return NextResponse.json({ error: "Uživatel s tímto e-mailem již existuje v systému." }, { status: 409 })
  }

  // 3. Create the user in Supabase Auth
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    phone: phoneNumber || undefined,
    email_confirm: true,
    phone_confirm: !!phoneNumber,
    user_metadata: {
      phone_number: phoneNumber,
      phone_verified: !!phoneNumber,
    },
  })

  if (createError || !newUser.user) {
    return NextResponse.json({ error: createError?.message || "Registrace selhala." }, { status: 500 })
  }

  // 4. Update the profile and add credits
  // Note: The handle_new_user trigger in Supabase might have already created a profile for this user.
  // We should update it with the phone number and verified status.
  const FREE_CREDITS = 72
  const { error: profileUpdateError } = await supabaseAdmin
    .from("profiles")
    .update({
      phone_number: phoneNumber,
      phone_verified: !!phoneNumber,
      credits: FREE_CREDITS,
    })
    .eq("id", newUser.user.id)

  if (profileUpdateError) {
    console.error("Failed to update profile:", profileUpdateError)
  }

  return NextResponse.json({ ok: true })
}
