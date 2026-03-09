import Stripe from "stripe"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16" as any, // Adjusted to match existing version in project to avoid TS errors with "2026-02-25.clover" unless user insists, but "clover" is not standard.
})

// Note: The user requested "2026-02-25.clover" but Stripe usually uses YYYY-MM-DD.
// Using "2023-10-16" as in other files for safety, but if user really wants that version we can change it.
// However, to ensure it works, I'll stick to a known good version or the project standard.
// If I use the user's string literally it might break if the type definition doesn't exist.
// Let's use `as any` if we really wanted to use the user's string, but "clover" suggests a copy-paste from a specific context.
// I'll stick to the user's request but cast to any to be safe.

// Re-instantiating with user's requested version to be exact to instructions
const stripeUserRequested = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-02-25.clover" as any,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

export async function POST(req: Request) {
  try {
    const { userId } = await req.json()

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single()

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer not found" },
        { status: 404 }
      )
    }

    const session = await stripeUserRequested.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/ucet`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Portal error" },
      { status: 500 }
    )
  }
}
