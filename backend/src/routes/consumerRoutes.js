/**
 * @file consumerRoutes.js
 * @description Express Router for all consumer-protected API endpoints.
 *
 * Security Architecture (Double Middleware Guard):
 * ─────────────────────────────────────────────────
 * Every route in this file is protected by TWO middleware functions in sequence.
 * A request must pass BOTH checks to reach any route handler:
 *
 *   1. verifyToken  — Reads the HTTP-only cookie, verifies the JWT signature,
 *      and attaches the decoded `userId` to `req`. Handles AUTHENTICATION.
 *
 *   2. isConsumer   — Queries MongoDB to confirm the resolved user has the
 *      role "Consumer". Handles AUTHORIZATION.
 *
 * Mounted at: /api/consumer  (registered in backend/index.js)
 *
 * Full Route Map:
 *   GET   /api/consumer/diet-plans     → getMyDietPlans
 *   GET   /api/consumer/workout-plans  → getMyWorkoutPlans
 *   PATCH /api/consumer/profile        → updateProfile
 *   PUT   /api/consumer/onboarding     → completeOnboarding
 */

const express = require("express");
const router  = express.Router();

// ── Middleware ──────────────────────────────────────────────────────────────
const verifyToken = require("../middleware/verifyToken");
const isConsumer  = require("../middleware/isConsumer");

// ── Controller ──────────────────────────────────────────────────────────────
const {
  getMyDietPlans,
  getMyWorkoutPlans,
  updateProfile,
  completeOnboarding,
} = require("../controllers/consumerController");

// ─────────────────────────────────────────────────────────────────────────────
// DIET PLANS
// GET /api/consumer/diet-plans
// Returns all DietPlan documents assigned to the logged-in consumer.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/diet-plans", verifyToken, isConsumer, getMyDietPlans);

// ─────────────────────────────────────────────────────────────────────────────
// WORKOUT PLANS
// GET /api/consumer/workout-plans
// Returns all WorkoutPlan documents assigned to the logged-in consumer.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/workout-plans", verifyToken, isConsumer, getMyWorkoutPlans);

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE UPDATE
// PATCH /api/consumer/profile
// Allows the consumer to update their health metrics (weight, height, goal).
// Uses PATCH (not PUT) because only a subset of fields is being modified.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/profile", verifyToken, isConsumer, updateProfile);

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING
// PUT /api/consumer/onboarding
// Saves the consumer's first-time health profile (age, weight, height,
// primary_goal, dietary_preferences). Called once from ConsumerOnboarding.jsx.
// Uses PUT (not PATCH) because the intent is a full replacement of the
// onboarding fields, not a partial update.
// ─────────────────────────────────────────────────────────────────────────────
router.put("/onboarding", verifyToken, isConsumer, completeOnboarding);

module.exports = router;
