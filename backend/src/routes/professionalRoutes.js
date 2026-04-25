/**
 * @file professionalRoutes.js
 * @description Express Router for the publicly accessible professionals directory.
 *
 * Security Note:
 * ─────────────
 * This route is protected by verifyToken ONLY (no role check), meaning any
 * logged-in user (Consumer, Admin, etc.) can browse the professionals list.
 * This is intentional — a Consumer needs to see all Dieticians/Instructors
 * before they can request a connection.
 *
 * Mounted at: /api/professionals  (registered in backend/index.js)
 *
 * Full Route Map:
 *   GET /api/professionals → getProfessionals (returns Dieticians + Instructors)
 */

const express = require("express");
const router  = express.Router();

// ── Middleware ──────────────────────────────────────────────────────────────
// verifyToken ensures the caller is authenticated; no role restriction here.
const verifyToken = require("../middleware/verifyToken");

// ── Controller ──────────────────────────────────────────────────────────────
const { getProfessionals } = require("../controllers/professionalController");

// ─────────────────────────────────────────────────────────────────────────────
// PROFESSIONALS LIST
// GET /api/professionals
// Returns all users with the role "Dietician" or "Instructor".
// Protected: valid JWT required, but no specific role restriction.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", verifyToken, getProfessionals);

module.exports = router;
