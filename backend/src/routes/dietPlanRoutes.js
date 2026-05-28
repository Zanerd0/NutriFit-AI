/**
 * @file routes/dietPlanRoutes.js
 * @description Express router for AI-powered diet plan generation and retrieval.
 *
 * Endpoints:
 *   POST   /generate                  →  generateAIPlan
 *   GET    /active/:consumerId        →  getActivePlan
 *   POST   /send-to-dietician         →  sendPlanToDietician
 *   POST   /request-from-dietician    →  requestPlanFromDietician
 *   DELETE /:id                       →  deleteAIPlan
 *
 * Mount point in index.js:
 *   app.use("/api/diet-plan", dietPlanRoutes);
 */

const express      = require("express");
const verifyToken  = require("../middleware/verifyToken");
const {
  generateAIPlan,
  getActivePlan,
  sendPlanToDietician,
  requestPlanFromDietician,
  deleteAIPlan,
} = require("../controllers/dietPlanController");

const router = express.Router();

// POST /api/diet-plan/generate
// Runs the full RAG pipeline and returns the persisted DietPlan document.
router.post("/generate", generateAIPlan);

// GET /api/diet-plan/active/:consumerId
// Returns the consumer's current Active plan (or null if none exists yet).
// Called on dashboard mount to restore the persisted plan after login.
router.get("/active/:consumerId", getActivePlan);

// POST /api/diet-plan/send-to-dietician
// Marks the active AI plan as sent to the consumer's connected dietician.
router.post("/send-to-dietician", sendPlanToDietician);

// POST /api/diet-plan/request-from-dietician
// Sends a plan-creation request to the consumer's connected dietician.
router.post("/request-from-dietician", requestPlanFromDietician);

// DELETE /api/diet-plan/:id  — owner-verified hard delete
router.delete("/:id", verifyToken, deleteAIPlan);

module.exports = router;
