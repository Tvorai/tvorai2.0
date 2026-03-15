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
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string

  if (!url || !service) {
    return NextResponse.json({ error: "Chybí konfigurace serveru." }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const phoneNumber = normalizePhone(String(body?.phoneNumber || ""))

  if (!phoneNumber) {
    return NextResponse.json({ error: "Telefonní číslo je povinné." }, { status: 400 })
  }
  if (!isValidE164(phoneNumber)) {
    return NextResponse.json(
      { error: "Telefonní číslo musí být ve formátu E.164, např. +420123456789." },
      { status: 400 }
    )
  }

  const supabaseAdmin = createClient(url, service)

  const { data: existing, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone_number", phoneNumber)
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: error.message || "Chyba při kontrole telefonního čísla." },
      { status: 500 }
    )
  }

  return NextResponse.json({ exists: Boolean(existing?.id) })
}

