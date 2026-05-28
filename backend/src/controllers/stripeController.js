/**
 * @file controllers/stripeController.js
 * @description Stripe payment integration for NutriFit AI Premium tier.
 *
 * Exposes two controller functions:
 *
 *   createCheckoutSession  — Creates a Stripe-hosted Checkout page for the
 *                            "NutriFit Premium" product and returns the URL.
 *
 *   handleWebhook          — Receives & cryptographically verifies Stripe
 *                            webhook events. On checkout.session.completed,
 *                            sets isPremium: true on the matching User document.
 *
 * IMPORTANT: The webhook route MUST be mounted BEFORE express.json() so that
 * the raw request body is preserved for stripe.webhooks.constructEvent().
 * See index.js for the correct mount order.
 */

const Stripe = require("stripe");
const User   = require("../models/User");

// ---------------------------------------------------------------------------
// Stripe client — initialised once at module load.
// STRIPE_SECRET_KEY must be set in backend/.env
// ---------------------------------------------------------------------------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// ---------------------------------------------------------------------------
// POST /api/stripe/create-checkout-session
// ---------------------------------------------------------------------------

/**
 * createCheckoutSession
 *
 * Body:  { consumerId: string }
 * Returns: { url: string }  — Redirect the browser to this Stripe-hosted URL.
 *
 * The consumerId is embedded in the Stripe session metadata so the webhook
 * can look up the correct User document without trusting any client-side data.
 */
const createCheckoutSession = async (req, res) => {
  try {
    const { consumerId } = req.body;

    if (!consumerId) {
      return res.status(400).json({ error: "consumerId is required." });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode:                 "payment",          // one-time payment (sandbox test)
      line_items: [
        {
          price_data: {
            currency:    "usd",
            unit_amount: 999,                   // $9.99 in cents
            product_data: {
              name:        "NutriFit Premium",
              description: "Unlock full access to the Professional Hub, PDF diet plan downloads, and priority support.",
              images: [
                // A hosted placeholder image — safe for sandbox testing
                "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80",
              ],
            },
          },
          quantity: 1,
        },
      ],
      // consumerId stored securely in metadata — never in the URL or client side
      metadata: {
        consumerId,
      },
      // After successful payment Stripe redirects to the dashboard with a flag
      success_url: "http://localhost:5173/consumer?upgrade=success",
      // If the user cancels they land back on the dashboard cleanly
      cancel_url:  "http://localhost:5173/consumer",
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("❌ Stripe createCheckoutSession error:", error.message);
    return res.status(500).json({ error: "Failed to create Stripe checkout session." });
  }
};

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
// ---------------------------------------------------------------------------

/**
 * handleWebhook
 *
 * Stripe sends a POST to this endpoint when payment events occur.
 * The signature in the `stripe-signature` header is verified against
 * STRIPE_WEBHOOK_SECRET (obtained from `stripe listen` during development).
 *
 * On checkout.session.completed:
 *   1. Extract consumerId from session.metadata
 *   2. Update User.isPremium = true in MongoDB
 *
 * CRITICAL: This route must receive the RAW (unparsed) request body.
 *           Use express.raw({ type: 'application/json' }) on this route only.
 *           Do NOT apply express.json() globally before this route.
 */
const handleWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    console.warn("⚠️  Webhook received without stripe-signature header.");
    return res.status(400).json({ error: "Missing stripe-signature header." });
  }

  let event;

  try {
    // constructEvent requires the raw Buffer body — express.raw() provides it
    event = stripe.webhooks.constructEvent(
      req.body,                              // raw Buffer from express.raw()
      signature,
      process.env.STRIPE_WEBHOOK_SECRET      // from `stripe listen --forward-to ...`
    );
  } catch (err) {
    // Signature mismatch — reject immediately to prevent spoofing
    console.error("❌ Stripe webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  // ── Handle specific event types ──────────────────────────────────────────
  switch (event.type) {
    case "checkout.session.completed": {
      const session    = event.data.object;
      const consumerId = session.metadata?.consumerId;

      if (!consumerId) {
        console.warn("⚠️  checkout.session.completed received with no consumerId in metadata.");
        break;
      }

      try {
        const updatedUser = await User.findByIdAndUpdate(
          consumerId,
          {
            $set: {
              isPremium:          true,
              // Set a 1-year expiry from now; adjust as needed for your billing model
              subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          },
          { new: true, select: "full_name email isPremium" }
        );

        if (!updatedUser) {
          console.warn(`⚠️  No user found for consumerId: ${consumerId}`);
        } else {
          console.log(`✅ isPremium set to true for user: ${updatedUser.email}`);
        }
      } catch (dbErr) {
        console.error("❌ Failed to update isPremium in database:", dbErr.message);
        // Return 500 so Stripe retries the webhook delivery
        return res.status(500).json({ error: "Database update failed." });
      }
      break;
    }

    default:
      // Log unhandled events for debugging; do not error
      console.log(`ℹ️  Unhandled Stripe event type: ${event.type}`);
  }

  // Always respond 200 to acknowledge receipt to Stripe
  return res.status(200).json({ received: true });
};

module.exports = { createCheckoutSession, handleWebhook };
