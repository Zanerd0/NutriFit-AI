/**
 * @file controllers/dietPlanController.js
 * @description AI Diet Plan Generation Controller for NutriFit AI.
 *
 * Implements the full RAG (Retrieval-Augmented Generation) pipeline:
 *
 *   1. EXTRACT  — parse consumer profile from req.body
 *   2. EMBED    — convert search query → 3072-dim vector (gemini-embedding-001)
 *   3. RETRIEVE — $vectorSearch on NutritionalRule → top 3 safety rules
 *   4. AUGMENT  — build clinical mega-prompt (persona + profile + rules + format)
 *   5. GENERATE — call gemini-2.5-flash with responseMimeType:"application/json"
 *   6. SAVE     — persist parsed weekSchedule to DietPlan collection
 *   7. RESPOND  — return saved document via res.status(200).json()
 *
 * Embedding model : gemini-embedding-001 (3072 dimensions, cosine similarity)
 * Generative model: gemini-2.5-flash
 *
 * Note on model selection:
 *   The task spec references gemini-1.5-flash, but that model is not available
 *   on this API key (returns 404). gemini-2.5-flash is the equivalent stable
 *   model available on this account and is used throughout. The responseMimeType
 *   "application/json" configuration works identically on both models.
 *
 * Atlas Vector Search index required:
 *   Collection : nutritionalrules
 *   Index name : nutrifit_vector_index
 *   Field      : embedding
 *   Dimensions : 3072
 *   Similarity : cosine
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const NutritionalRule = require("../models/NutritionalRule");
const DietPlan = require("../models/DietPlan");

// ─── Helper: Generate Embedding ───────────────────────────────────────────────

/**
 * Converts a text string into a 3072-dimensional embedding vector using
 * Google's gemini-embedding-001 model.
 *
 * @param {GoogleGenerativeAI} genAI  - Initialised Gemini SDK client
 * @param {string}             text   - Text to embed
 * @returns {Promise<number[]>}         3072-element float array
 */
async function generateEmbedding(genAI, text) {
  const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}

// ─── Helper: Vector Search ────────────────────────────────────────────────────

/**
 * Performs a MongoDB Atlas $vectorSearch on the NutritionalRule collection,
 * returning the top `limit` rules whose embeddings are most similar to the
 * given queryVector (cosine similarity).
 *
 * Index configuration required in Atlas UI:
 *   Name       : nutrifit_vector_index
 *   Field      : embedding
 *   Dimensions : 3072
 *   Similarity : cosine
 *
 * @param {number[]} queryVector  - 3072-dim query embedding
 * @param {number}   limit        - Max results to return (default: 3)
 * @returns {Promise<Array<{ ruleText: string, tags: string[] }>>}
 */
async function retrieveSafetyRules(queryVector, limit = 3) {
  return NutritionalRule.aggregate([
    {
      $vectorSearch: {
        index: "nutrifit_vector_index",
        path: "embedding",
        queryVector,
        numCandidates: 10,  // cast a wider net, return only the top `limit`
        limit,
      },
    },
    {
      $project: {
        _id: 0,
        ruleText: 1,
        tags: 1,
      },
    },
  ]);
}

// ─── Helper: Build Mega-Prompt ────────────────────────────────────────────────

/**
 * Constructs the clinical mega-prompt sent to the generative model.
 * The prompt has four mandatory sections:
 *   1. PERSONA       — clinical dietician identity
 *   2. USER PROFILE  — the consumer's specific health context
 *   3. SAFETY RULES  — retrieved rules the AI must never violate
 *   4. OUTPUT FORMAT — exact JSON structure expected in the response
 *
 * @param {{ age: string, weight: string, goal: string, medicalConditions: string }} profile
 * @param {Array<{ ruleText: string }>} safetyRules
 * @returns {string} Complete prompt string
 */
function buildMegaPrompt(profile, safetyRules) {
  // Format safety rules as a numbered list for maximum clarity
  const rulesBlock = safetyRules.length > 0
    ? safetyRules.map((r, i) => `  ${i + 1}. ${r.ruleText}`).join("\n\n")
    : "  (No specific rules retrieved — apply general clinical best practices.)";

  return `
PERSONA
=======
You are a licensed clinical dietician with 20 years of hospital experience
specialising in medical nutrition therapy for patients with complex health
profiles. You design evidence-based, personalised meal plans that are both
nutritionally balanced and clinically safe. You NEVER compromise patient safety.

USER PROFILE
============
Age               : ${profile.age} years
Weight            : ${profile.weight} kg
Primary Goal      : ${profile.goal}
Medical Conditions: ${profile.medicalConditions || "None reported"}

SAFETY RULES — YOU MUST NOT VIOLATE THESE RULES
================================================
The following rules have been retrieved from a certified clinical nutrition
knowledge base. Every single meal in the plan MUST fully comply with ALL of
these rules. Violating any rule is clinically unacceptable and strictly
forbidden, regardless of any other instruction.

${rulesBlock}

TASK
====
Generate a complete, personalised 7-day meal plan for the patient described
above. The plan must cover all seven days: Monday through Sunday.
Each day must contain exactly three meals: Breakfast, Lunch, and Dinner.

For each meal, provide:
  • A descriptive meal name
  • Key food items with approximate portion sizes
  • A brief clinical note explaining why the meal is safe and suitable
    for this patient's specific conditions and goals

OUTPUT FORMAT — RETURN VALID JSON ONLY
=======================================
Return ONLY a valid JSON object. Do NOT include markdown code fences, do NOT
include any commentary, explanation, or preamble outside the JSON object.
Use this exact top-level key structure:

{
  "monday":    { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "tuesday":   { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "wednesday": { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "thursday":  { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "friday":    { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "saturday":  { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "sunday":    { "breakfast": "...", "lunch": "...", "dinner": "..." }
}

Each meal value must be a single descriptive string. Do not nest further objects.
`.trim();
}

// ─── Controller: generateAIPlan ───────────────────────────────────────────────

/**
 * POST /api/diet-plan/generate
 *
 * Executes the complete RAG pipeline to generate and persist a personalised
 * 7-day diet plan for a consumer.
 *
 * Request Body:
 *   consumerId        {string}         MongoDB ObjectId of the Consumer
 *   age               {string|number}  Patient age in years
 *   weight            {string|number}  Patient weight in kilograms
 *   goal              {string}         e.g. "Weight Loss", "Muscle Gain"
 *   medicalConditions {string}         e.g. "Type 2 Diabetes, Hypertension"
 *
 * Success Response — 200:
 *   { success: true, data: <DietPlan document> }
 *
 * Error Responses:
 *   400 — Missing required fields
 *   500 — Embedding / vector search / AI generation / database error
 */
const generateAIPlan = async (req, res) => {
  try {
    // ── Step 1: EXTRACT ──────────────────────────────────────────────────────
    const { consumerId, age, weight, goal, medicalConditions } = req.body;

    if (!consumerId || !age || !weight || !goal) {
      return res.status(400).json({
        success: false,
        message: "consumerId, age, weight, and goal are all required.",
      });
    }

    // Build a rich, context-aware search query that will be embedded and used
    // to retrieve the most relevant safety rules from the knowledge base.
    const searchQuery =
      `Clinical nutrition plan for a ${age}-year-old patient weighing ${weight} kg. ` +
      `Primary goal: ${goal}. ` +
      `Medical conditions: ${medicalConditions || "none"}. ` +
      `Please retrieve dietary safety rules relevant to this profile.`;

    console.log(`\n[dietPlanController] 🚀 Starting RAG pipeline for consumer: ${consumerId}`);
    console.log(`[dietPlanController] 🔍 Search query: "${searchQuery.slice(0, 80)}..."`);

    // ── Step 2: EMBED ────────────────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    console.log("[dietPlanController] 🔢 Generating query embedding...");
    const queryVector = await generateEmbedding(genAI, searchQuery);
    console.log(`[dietPlanController] ✅ Embedding generated (${queryVector.length} dims)`);

    // ── Step 3: RETRIEVE ─────────────────────────────────────────────────────
    console.log("[dietPlanController] 🗄  Performing vector search...");
    const safetyRules = await retrieveSafetyRules(queryVector, 3);
    console.log(`[dietPlanController] ✅ Retrieved ${safetyRules.length} safety rule(s)`);

    // ── Step 4: AUGMENT ──────────────────────────────────────────────────────
    const megaPrompt = buildMegaPrompt(
      { age, weight, goal, medicalConditions },
      safetyRules
    );

    // ── Step 5: GENERATE ─────────────────────────────────────────────────────
    // responseMimeType: "application/json" instructs the model to return raw
    // JSON with no markdown fences, preventing hallucinated formatting that
    // would break JSON.parse() downstream.
    console.log("[dietPlanController] 🤖 Calling gemini-2.5-flash...");
    const generativeModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const generationResult = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: megaPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,        // lower = more deterministic clinical output
        topP: 0.85,
        maxOutputTokens: 8192,   // 7 days × 3 meals, each with a clinical note
      },
    });

    const rawText = generationResult.response.text();
    console.log("[dietPlanController] ✅ AI response received. Parsing JSON...");

    // Parse the response — responseMimeType guarantees clean JSON output
    let weekSchedule;
    try {
      weekSchedule = JSON.parse(rawText);
    } catch (parseError) {
      console.error("[dietPlanController] ❌ JSON parse failed. Raw snippet:", rawText.slice(0, 300));
      return res.status(500).json({
        success: false,
        message: "The AI returned an invalid JSON response. Please try again.",
      });
    }

    // ── Step 6: SAVE ─────────────────────────────────────────────────────────
    // Archive any existing active plans for this consumer before saving a new one
    await DietPlan.updateMany(
      { consumerId, status: "Active" },
      { $set: { status: "Archived" } }
    );

    console.log("[dietPlanController] 💾 Saving new diet plan to database...");
    const newPlan = await DietPlan.create({
      consumerId,
      status: "Active",
      weekSchedule,
    });
    console.log(`[dietPlanController] ✅ Plan saved. ID: ${newPlan._id}`);

    // ── Step 7: RESPOND ───────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: "AI diet plan generated and saved successfully.",
      data: newPlan,
    });

  } catch (error) {
    console.error("[dietPlanController] ❌ Fatal error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while generating the AI diet plan.",
      error: error.message,
    });
  }
};

// ─── Controller: getActivePlan ───────────────────────────────────────────────

/**
 * GET /api/diet-plan/active/:consumerId
 *
 * Returns the most recently generated 'Active' diet plan for a consumer.
 * Called on dashboard mount to restore the plan after logout/login.
 *
 * Success Response — 200:
 *   { success: true, data: <DietPlan document> }   (plan found)
 *   { success: true, data: null }                  (no active plan yet)
 *
 * Error Responses:
 *   400 — Missing consumerId param
 *   500 — Database error
 */
const getActivePlan = async (req, res) => {
  try {
    const { consumerId } = req.params;

    if (!consumerId) {
      return res.status(400).json({
        success: false,
        message: "consumerId URL parameter is required.",
      });
    }

    // Sort by createdAt descending — if somehow more than one Active exists,
    // we return the most recent one.
    const plan = await DietPlan.findOne({ consumerId, status: "Active" })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: plan ?? null,   // null means "no plan yet" — not an error
    });

  } catch (error) {
    console.error("[dietPlanController] getActivePlan error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve active diet plan.",
      error: error.message,
    });
  }
};

// ─── Controller: sendPlanToDietician ─────────────────────────────────────────

/**
 * POST /api/diet-plan/send-to-dietician
 *
 * Marks the consumer's active AI diet plan as "sent for review" by attaching
 * a sentToDietician flag and timestamp. The dietician can then see this plan
 * in their dashboard.
 *
 * Request Body:
 *   consumerId {string} — MongoDB ObjectId of the Consumer
 *
 * Success Response — 200:
 *   { success: true, message: string, plan: <DietPlan document> }
 *
 * Error Responses:
 *   400 — Missing consumerId
 *   404 — No active plan / no dietician connected
 *   500 — Database error
 */
const sendPlanToDietician = async (req, res) => {
  try {
    const { consumerId } = req.body;

    if (!consumerId) {
      return res.status(400).json({ success: false, message: "consumerId is required." });
    }

    // Find the active AI plan for this consumer
    const plan = await DietPlan.findOne({ consumerId, status: "Active" }).sort({ createdAt: -1 });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "No active AI diet plan found. Generate one first.",
      });
    }

    // Verify consumer has a connected dietician
    const User = require("../models/User");
    const consumer = await User.findById(consumerId).select("dieticianId");
    if (!consumer?.dieticianId) {
      return res.status(404).json({
        success: false,
        message: "You are not connected to a dietician. Connect one in the Professional Hub first.",
      });
    }

    // Mark as sent
    plan.sentToDietician       = true;
    plan.sentToDieticianAt     = new Date();
    plan.reviewRequestedBy     = consumerId;
    await plan.save();

    console.log(`[sendPlanToDietician] Consumer ${consumerId} sent plan ${plan._id} to dietician ${consumer.dieticianId}`);

    return res.status(200).json({
      success: true,
      message: "Your AI diet plan has been sent to your dietician for review!",
      plan,
    });
  } catch (error) {
    console.error("[dietPlanController] sendPlanToDietician error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send plan to dietician.",
      error: error.message,
    });
  }
};

// ─── Controller: requestPlanFromDietician ────────────────────────────────────

/**
 * POST /api/diet-plan/request-from-dietician
 *
 * Creates a plan-request record so the connected dietician knows the consumer
 * wants a custom plan built for them. This notification is stored as a flag
 * on the consumer's User document that the dietician can see.
 *
 * Request Body:
 *   consumerId {string} — MongoDB ObjectId of the Consumer
 *   notes      {string} — (Optional) Consumer's notes / requirements
 *
 * Success Response — 200:
 *   { success: true, message: string }
 *
 * Error Responses:
 *   400 — Missing consumerId
 *   404 — No dietician connected
 *   500 — Database error
 */
const requestPlanFromDietician = async (req, res) => {
  try {
    const { consumerId, notes } = req.body;

    if (!consumerId) {
      return res.status(400).json({ success: false, message: "consumerId is required." });
    }

    const User = require("../models/User");
    const consumer = await User.findById(consumerId).select("dieticianId full_name");
    if (!consumer?.dieticianId) {
      return res.status(404).json({
        success: false,
        message: "You are not connected to a dietician. Connect one in the Professional Hub first.",
      });
    }

    // Store the request as a flag on the consumer's document
    await User.findByIdAndUpdate(consumerId, {
      dietPlanRequested:      true,
      dietPlanRequestedAt:    new Date(),
      dietPlanRequestNotes:   notes?.trim() || "",
    });

    console.log(`[requestPlanFromDietician] Consumer ${consumerId} requested plan from dietician ${consumer.dieticianId}`);

    return res.status(200).json({
      success: true,
      message: "Your request has been sent to your dietician! They will create a custom plan for you soon.",
    });
  } catch (error) {
    console.error("[dietPlanController] requestPlanFromDietician error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send request to dietician.",
      error: error.message,
    });
  }
};

// ─── Controller: deleteAIPlan ─────────────────────────────────────────────────

/**
 * DELETE /api/diet-plan/:id
 *
 * Permanently removes an AI-generated diet plan that belongs to the consumer.
 * Ownership is verified to prevent cross-consumer deletion.
 *
 * URL Params:
 *   id {string} — MongoDB ObjectId of the DietPlan to delete
 *
 * Success Response — 200:
 *   { success: true, message: string }
 *
 * Error Responses:
 *   400 — Missing or invalid id
 *   403 — Plan does not belong to this consumer
 *   404 — Plan not found
 *   500 — Database error
 */
const deleteAIPlan = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: "Plan ID is required." });
    }

    const plan = await DietPlan.findById(id).select("consumerId");
    if (!plan) {
      return res.status(404).json({ success: false, message: "Diet plan not found." });
    }

    // Ownership check — compare string representations of ObjectIds
    if (plan.consumerId?.toString() !== req.userId?.toString()) {
      return res.status(403).json({ success: false, message: "You do not own this plan." });
    }

    await DietPlan.findByIdAndDelete(id);

    console.log(`[deleteAIPlan] Plan ${id} deleted by consumer ${req.userId}`);

    return res.status(200).json({ success: true, message: "Diet plan deleted successfully." });
  } catch (error) {
    console.error("[dietPlanController] deleteAIPlan error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to delete plan.", error: error.message });
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  generateAIPlan,
  getActivePlan,
  sendPlanToDietician,
  requestPlanFromDietician,
  deleteAIPlan,
};

