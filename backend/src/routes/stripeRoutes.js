/**
 * @file routes/stripeRoutes.js
 * @description Express router for Stripe payment endpoints.
 *
 * Route layout:
 *
 *   POST /api/stripe/create-checkout-session
 *     → Creates a Stripe Checkout session and returns { url }.
 *     → Protected by verifyToken so only authenticated consumers can pay.
 *
 *   POST /api/stripe/webhook
 *     → Receives Stripe webhook events (checkout.session.completed, etc.).
 *     → MUST use express.raw() middleware — NOT express.json() — so that
 *       the raw body is preserved for signature verification.
 *     → NOT protected by verifyToken (Stripe sends unauthenticated requests).
 *
 * CRITICAL MOUNT ORDER IN index.js:
 *   The webhook route must be registered BEFORE the global express.json()
 *   middleware. This router handles that internally via express.raw().
 */

const express    = require("express");
const router     = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
  createCheckoutSession,
  handleWebhook,
  confirmCheckout,
} = require("../controllers/stripeController");

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
//
// Uses express.raw() scoped to THIS route only so the raw Buffer body is
// preserved for stripe.webhooks.constructEvent(). This must come before any
// route or middleware that calls express.json() on the request body.
// ---------------------------------------------------------------------------
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

// ---------------------------------------------------------------------------
// POST /api/stripe/create-checkout-session
//
// Requires a valid JWT cookie (verifyToken). The consumerId in req.body is
// used only as a cross-reference; the authoritative consumer ID for metadata
// is taken from req.body.consumerId which is then stored in Stripe metadata.
//
// express.json() is applied here explicitly because the Stripe router is
// mounted BEFORE the global express.json() middleware in index.js (which is
// required to keep the webhook raw body intact). Without this, req.body
// would be undefined and consumerId destructuring would throw.
// ---------------------------------------------------------------------------
router.post("/create-checkout-session", express.json(), verifyToken, createCheckoutSession);

router.post("/confirm-checkout", express.json(), verifyToken, confirmCheckout);

module.exports = router;
