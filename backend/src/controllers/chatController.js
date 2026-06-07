/**
 * @file controllers/chatController.js
 * @description AI Chat Controller for NutriFit AI — Free Tier.
 *
 * Handles conversational AI requests from the consumer chat widget.
 * The controller:
 *   1. Extracts the user's message + conversation history from req.body
 *   2. Fetches the consumer's active DietPlan from MongoDB for context
 *   3. Builds a clinical system persona with the plan injected as context
 *   4. Initialises a Gemini chat session with the full conversation history
 *   5. Sends the new message, awaits the reply, and returns it as JSON
 *
 * Generative model: gemini-2.5-flash
 *
 * Note on model selection:
 *   The task spec references gemini-1.5-flash, but that model returns 404 on
 *   this API key. gemini-2.5-flash is the available equivalent and is used
 *   throughout. All SDK usage (startChat, sendMessage) is identical between
 *   the two models — swapping the name string is the only change required if
 *   the API key gains access to 1.5-flash in the future.
 *
 * Endpoint:  POST /api/chat/send
 * Auth:      None for now (JWT cookie auth can be added via verifyToken middleware)
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const DietPlan = require("../models/DietPlan");
const User = require("../models/User");
const { formatDietaryConstraints } = require("../utils/dietPlanValidation");

/** Text models for chat, best quality first → lighter fallbacks when quota is hit. */
const CHAT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
];

const GENERATION_CONFIG = {
  temperature:     0.7,
  topP:            0.9,
  maxOutputTokens: 512,
};

const getErrorStatus = (error) => {
  const msg = error?.message ?? "";
  const bracketMatch = msg.match(/\[(429|503|404|500)\s/);
  if (bracketMatch) return Number(bracketMatch[1]);
  if (typeof error?.status === "number") return error.status;
  return null;
};

const formatGeminiError = (error) => {
  const msg = error?.message ?? String(error);
  const status = getErrorStatus(error);
  const summary = msg.split(". [{")[0].split("\n")[0].trim();
  return status ? `[${status}] ${summary}` : summary;
};

const isModelNotFoundError = (error) => {
  if (getErrorStatus(error) === 404) return true;
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("not found") || msg.includes("is not supported");
};

const isQuotaExceededError = (error) => {
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("quota exceeded") || msg.includes("exceeded your current quota");
};

const isRetryableError = (error) => {
  if (isQuotaExceededError(error)) return false;

  const status = getErrorStatus(error);
  if (status === 503 || status === 429 || status === 500) return true;
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("resource exhausted")
  );
};

// ─── Helper: Build System Persona ─────────────────────────────────────────────

/**
 * Constructs the system instruction string injected into every chat session.
 *
 * The system instruction establishes the AI's persona and provides the
 * consumer's active diet plan as hard context, so answers are always
 * grounded in the user's specific weekly schedule rather than generic advice.
 *
 * @param {object|null} activePlan - The consumer's active DietPlan document,
 *                                   or null if none has been generated yet.
 * @returns {string} System instruction text sent to Gemini's model config.
 */
function buildSystemInstruction(activePlan, dietaryPreferences = []) {
  const prefsBlock = formatDietaryConstraints(dietaryPreferences);

  const planSection = activePlan?.weekSchedule
    ? `
CONSUMER'S CURRENT 7-DAY DIET PLAN
====================================
This is the user's active AI-generated diet plan. Answer their questions
SPECIFICALLY based on this data. When referencing meals, quote the exact
food items from this plan rather than giving generic alternatives.

${JSON.stringify(activePlan.weekSchedule, null, 2)}

Plan generated on: ${new Date(activePlan.createdAt).toLocaleDateString("en-GB", {
        weekday: "long",
        year:    "numeric",
        month:   "long",
        day:     "numeric",
      })}
`
    : `
CONSUMER'S DIET PLAN
====================
This consumer has not yet generated an AI diet plan. Encourage them to use the
"Generate My AI Plan" button on their dashboard. In the meantime, provide
helpful general nutrition advice based on established dietary guidelines.
`;

  return `
PERSONA & ROLE
==============
You are NutriFit AI, a helpful and empathetic AI dietary assistant integrated
into the NutriFit AI health platform. You specialise in:
  • Explaining and elaborating on the consumer's personalised diet plan
  • Answering nutrition and healthy eating questions with evidence-based guidance
  • Motivating consumers to stick to their dietary goals
  • Clarifying meal preparation tips for the foods in their plan

BEHAVIOUR RULES
===============
  1. Be warm, encouraging, and concise. Keep responses under 200 words unless
     a detailed breakdown is explicitly requested.
  2. Always tie answers back to the consumer's specific plan where possible.
  3. If asked about topics outside nutrition/diet/health, politely redirect.
  4. Never diagnose medical conditions. Always recommend consulting a licensed
     dietician or doctor for clinical decisions.
  5. Do NOT recommend premium features (PDF export, human chat) — this consumer
     is on the free tier; mention only features available to them.
  6. Format responses in plain text. Do NOT use markdown headers or bullet
     symbols that would look odd in a chat bubble.
  7. NEVER suggest foods that violate the consumer's registered dietary preferences.

CONSUMER'S DIETARY PREFERENCES (mandatory — never violate)
==========================================================
${prefsBlock}
${planSection}
`.trim();
}

// ─── Helper: Map Frontend History to Gemini Format ────────────────────────────

/**
 * Converts the frontend's `{ role, text }` message array into the format
 * expected by the Gemini SDK's startChat({ history }) parameter.
 *
 * Gemini SDK format:
 *   { role: "user" | "model", parts: [{ text: string }] }
 *
 * The initial greeting from the assistant (index 0) is excluded because
 * Gemini requires the history to start with a "user" turn, and the greeting
 * was generated locally on the frontend — not by Gemini itself.
 *
 * @param {Array<{ role: string, text: string }>} frontendHistory
 * @returns {Array<{ role: string, parts: [{ text: string }] }>}
 */
function mapHistoryToGemini(frontendHistory) {
  return frontendHistory
    // Drop the initial greeting bubble (role: "assistant", generated locally)
    .filter((msg, idx) => !(idx === 0 && msg.role === "assistant"))
    // Map role names: "assistant" → "model" (Gemini's term)
    .map((msg) => ({
      role:  msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.text }],
    }));
}

/**
 * Sends a chat message, cycling through models when one is unavailable or over quota.
 * Each model has its own free-tier quota bucket, so a 429 on one model does not block others.
 */
async function sendChatWithFallback(genAI, { systemInstruction, history, userMessage }) {
  let lastError = null;

  for (const modelName of CHAT_MODELS) {
    try {
      console.log(`[chatController] 🤖 Trying ${modelName}...`);

      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      const chatSession = model.startChat({ history, generationConfig: GENERATION_CONFIG });
      const result = await chatSession.sendMessage(userMessage.trim());
      const replyText = result.response.text();

      console.log(`[chatController] ✅ Reply from ${modelName} (${replyText.length} chars).`);
      return { replyText, modelName };
    } catch (error) {
      lastError = error;
      console.warn(`[chatController] ⚠️ ${modelName} failed: ${formatGeminiError(error)}`);

      if (isModelNotFoundError(error)) continue;
      if (isQuotaExceededError(error)) continue;
      if (isRetryableError(error)) continue;

      throw error;
    }
  }

  throw lastError ?? new Error("All chat models failed.");
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * handleAIChat
 * POST /api/chat/send
 *
 * Runs the full context-aware chat pipeline:
 *   extract → fetch plan → build persona → init chat → send → respond
 *
 * Request Body:
 *   consumerId   {string}                   MongoDB ObjectId of the Consumer
 *   userMessage  {string}                   The new message from the user
 *   chatHistory  {Array<{role,text}>}       All previous messages in the session
 *
 * Success Response — 200:
 *   { success: true, reply: string }
 *
 * Error Responses:
 *   400 — Missing required fields
 *   500 — Gemini API error or database error
 */
const handleAIChat = async (req, res) => {
  try {
    // ── Step 1: EXTRACT ────────────────────────────────────────────────────────
    const { consumerId, userMessage, chatHistory } = req.body;

    if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
      return res.status(400).json({
        success: false,
        message: "userMessage is required and must be a non-empty string.",
      });
    }

    console.log(`\n[chatController] 💬 New message from consumer: ${consumerId ?? "anonymous"}`);
    console.log(`[chatController] 📨 Message: "${userMessage.slice(0, 80)}${userMessage.length > 80 ? "…" : ""}"`);

    // ── Step 2: FETCH CONTEXT (Active Diet Plan + dietary preferences) ─────────
    let activePlan = null;
    let dietaryPreferences = [];

    if (consumerId) {
      try {
        const [plan, consumer] = await Promise.all([
          DietPlan.findOne(
            { consumerId, status: "Active" },
            { weekSchedule: 1, createdAt: 1, _id: 0 }
          ).lean(),
          User.findById(consumerId).select("dietary_preferences").lean(),
        ]);

        activePlan = plan;
        dietaryPreferences = (consumer?.dietary_preferences ?? []).filter(
          (pref) => pref && pref !== "None"
        );

        if (activePlan) {
          console.log("[chatController] ✅ Active diet plan found — injecting into context.");
        } else {
          console.log("[chatController] ℹ️  No active diet plan found for this consumer.");
        }

        if (dietaryPreferences.length) {
          console.log(`[chatController] 🥗 Dietary preferences: ${dietaryPreferences.join(", ")}`);
        }
      } catch (dbErr) {
        // Non-fatal: proceed without plan context rather than failing the whole chat
        console.warn("[chatController] ⚠️  Context fetch failed (non-fatal):", dbErr.message);
      }
    }

    // ── Step 3: BUILD SYSTEM PERSONA ──────────────────────────────────────────
    const systemInstruction = buildSystemInstruction(activePlan, dietaryPreferences);

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "AI chat is not configured (GEMINI_API_KEY missing).",
      });
    }

    // ── Step 4: GENERATE RESPONSE (with model fallback) ───────────────────────
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const history = mapHistoryToGemini(Array.isArray(chatHistory) ? chatHistory : []);

    const { replyText } = await sendChatWithFallback(genAI, {
      systemInstruction,
      history,
      userMessage,
    });

    // ── Step 5: RESPOND ────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      reply:   replyText,
    });

  } catch (error) {
    console.error("[chatController] ❌ Fatal error:", formatGeminiError(error));

    if (isQuotaExceededError(error)) {
      return res.status(429).json({
        success: false,
        message: "Gemini API free-tier quota reached for all available models. Wait a minute and try again, or check usage in Google AI Studio.",
      });
    }

    const status = getErrorStatus(error);
    if (status === 503 || status === 429) {
      return res.status(503).json({
        success: false,
        message: "The AI service is temporarily busy. Please wait a moment and try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "An error occurred while processing your message. Please try again.",
    });
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = { handleAIChat };
