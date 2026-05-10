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
 *   GET   /api/consumer/diet-plans               → getMyDietPlans
 *   GET   /api/consumer/workout-plans            → getMyWorkoutPlans
 *   GET   /api/consumer/my-workout               → getMyWorkout
 *   GET   /api/consumer/me                       → getMyProfile
 *   GET   /api/consumer/progress-history         → getProgressHistory
 *   POST  /api/consumer/log-progress             → logProgress
 *   PATCH /api/consumer/profile                  → updateProfile
 *   PUT   /api/consumer/onboarding               → completeOnboarding
 *   PUT   /api/consumer/link-professional        → linkProfessional
 *   PUT   /api/consumer/disconnect-professional  → disconnectProfessional
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
  getMyWorkout,
  updateProfile,
  completeOnboarding,
  linkProfessional,
  disconnectProfessional,
  getMyProfile,
  logProgress,
  getProgressHistory,
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
// MY WORKOUT (single most recent assigned plan — for MyWorkout.jsx tab)
// GET /api/consumer/my-workout
// Returns the most recently assigned WorkoutPlan for this consumer.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/my-workout", verifyToken, isConsumer, getMyWorkout);

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

// ─────────────────────────────────────────────────────────────────────────────
// LINK PROFESSIONAL
// PUT /api/consumer/link-professional
// Saves a Dietician's or Instructor's ObjectId into the consumer's document.
// Body: { professionalId: string, professionalRole: "Dietician"|"Instructor" }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/link-professional", verifyToken, isConsumer, linkProfessional);

// ─────────────────────────────────────────────────────────────────────────────
// DISCONNECT PROFESSIONAL
// PUT /api/consumer/disconnect-professional
// Nullifies the consumer's dieticianId or instructorId (sets field to null).
// Body: { professionalRole: "Dietician"|"Instructor" }
// ─────────────────────────────────────────────────────────────────────────────
router.put("/disconnect-professional", verifyToken, isConsumer, disconnectProfessional);

// ─────────────────────────────────────────────────────────────────────────────
// MY PROFILE (fresh consumer document — used for state persistence)
// GET /api/consumer/me
// Returns the logged-in consumer's up-to-date document from MongoDB.
// The frontend calls this after every link/disconnect to re-sync state.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/me", verifyToken, isConsumer, getMyProfile);

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS HISTORY
// GET /api/consumer/progress-history
// Returns all DailyLog entries (weight field only) for this consumer,
// sorted oldest → newest — ready for chronological chart rendering.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/progress-history", verifyToken, isConsumer, getProgressHistory);

// ─────────────────────────────────────────────────────────────────────────────
// LOG PROGRESS
// POST /api/consumer/log-progress
// Upserts a weight entry for today's DailyLog document.
// Body: { weight: number }
// If a log already exists for today, it is updated; otherwise, a new one is created.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/log-progress", verifyToken, isConsumer, logProgress);

module.exports = router;
