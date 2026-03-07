import Stripe from "stripe"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

export async function POST(req: Request) {
  const body = await req.text()
  const signature = (await headers()).get("stripe-signature")

  if (!signature) {
    return new NextResponse("Missing stripe signature", { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return new NextResponse("Invalid signature", { status: 400 })
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      const userId = session.metadata?.user_id
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      if (userId) {
        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            plan: "basic",
          })
          .eq("id", userId)

        await supabase.from("subscriptions").insert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: process.env.STRIPE_BASIC_PRICE_ID,
          status: "active",
          current_period_end: null,
        })
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, credits")
        .eq("stripe_customer_id", customerId)
        .single()

      if (profile) {
        const newCredits = 100

        await supabase
          .from("profiles")
          .update({
            credits: newCredits,
            plan: "basic",
          })
          .eq("id", profile.id)

        await supabase.from("credit_transactions").insert({
          user_id: profile.id,
          type: "subscription_renewal",
          amount: 100,
          note: "Basic monthly subscription credits",
          balance_after: newCredits,
        })
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single()

      if (profile) {
        await supabase
          .from("profiles")
          .update({ plan: "free" })
          .eq("id", profile.id)

        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_customer_id", customerId)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook handler error:", error)
    return new NextResponse("Webhook error", { status: 500 })
  }
}
