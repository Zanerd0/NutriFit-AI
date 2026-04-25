/**
 * @file professionalRoutes.js
 * @description Express Router for the publicly accessible professionals directory
 * AND for the shared, role-protected professional endpoints.
 *
 * Security Note:
 * ─────────────
 * GET /  (professionals directory) is protected by verifyToken ONLY — any
 * authenticated user can browse the list so Consumers can find professionals.
 *
 * GET /clients is protected by verifyToken + isProfessional, ensuring only
 * Dieticians and Instructors can access their own client lists.
 *
 * Mounted at:
 *   /api/professionals → this router (public directory)
 *   /api/professional  → this router (professional-only endpoints)
 *
 * Full Route Map:
 *   GET /api/professionals         → getProfessionals  (public directory)
 *   GET /api/professional/clients  → getMyClients      (linked clients + compliance)
 */

const express = require("express");
const router  = express.Router();

// ── Middleware ──────────────────────────────────────────────────────────────
// verifyToken ensures the caller is authenticated; no role restriction here.
const verifyToken    = require("../middleware/verifyToken");
// isProfessional restricts the /clients endpoint to Dietician or Instructor only.
const isProfessional = require("../middleware/isProfessional");

// ── Controller ──────────────────────────────────────────────────────────────
const {
  getProfessionals,
  getMyClients,
} = require("../controllers/professionalController");

// ─────────────────────────────────────────────────────────────────────────────
// PROFESSIONALS LIST
// GET /api/professionals
// Returns all users with the role "Dietician" or "Instructor".
// Protected: valid JWT required, but no specific role restriction.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", verifyToken, getProfessionals);

// ─────────────────────────────────────────────────────────────────────────────
// PROFESSIONAL CLIENT LIST
// GET /api/professional/clients
// Returns linked Consumer clients with a compliance status (hasRecentLogs).
// Protected: valid JWT required AND role must be "Dietician" or "Instructor".
// ─────────────────────────────────────────────────────────────────────────────
router.get("/clients", verifyToken, isProfessional, getMyClients);

module.exports = router;
