import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16" as any,
})

// Configuration for all plans
const PLAN_CONFIG: Record<string, { priceId: string | undefined; credits: number }> = {
  starter_monthly: {
    priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    credits: 1500,
  },
  pro_monthly: {
    priceId: process.env.STRIPE_PRICE_PRO_MONTHLY,
    credits: 3600,
  },
  studio_monthly: {
    priceId: process.env.STRIPE_PRICE_STUDIO_MONTHLY,
    credits: 8000,
  },
  starter_yearly: {
    priceId: process.env.STRIPE_PRICE_STARTER_YEARLY,
    credits: 18000,
  },
  pro_yearly: {
    priceId: process.env.STRIPE_PRICE_PRO_YEARLY,
    credits: 43200,
  },
  studio_yearly: {
    priceId: process.env.STRIPE_PRICE_STUDIO_YEARLY,
    credits: 96000,
  },
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
    const planKey = body.plan

    if (!planKey || !PLAN_CONFIG[planKey]) {
        console.error(`Invalid plan requested: ${planKey}`)
        return NextResponse.json(
            { error: "Invalid plan" },
            { status: 400 }
        )
    }
    
    // 3. Get Price ID and Credit amount from configuration
    const selectedPlan = PLAN_CONFIG[planKey]
    const priceId = selectedPlan.priceId
    const credits = selectedPlan.credits

    console.log(`Creating checkout session for user ${userId}, plan: ${planKey}, priceId: ${priceId}, credits: ${credits}`)

    if (!priceId) {
      console.error(`Price ID not configured for plan: ${planKey}`)
      return NextResponse.json(
        { error: "Configuration error: Price ID missing for plan " + planKey },
        { status: 500 }
      )
    }

    // 4. Create Checkout Session
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
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dobit-kredity`,
      // Metadata on the session itself (useful for checkout.session.completed)
      metadata: {
        user_id: userId,
        plan: planKey,
        credits: credits.toString(),
      },
      // Metadata on the subscription object (useful for invoice.paid events later)
      subscription_data: {
        metadata: {
          user_id: userId,
          plan: planKey,
          credits: credits.toString(),
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("Stripe checkout session error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checkout session" },
      { status: 500 }
    )
  }
}
