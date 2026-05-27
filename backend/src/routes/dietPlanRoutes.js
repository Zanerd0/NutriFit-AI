/**
 * @file routes/dietPlanRoutes.js
 * @description Express router for AI-powered diet plan generation and retrieval.
 *
 * Endpoints:
 *   POST /generate            →  dietPlanController.generateAIPlan
 *   GET  /active/:consumerId  →  dietPlanController.getActivePlan
 *
 * Mount point in index.js:
 *   app.use("/api/diet-plan", dietPlanRoutes);
 */

const express = require("express");
const { generateAIPlan, getActivePlan } = require("../controllers/dietPlanController");

const router = express.Router();

// POST /api/diet-plan/generate
// Runs the full RAG pipeline and returns the persisted DietPlan document.
router.post("/generate", generateAIPlan);

// GET /api/diet-plan/active/:consumerId
// Returns the consumer's current Active plan (or null if none exists yet).
// Called on dashboard mount to restore the persisted plan after login.
router.get("/active/:consumerId", getActivePlan);

module.exports = router;
