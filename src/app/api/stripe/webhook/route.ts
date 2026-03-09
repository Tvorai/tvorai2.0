import Stripe from "stripe"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16" as any,
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
      const plan = session.metadata?.plan
      const credits = session.metadata?.credits
      
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      if (userId) {
        // Update profile with new plan and customer ID
        // Note: Credits will be added via invoice.paid event usually, 
        // but for the first payment, checkout.session.completed also fires.
        // However, invoice.paid is safer for recurring renewals.
        // Let's rely on invoice.paid for credits to avoid double counting, 
        // OR check if this is the first payment. 
        // A simpler approach for now is to set the plan here, 
        // and let invoice.paid handle the credits allocation.
        
        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            plan: plan || "basic", // Fallback only if metadata missing
          })
          .eq("id", userId)

        await supabase.from("subscriptions").insert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          // We can try to get the price ID from the session line items if needed,
          // or just store what we have. 
          // Ideally we should store the actual price ID from the session.
          // For now, let's leave stripe_price_id empty or try to get it if possible,
          // but the previous code used a hardcoded env var which was wrong for multi-plan.
          // Let's try to set status at least.
          status: "active",
          current_period_end: null,
        })
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      // Invoice.subscription can be string or Subscription object or null
      // Use 'as any' to bypass strict typing if the type definition is outdated or strict
      const subscriptionId = (invoice as any).subscription as string | null

      // Find user by stripe_customer_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, credits")
        .eq("stripe_customer_id", customerId)
        .single()

      if (profile && subscriptionId) {
        // Fetch subscription to get metadata (plan & credits)
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        
        const plan = subscription.metadata?.plan
        const creditsStr = subscription.metadata?.credits
        
        if (plan && creditsStr) {
            const newCredits = parseInt(creditsStr, 10)
            
            if (!isNaN(newCredits)) {
                await supabase
                  .from("profiles")
                  .update({
                    credits: (profile.credits || 0) + newCredits,
                    plan: plan,
                  })
                  .eq("id", profile.id)
        
                await supabase.from("credit_transactions").insert({
                  user_id: profile.id,
                  type: "subscription_renewal",
                  amount: newCredits,
                  note: `${plan} subscription renewal`,
                  balance_after: (profile.credits || 0) + newCredits,
                })
                
                console.log(`Added ${newCredits} credits to user ${profile.id} for plan ${plan}`)
            } else {
                console.error("Invalid credits value in metadata:", creditsStr)
            }
        } else {
            console.error("Missing plan or credits in subscription metadata", { subscriptionId })
            // Fallback logic could go here if needed, but we want to avoid hardcoding "basic"
        }
      } else {
          console.error("Profile not found for customer:", customerId)
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
            .update({ plan: "free" }) // or whatever the default/expired state is
            .eq("id", profile.id)
            
          await supabase
            .from("subscriptions")
            .update({ status: "canceled" })
            .eq("stripe_subscription_id", subscription.id)
      }
    }

    return new NextResponse("Webhook received", { status: 200 })
  } catch (err) {
    console.error("Webhook processing failed:", err)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
