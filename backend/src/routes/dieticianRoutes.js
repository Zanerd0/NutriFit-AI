/**
 * @file dieticianRoutes.js
 * @description Express Router for all dietician-protected API endpoints.
 *
 * Security Architecture (Double Middleware Guard):
 * ─────────────────────────────────────────────────
 * Every route in this file is protected by TWO middleware functions in sequence.
 * A request must pass BOTH checks to ever reach a route handler:
 *
 *   1. verifyToken  — Reads the HTTP-only cookie, verifies the JWT signature,
 *      and attaches the decoded `userId` to `req`. Handles AUTHENTICATION.
 *
 *   2. isDietician  — Queries MongoDB to confirm the resolved user actually has
 *      the role "Dietician". Handles AUTHORIZATION.
 *
 * This deliberate two-layer separation follows the Single Responsibility
 * Principle: each middleware does exactly one thing and is reusable on its own.
 *
 * Mounted at: /api/dietician  (registered in backend/index.js)
 *
 * Full Route Map:
 *   GET  /api/dietician/clients  → getClients     (list all Consumers)
 *   GET  /api/dietician/plans    → getDietPlans   (plans by this dietician)
 *   POST /api/dietician/plans    → createDietPlan (create a new plan)
 */

const express = require("express");
const router  = express.Router();

// ── Middleware ──────────────────────────────────────────────────────────────
const verifyToken  = require("../middleware/verifyToken");
const isDietician  = require("../middleware/isDietician");

// ── Controller ──────────────────────────────────────────────────────────────
const {
  getClients,
  createDietPlan,
  getDietPlans,
} = require("../controllers/dieticianController");

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT ROUTE
// GET /api/dietician/clients
// Returns a list of all Consumer-role users the dietician can assign plans to.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/clients", verifyToken, isDietician, getClients);

// ─────────────────────────────────────────────────────────────────────────────
// DIET PLAN ROUTES
// GET  /api/dietician/plans → Fetch all plans created by the logged-in dietician
// POST /api/dietician/plans → Create a new diet plan for a specific consumer
// ─────────────────────────────────────────────────────────────────────────────
router.get("/plans",  verifyToken, isDietician, getDietPlans);
router.post("/plans", verifyToken, isDietician, createDietPlan);

module.exports = router;
