/**
 * @file routes/chatRoutes.js
 * @description Express router for the Free Tier AI Chat endpoint.
 *
 * Endpoints:
 *   POST /send  →  chatController.handleAIChat
 *                  Runs the full context-aware chat pipeline:
 *                    fetch active plan → build persona → init Gemini chat → respond
 *
 * Mount point in index.js:
 *   const chatRoutes = require("./src/routes/chatRoutes");
 *   app.use("/api/chat", chatRoutes);
 *
 * Full endpoint URL: POST http://localhost:5000/api/chat/send
 *
 * Expected request body (application/json):
 *   {
 *     "consumerId":   "<MongoDB ObjectId string>",
 *     "userMessage":  "What should I eat for breakfast on Monday?",
 *     "chatHistory":  [
 *       { "role": "assistant", "text": "👋 Hi! I'm your NutriFit AI Advisor…" },
 *       { "role": "user",      "text": "What's in my Monday lunch?" }
 *     ]
 *   }
 *
 * Success response (200):
 *   {
 *     "success": true,
 *     "reply": "Your Monday lunch is Grilled Chicken & Chickpea Salad…"
 *   }
 *
 * Error responses:
 *   400 — Missing or empty userMessage
 *   500 — Gemini API error or unexpected server failure
 */

const express         = require("express");
const { handleAIChat } = require("../controllers/chatController");

const router = express.Router();

// POST /api/chat/send
// Processes a user chat message with full diet plan context and returns an AI reply.
router.post("/send", handleAIChat);

module.exports = router;
