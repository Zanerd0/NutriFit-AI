/**
 * @file routes/dietPlanRoutes.js
 * @description Express router for AI-powered diet plan generation.
 *
 * Endpoints:
 *   POST /generate  →  dietPlanController.generateAIPlan
 *                      Executes the full 7-step RAG pipeline:
 *                        extract → embed → vector search → augment → generate → save → respond
 *
 * Mount point in index.js:
 *   const dietPlanRoutes = require("./src/routes/dietPlanRoutes");
 *   app.use("/api/diet-plan", dietPlanRoutes);
 *
 * Full endpoint URL: POST http://localhost:5000/api/diet-plan/generate
 *
 * Expected request body (application/json):
 *   {
 *     "consumerId":        "<MongoDB ObjectId string>",
 *     "age":               45,
 *     "weight":            82,
 *     "goal":              "Blood Sugar Control",
 *     "medicalConditions": "Type 2 Diabetes, Hypertension"
 *   }
 *
 * Success response (200):
 *   {
 *     "success": true,
 *     "message": "AI diet plan generated and saved successfully.",
 *     "data": { <DietPlan document> }
 *   }
 */

const express = require("express");
const { generateAIPlan } = require("../controllers/dietPlanController");

const router = express.Router();

// POST /api/diet-plan/generate
// Runs the full RAG pipeline and returns the persisted DietPlan document.
router.post("/generate", generateAIPlan);

module.exports = router;
