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

async function markStripeEventStarted(event: Stripe.Event) {
  const insertRes = await supabase.from("stripe_events").insert({
    event_id: event.id,
    processed_at: null,
    payload: event as any,
  })

  if (!insertRes.error) {
    return { alreadyProcessed: false }
  }

  const code = (insertRes.error as any)?.code
  if (code !== "23505") {
    console.error("Failed to record stripe event:", insertRes.error)
    return { alreadyProcessed: false }
  }

  const { data: existing } = await supabase
    .from("stripe_events")
    .select("processed_at")
    .eq("event_id", event.id)
    .maybeSingle()

  if (existing?.processed_at) {
    return { alreadyProcessed: true }
  }

  return { alreadyProcessed: false }
}

async function markStripeEventProcessed(eventId: string) {
  await supabase
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", eventId)
}

async function upsertSubscriptionRow(args: {
  userId: string
  customerId: string
  subscriptionId: string
  status: string
  currentPeriodEndIso: string | null
}) {
  const { data: existing, error: findError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) {
    throw new Error(`Failed to lookup subscription: ${findError.message}`)
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        stripe_customer_id: args.customerId,
        stripe_subscription_id: args.subscriptionId,
        status: args.status,
        current_period_end: args.currentPeriodEndIso,
      })
      .eq("id", existing.id)

    if (updateError) {
      throw new Error(`Failed to update subscription: ${updateError.message}`)
    }
    return
  }

  const { error: insertError } = await supabase.from("subscriptions").insert({
    user_id: args.userId,
    stripe_customer_id: args.customerId,
    stripe_subscription_id: args.subscriptionId,
    status: args.status,
    current_period_end: args.currentPeriodEndIso,
  })

  if (insertError) {
    throw new Error(`Failed to insert subscription: ${insertError.message}`)
  }
}

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
    const { alreadyProcessed } = await markStripeEventStarted(event)
    if (alreadyProcessed) {
      return new NextResponse("Already processed", { status: 200 })
    }

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
        } else {
          const email =
            (session.customer_details as any)?.email ||
            session.customer_email ||
            null

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("credits, email")
            .eq("id", userId)
            .maybeSingle()

          if (profileError) {
            console.error("Error fetching profile:", profileError)
          }

          if (!profile) {
            const { error: createProfileError } = await supabase.from("profiles").insert({
              id: userId,
              email,
            })

            if (createProfileError) {
              console.error("Error creating profile:", createProfileError)
            }
          } else if (!profile.email && email) {
            await supabase.from("profiles").update({ email }).eq("id", userId)
          }

          const currentCredits = (profile as any)?.credits || 0
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
          }

          // 2. Insert or Update subscription record
          if (!customerId || !subscriptionId) {
               console.error("Missing customerId or subscriptionId in session", { customerId, subscriptionId })
          } else {
              await upsertSubscriptionRow({
                userId,
                customerId,
                subscriptionId,
                status: "active",
                currentPeriodEndIso: null,
              })
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
        }
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
          await markStripeEventProcessed(event.id)
          return new NextResponse("Skipped subscription_create", { status: 200 })
      }

      // Find user by stripe_customer_id
      const { data: profile, error: profileLookupError } = await supabase
        .from("profiles")
        .select("id, credits")
        .eq("stripe_customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (profileLookupError) {
        console.error("Error looking up profile by stripe_customer_id:", profileLookupError)
      }

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
                const subObj = subscription as any;
                await upsertSubscriptionRow({
                  userId: profile.id,
                  customerId,
                  subscriptionId,
                  status: subObj.status,
                  currentPeriodEndIso: subObj.current_period_end
                    ? new Date(subObj.current_period_end * 1000).toISOString()
                    : null,
                })

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
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      
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

    await markStripeEventProcessed(event.id)
    return new NextResponse("Webhook received", { status: 200 })
  } catch (err) {
    console.error("Webhook processing failed:", err)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
