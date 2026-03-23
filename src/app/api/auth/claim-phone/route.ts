import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function normalizePhone(input: string): string {
  return input.replace(/\s+/g, "").trim()
}

function isValidE164(input: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(input)
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string

  if (!url || !anon || !service) {
    return NextResponse.json({ error: "Chybí konfigurace serveru." }, { status: 500 })
  }

  const authHeader = req.headers.get("Authorization") || ""
  if (!authHeader) {
    return NextResponse.json({ error: "Nejste přihlášeni." }, { status: 401 })
  }

  const supabaseAuth = createClient(url, anon, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Nejste přihlášeni." }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const phoneNumber = normalizePhone(String(body?.phoneNumber || ""))
  const email = String(body?.email || "").trim()
  const password = String(body?.password || "")

  if (!phoneNumber) {
    return NextResponse.json({ error: "Telefonní číslo je povinné." }, { status: 400 })
  }
  if (!isValidE164(phoneNumber)) {
    return NextResponse.json(
      { error: "Telefonní číslo musí být ve formátu E.164, např. +420123456789." },
      { status: 400 }
    )
  }

  if (!email) {
    return NextResponse.json({ error: "E‑mail je povinný." }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: "Heslo je povinné." }, { status: 400 })
  }

  const supabaseAdmin = createClient(url, service)

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone_number", phoneNumber)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message || "Chyba při kontrole telefonního čísla." },
      { status: 500 }
    )
  }

  if (existing?.id && existing.id !== user.id) {
    return NextResponse.json(
      { error: "Toto telefonní číslo už je použito u jiného účtu." },
      { status: 409 }
    )
  }

  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    { email, password, email_confirm: true } as any
  )

  if (authUpdateError) {
    const msg = (authUpdateError.message || "").toLowerCase()
    if (msg.includes("already") || msg.includes("registered")) {
      return NextResponse.json({ error: "Tento e‑mail už je použit u jiného účtu." }, { status: 409 })
    }
    return NextResponse.json(
      { error: authUpdateError.message || "Nepodařilo se uložit e‑mail / heslo." },
      { status: 400 }
    )
  }

  const patch: Record<string, any> = { phone_number: phoneNumber, email }

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update(patch)
    .eq("id", user.id)

  if (updateError) {
    const code = String((updateError as any)?.code || "")
    if (code === "23505") {
      return NextResponse.json(
        { error: "Toto telefonní číslo už je použito u jiného účtu." },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: updateError.message || "Nepodařilo se uložit telefonní číslo." },
      { status: 500 }
    )
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single()

  const current = Number(profile?.credits || 0)
  if (current < 72) {
    const delta = 72 - current
    await supabaseAdmin
      .from("profiles")
      .update({ credits: 72 })
      .eq("id", user.id)
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: user.id,
      type: "signup_bonus",
      amount: delta,
      note: "Signup bonus",
      balance_after: 72
    })
  }

  return NextResponse.json({ ok: true })
}
