/**
 * @file adminRoutes.js
 * @description Express Router for all admin-protected API endpoints.
 *
 * Security Architecture (Double Middleware Guard):
 * ─────────────────────────────────────────────────
 * Every route in this file is protected by TWO middleware functions applied
 * in sequence. A request must pass BOTH checks to reach any route handler:
 *
 *   1. verifyToken — Checks that a valid, unexpired JWT exists in the
 *      HTTP-only cookie. Confirms the request is from a *logged-in* user.
 *
 *   2. isAdmin    — Queries the database to confirm the logged-in user's
 *      role is "Admin". Confirms the user has *admin privileges*.
 *
 * This two-layer approach is intentional: verifyToken handles authentication,
 * isAdmin handles authorization. They are deliberately kept separate for
 * clarity, reusability, and the Single Responsibility Principle.
 *
 * Mounted at: /api/admin  (configured in backend/index.js)
 *
 * Full Route Map:
 *   GET    /api/admin/stats       → getSystemStats
 *   GET    /api/admin/users       → getAllUsers
 *   DELETE /api/admin/users/:id   → deleteUser
 */

const express = require("express");
const router = express.Router();

// --- Middleware Imports ---
const verifyToken = require("../middleware/verifyToken");
const isAdmin = require("../middleware/isAdmin");

// --- Controller Imports ---
const {
  getAllUsers,
  getSystemStats,
  deleteUser,
} = require("../controllers/adminController");

// ─────────────────────────────────────────────────────────────────────────────
// STATS ROUTE
// GET /api/admin/stats
// Returns aggregated platform statistics for the overview dashboard cards.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats", verifyToken, isAdmin, getSystemStats);

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT ROUTES
// GET    /api/admin/users      → Fetch all users (no passwords)
// DELETE /api/admin/users/:id  → Remove a specific user by ID
// ─────────────────────────────────────────────────────────────────────────────
router.get("/users", verifyToken, isAdmin, getAllUsers);
router.delete("/users/:id", verifyToken, isAdmin, deleteUser);

module.exports = router;
