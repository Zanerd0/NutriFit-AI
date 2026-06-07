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
const User = require("../models/User");
const {
  formatGeminiError,
  isQuotaExceededError,
  isServiceOverloaded,
  generateContentWithFallback,
} = require("../utils/geminiHelpers");
const {
  normalizeWeekSchedule,
  validateWeekSchedule,
  validateDietaryCompliance,
  formatDietaryConstraints,
} = require("../utils/dietPlanValidation");

const MAX_PLAN_ATTEMPTS = 3;

const PLAN_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  temperature: 0.35,
  topP: 0.85,
  maxOutputTokens: 8192,
};

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
 * @param {{ age, weight, goal, medicalConditions, dietaryPreferences }} profile
 * @param {Array<{ ruleText: string }>} safetyRules
 * @param {string} [repairNote] - Optional validation feedback for a retry attempt
 * @returns {string} Complete prompt string
 */
function buildMegaPrompt(profile, safetyRules, repairNote = "") {
  const rulesBlock = safetyRules.length > 0
    ? safetyRules.map((r, i) => `  ${i + 1}. ${r.ruleText}`).join("\n\n")
    : "  (No specific rules retrieved — apply general clinical best practices.)";

  const dietaryBlock = formatDietaryConstraints(profile.dietaryPreferences);

  const repairSection = repairNote
    ? `
PREVIOUS ATTEMPT FAILED VALIDATION — FIX THESE ISSUES
=====================================================
Your last response was rejected because:
${repairNote}

You MUST correct every issue above. Return a complete new 7-day plan with all
21 meals filled in and full compliance with dietary preferences and medical rules.
`
    : "";

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

DIETARY PREFERENCES — ABSOLUTE REQUIREMENTS (from patient profile)
===================================================================
These preferences are registered on the patient's account and MUST be obeyed in
EVERY meal across ALL 7 days. Violating any preference is unacceptable.

${dietaryBlock}

SAFETY RULES — YOU MUST NOT VIOLATE THESE RULES
================================================
The following rules have been retrieved from a certified clinical nutrition
knowledge base. Every single meal in the plan MUST fully comply with ALL of
these rules. Violating any rule is clinically unacceptable and strictly
forbidden, regardless of any other instruction.

${rulesBlock}
${repairSection}
TASK
====
Generate a complete, personalised 7-day meal plan for the patient described
above. The plan MUST include ALL seven days: monday, tuesday, wednesday,
thursday, friday, saturday, and sunday — do not skip or omit any day.
Each day must contain exactly three meals: breakfast, lunch, and dinner.

For each meal, provide:
  • A descriptive meal name
  • Key food items with approximate portion sizes
  • A brief clinical note explaining why the meal is safe and suitable
    for this patient's specific conditions, goals, and dietary preferences

OUTPUT FORMAT — RETURN VALID JSON ONLY
=======================================
Return ONLY a valid JSON object. Do NOT include markdown code fences, do NOT
include any commentary, explanation, or preamble outside the JSON object.
Use this exact top-level key structure (all keys lowercase, all 7 days required):

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

/**
 * Generates and validates a week schedule, retrying with repair prompts when needed.
 */
async function generateValidatedWeekSchedule(genAI, profile, safetyRules) {
  let repairNote = "";

  for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
    console.log(`[dietPlanController] 📋 Plan generation attempt ${attempt}/${MAX_PLAN_ATTEMPTS}...`);

    const megaPrompt = buildMegaPrompt(profile, safetyRules, repairNote);
    const { rawText } = await generateContentWithFallback(genAI, {
      contents: [{ role: "user", parts: [{ text: megaPrompt }] }],
      generationConfig: PLAN_GENERATION_CONFIG,
      logPrefix: "[dietPlanController]",
    });

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseError) {
      repairNote = "The response was not valid JSON. Return only a parseable JSON object.";
      console.warn("[dietPlanController] ⚠️ JSON parse failed on attempt", attempt);
      if (attempt === MAX_PLAN_ATTEMPTS) {
        throw new Error("The AI returned an invalid JSON response after multiple attempts.");
      }
      continue;
    }

    const weekSchedule = normalizeWeekSchedule(parsed);
    const structureCheck = validateWeekSchedule(weekSchedule);
    if (!structureCheck.valid) {
      repairNote =
        `Missing or empty meals: ${structureCheck.missing.join(", ")}. ` +
        "You must include breakfast, lunch, and dinner for every day monday through sunday.";
      console.warn("[dietPlanController] ⚠️ Incomplete plan:", structureCheck.missing.join(", "));
      if (attempt === MAX_PLAN_ATTEMPTS) {
        throw new Error(`Incomplete plan after ${MAX_PLAN_ATTEMPTS} attempts: ${structureCheck.missing.join(", ")}`);
      }
      continue;
    }

    const dietCheck = validateDietaryCompliance(weekSchedule, profile.dietaryPreferences);
    if (!dietCheck.valid) {
      repairNote = dietCheck.violations.slice(0, 5).join("\n");
      console.warn("[dietPlanController] ⚠️ Dietary preference violations:", dietCheck.violations.length);
      if (attempt === MAX_PLAN_ATTEMPTS) {
        throw new Error(
          `Plan violated dietary preferences after ${MAX_PLAN_ATTEMPTS} attempts: ${dietCheck.violations[0]}`
        );
      }
      continue;
    }

    return weekSchedule;
  }

  throw new Error("Failed to generate a valid diet plan.");
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

    const consumerProfile = await User.findById(consumerId)
      .select("dietary_preferences")
      .lean();

    const dietaryPreferences = (consumerProfile?.dietary_preferences ?? [])
      .filter((pref) => pref && pref !== "None");

    const profile = {
      age,
      weight,
      goal,
      medicalConditions: medicalConditions?.trim() || "",
      dietaryPreferences,
    };

    const preferenceLabel = dietaryPreferences.length
      ? dietaryPreferences.join(", ")
      : "none";

    // Build a rich, context-aware search query that will be embedded and used
    // to retrieve the most relevant safety rules from the knowledge base.
    const searchQuery =
      `Clinical nutrition plan for a ${age}-year-old patient weighing ${weight} kg. ` +
      `Primary goal: ${goal}. ` +
      `Medical conditions: ${profile.medicalConditions || "none"}. ` +
      `Dietary preferences: ${preferenceLabel}. ` +
      `Please retrieve dietary safety rules relevant to this profile.`;

    console.log(`\n[dietPlanController] 🚀 Starting RAG pipeline for consumer: ${consumerId}`);
    console.log(`[dietPlanController] 🥗 Dietary preferences: ${preferenceLabel}`);
    console.log(`[dietPlanController] 🔍 Search query: "${searchQuery.slice(0, 80)}..."`);

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "AI plan generation is not configured (GEMINI_API_KEY missing).",
      });
    }

    // ── Step 2: EMBED ────────────────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    console.log("[dietPlanController] 🔢 Generating query embedding...");
    const queryVector = await generateEmbedding(genAI, searchQuery);
    console.log(`[dietPlanController] ✅ Embedding generated (${queryVector.length} dims)`);

    // ── Step 3: RETRIEVE ─────────────────────────────────────────────────────
    console.log("[dietPlanController] 🗄  Performing vector search...");
    const safetyRules = await retrieveSafetyRules(queryVector, 3);
    console.log(`[dietPlanController] ✅ Retrieved ${safetyRules.length} safety rule(s)`);

    // ── Step 4: GENERATE + VALIDATE (with retries) ───────────────────────────
    const weekSchedule = await generateValidatedWeekSchedule(genAI, profile, safetyRules);

    console.log("[dietPlanController] ✅ Validated 7-day plan received.");

    // ── Step 6: SAVE ─────────────────────────────────────────────────────────
    // Archive any existing active plans for this consumer before saving a new one
    await DietPlan.updateMany(
      { consumerId, status: "Active" },
      { $set: { status: "Archived" } }
    );

    console.log("[dietPlanController] 💾 Saving new diet plan to database...");
    const newPlan = await DietPlan.create({
      planType: "ai",
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
    console.error("[dietPlanController] ❌ Fatal error:", formatGeminiError(error));

    if (isQuotaExceededError(error)) {
      return res.status(429).json({
        success: false,
        message: "Gemini API free-tier quota reached for all available models. Wait a minute and try again, or check usage in Google AI Studio.",
      });
    }

    if (isServiceOverloaded(error)) {
      return res.status(503).json({
        success: false,
        message: "The AI service is temporarily busy. Please wait a moment and try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "An error occurred while generating the AI diet plan. Please try again.",
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

    plan.sentToDietician      = true;
    plan.sentToDieticianAt    = new Date();
    plan.reviewRequestedBy    = consumerId;
    await plan.save();

    await User.findByIdAndUpdate(consumerId, {
      dietPlanRequested:    true,
      dietPlanRequestedAt:  new Date(),
      dietPlanRequestNotes: "Sent AI diet plan for your review.",
    });

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

