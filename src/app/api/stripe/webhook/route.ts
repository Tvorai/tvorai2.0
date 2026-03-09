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
    // Handle initial subscription setup
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      const userId = session.metadata?.user_id
      const plan = session.metadata?.plan
      const creditsStr = session.metadata?.credits
      
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      console.log(`Processing checkout.session.completed for user ${userId}, plan ${plan}`)

      if (userId && plan && creditsStr) {
        const credits = parseInt(creditsStr, 10)
        
        if (isNaN(credits)) {
            console.error("Invalid credits in metadata:", creditsStr)
            return new NextResponse("Invalid credits metadata", { status: 400 })
        }

        // 1. Update profile with new plan, customer ID, and ADD credits
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", userId)
          .single()
          
        if (profileError) {
            console.error("Error fetching profile:", profileError)
        }

        const currentCredits = profile?.credits || 0
        const newBalance = currentCredits + credits

        const { error: updateProfileError } = await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            plan: plan,
            credits: newBalance,
          })
          .eq("id", userId)
        
        if (updateProfileError) {
          console.error("Error updating profile:", updateProfileError)
          // Don't return, try to proceed to create subscription if possible
        }

        // 2. Insert or Update subscription record
        // Ensure customerId and subscriptionId are present (they should be for subscription mode)
        if (!customerId || !subscriptionId) {
             console.error("Missing customerId or subscriptionId in session", { customerId, subscriptionId })
        } else {
            const { error: subError } = await supabase.from("subscriptions").upsert({
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              status: "active",
              current_period_end: null, // Can be updated via invoice.payment_succeeded or retrieved
            }, { onConflict: 'user_id' })
            
            if (subError) {
                console.error("Error creating/updating subscription:", subError)
                // Log but don't fail the webhook completely so we don't retry endlessly if it's a data issue?
                // Actually, if we fail here, we WANT retry.
                throw new Error(`Failed to insert subscription: ${subError.message}`)
            }
        }

        // 3. Log transaction
        const { error: transError } = await supabase.from("credit_transactions").insert({
            user_id: userId,
            type: "subscription_purchase",
            amount: credits,
            note: `${plan} subscription purchase`,
            balance_after: newBalance,
        })
        
        if (transError) {
             console.error("Error logging credit transaction:", transError)
        }
        
        console.log(`Successfully provisioned subscription for user ${userId}: ${plan}, +${credits} credits`)
      } else {
          console.error("Missing metadata in checkout session:", session.metadata)
      }
    }

    // Handle recurring payments (renewals)
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      // Invoice.subscription can be string or Subscription object or null
      const subscriptionId = (invoice as any).subscription as string | null
      const billingReason = invoice.billing_reason

      console.log(`Processing invoice.paid for customer ${customerId}. Reason: ${billingReason}`)

      // Skip if this is the initial subscription creation (handled by checkout.session.completed)
      // to avoid double crediting.
      if (billingReason === 'subscription_create') {
          console.log("Skipping invoice.paid for subscription_create (handled by checkout session)")
          return new NextResponse("Skipped subscription_create", { status: 200 })
      }

      // Find user by stripe_customer_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, credits")
        .eq("stripe_customer_id", customerId)
        .single()

      if (profile && subscriptionId) {
        // Fetch subscription to get metadata (plan & credits)
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription
        
        const plan = subscription.metadata?.plan
        const creditsStr = subscription.metadata?.credits
        
        if (plan && creditsStr) {
            const newCredits = parseInt(creditsStr, 10)
            
            if (!isNaN(newCredits)) {
                const newBalance = (profile.credits || 0) + newCredits

                await supabase
                  .from("profiles")
                  .update({
                    credits: newBalance,
                    plan: plan, 
                  })
                  .eq("id", profile.id)
        
                await supabase.from("credit_transactions").insert({
                  user_id: profile.id,
                  type: "subscription_renewal",
                  amount: newCredits,
                  note: `${plan} subscription renewal`,
                  balance_after: newBalance,
                })
                
                // Also update subscription status/period in DB
                const { error: subError } = await supabase.from("subscriptions").upsert({
                    user_id: profile.id,
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                    status: subscription.status,
                    current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
                }, { onConflict: 'user_id' })

                if (subError) {
                    console.error("Error updating subscription:", subError)
                }

                console.log(`Added ${newCredits} credits to user ${profile.id} for renewal of ${plan}`)
            } else {
                console.error("Invalid credits value in subscription metadata:", creditsStr)
            }
        } else {
            console.error("Missing plan or credits in subscription metadata", { subscriptionId })
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
          // Ideally we should revert to 'free' or null
          await supabase
            .from("profiles")
            .update({ plan: "free" }) 
            .eq("id", profile.id)
            
          await supabase
            .from("subscriptions")
            .update({ status: "canceled" })
            .eq("stripe_subscription_id", subscription.id)
            
          console.log(`Subscription deleted for user ${profile.id}`)
      }
    }

    return new NextResponse("Webhook received", { status: 200 })
  } catch (err) {
    console.error("Webhook processing failed:", err)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
