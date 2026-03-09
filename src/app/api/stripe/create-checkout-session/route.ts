import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-02-25.clover" as any,
})

// Mapping of plan keys to Stripe Price IDs
// These environment variables must be set in .env
const PLANS: Record<string, string | undefined> = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  studio_monthly: process.env.STRIPE_PRICE_STUDIO_MONTHLY,
  starter_yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  studio_yearly: process.env.STRIPE_PRICE_STUDIO_YEARLY,
}

export async function POST(req: Request) {
  try {
    // 1. Verify user session via Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!,
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const userId = user.id
    const email = user.email

    if (!userId || !email) {
      return NextResponse.json(
        { error: "User data incomplete" },
        { status: 400 }
      )
    }

    // 2. Parse request body to get the plan
    const body = await req.json().catch(() => ({}))
    const planKey = body.plan || "starter_monthly" // Default to starter_monthly if not provided
    
    // 3. Get Price ID
    // Fallback to STRIPE_BASIC_PRICE_ID if specific plan price is not found (backward compatibility or default)
    const priceId = PLANS[planKey] || process.env.STRIPE_BASIC_PRICE_ID

    if (!priceId) {
      return NextResponse.json(
        { error: "Price ID not found for plan: " + planKey },
        { status: 400 }
      )
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/ucet?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cenik`,
      metadata: {
        user_id: userId,
        plan: planKey,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("Stripe checkout session error:", error)
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    )
  }
}
