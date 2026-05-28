/**
 * @file professionalRoutes.js
 * @description Express Router for the professionals directory and the
 * Premium Professional Hub assignment endpoints.
 *
 * Security:
 *   GET  /                          — verifyToken only (any authenticated user can browse)
 *   GET  /clients                   — verifyToken + isProfessional (Dietician | Instructor)
 *   POST /request-instructor        — verifyToken + isConsumer (Consumer triggering assignment)
 *   POST /request-dietician         — verifyToken + isConsumer
 *   POST /connect-by-code           — verifyToken + isConsumer
 *
 * Mounted at:
 *   /api/professionals  → public directory + Hub requests
 *   /api/professional   → professional-only endpoints (same router, singular path)
 *
 * Full Route Map:
 *   GET  /api/professionals                        → getProfessionals
 *   GET  /api/professional/clients                 → getMyClients
 *   POST /api/professionals/request-instructor     → requestInstructor
 *   POST /api/professionals/request-dietician      → requestDietician
 *   POST /api/professionals/connect-by-code        → connectByCode
 */

const express = require("express");
const router  = express.Router();

// ── Middleware ────────────────────────────────────────────────────────────────
const verifyToken    = require("../middleware/verifyToken");
const isProfessional = require("../middleware/isProfessional");
const isConsumer     = require("../middleware/isConsumer");

// ── Controller ────────────────────────────────────────────────────────────────
const {
  getConnectionStatus,
  getProfessionals,
  getMyClients,
  requestInstructor,
  requestDietician,
  connectByCode,
  requestWorkout,
} = require("../controllers/professionalController");


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/professionals/status
// Consumer — returns connection status for dietician + instructor.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status", verifyToken, isConsumer, getConnectionStatus);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/professionals
// Public directory — any authenticated user may browse professionals.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", verifyToken, getProfessionals);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/professional/clients
// Protected: valid JWT + Dietician or Instructor role required.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/clients", verifyToken, isProfessional, getMyClients);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/request-instructor
// Premium Hub — Consumer requests a randomly assigned Gym Instructor.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/request-instructor", verifyToken, isConsumer, requestInstructor);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/request-dietician
// Premium Hub — Consumer submits their AI diet plan for dietician review.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/request-dietician", verifyToken, isConsumer, requestDietician);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/connect-by-code
// Premium Hub — Consumer connects to a professional using their unique code.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/connect-by-code", verifyToken, isConsumer, connectByCode);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/request-workout
// Consumer — sends a workout plan request (with optional notes) to their
// connected instructor. Stored as flags on the consumer's User document.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/request-workout", verifyToken, isConsumer, requestWorkout);

module.exports = router;
