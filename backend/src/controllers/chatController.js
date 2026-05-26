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
function buildSystemInstruction(activePlan) {
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

    // ── Step 2: FETCH CONTEXT (Active Diet Plan) ───────────────────────────────
    let activePlan = null;

    if (consumerId) {
      try {
        activePlan = await DietPlan.findOne(
          { consumerId, status: "Active" },
          // Only fetch the fields we need — no point loading the full document
          { weekSchedule: 1, createdAt: 1, _id: 0 }
        ).lean(); // .lean() returns a plain JS object (faster, no Mongoose overhead)

        if (activePlan) {
          console.log("[chatController] ✅ Active diet plan found — injecting into context.");
        } else {
          console.log("[chatController] ℹ️  No active diet plan found for this consumer.");
        }
      } catch (dbErr) {
        // Non-fatal: proceed without plan context rather than failing the whole chat
        console.warn("[chatController] ⚠️  Diet plan fetch failed (non-fatal):", dbErr.message);
      }
    }

    // ── Step 3: BUILD SYSTEM PERSONA ──────────────────────────────────────────
    const systemInstruction = buildSystemInstruction(activePlan);

    // ── Step 4: INITIALISE GEMINI CHAT SESSION ─────────────────────────────────
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // System instruction is passed at model initialisation time — it applies
    // to every turn in the conversation without consuming the history array.
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction,
    });

    // Map the frontend history into the Gemini SDK's expected format and start
    // the chat session. Passing history here gives the model full conversation
    // context so it can answer follow-up questions correctly.
    const history = mapHistoryToGemini(Array.isArray(chatHistory) ? chatHistory : []);

    const chatSession = model.startChat({
      history,
      generationConfig: {
        temperature:     0.7,   // balanced — creative but clinically grounded
        topP:            0.9,
        maxOutputTokens: 512,   // keep chat responses concise
      },
    });

    // ── Step 5: GENERATE RESPONSE ──────────────────────────────────────────────
    console.log("[chatController] 🤖 Sending message to gemini-2.5-flash...");
    const result = await chatSession.sendMessage(userMessage.trim());
    const replyText = result.response.text();

    console.log(`[chatController] ✅ Reply generated (${replyText.length} chars).`);

    // ── Step 6: RESPOND ────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      reply:   replyText,
    });

  } catch (error) {
    console.error("[chatController] ❌ Fatal error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing your message. Please try again.",
      error:   error.message,
    });
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = { handleAIChat };
