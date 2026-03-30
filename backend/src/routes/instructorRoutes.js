/**
 * @file instructorRoutes.js
 * @description Express Router for all instructor-protected API endpoints.
 *
 * Security Architecture (Double Middleware Guard):
 * ─────────────────────────────────────────────────
 * Every route in this file is protected by TWO middleware functions in sequence.
 * A request must pass BOTH checks to ever reach a route handler:
 *
 *   1. verifyToken   — Reads the HTTP-only cookie, verifies the JWT signature,
 *      and attaches the decoded `userId` to `req`. Handles AUTHENTICATION.
 *
 *   2. isInstructor  — Queries MongoDB to confirm the resolved user has the
 *      role "Instructor". Handles AUTHORIZATION.
 *
 * This deliberate separation follows the Single Responsibility Principle:
 * each middleware does exactly one thing and is independently reusable.
 *
 * Mounted at: /api/instructor  (registered in backend/index.js)
 *
 * Full Route Map:
 *   GET  /api/instructor/clients  → getClients      (list all Consumers)
 *   GET  /api/instructor/plans    → getWorkoutPlans (plans by this instructor)
 *   POST /api/instructor/plans    → createWorkoutPlan (create a new plan)
 */

const express = require("express");
const router  = express.Router();

// ── Middleware ──────────────────────────────────────────────────────────────
const verifyToken  = require("../middleware/verifyToken");
const isInstructor = require("../middleware/isInstructor");

// ── Controller ──────────────────────────────────────────────────────────────
const {
  getClients,
  createWorkoutPlan,
  getWorkoutPlans,
} = require("../controllers/instructorController");

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT ROUTE
// GET /api/instructor/clients
// Returns all Consumer-role users the instructor can assign plans to.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/clients", verifyToken, isInstructor, getClients);

// ─────────────────────────────────────────────────────────────────────────────
// WORKOUT PLAN ROUTES
// GET  /api/instructor/plans → All plans created by the logged-in instructor
// POST /api/instructor/plans → Create a new workout plan for a specific consumer
// ─────────────────────────────────────────────────────────────────────────────
router.get("/plans",  verifyToken, isInstructor, getWorkoutPlans);
router.post("/plans", verifyToken, isInstructor, createWorkoutPlan);

module.exports = router;
