/**
 * @file controllers/ragController.js
 * @description RAG (Retrieval-Augmented Generation) controller for NutriFit AI.
 *
 * Pipeline executed by generateAIPlan():
 *   1. EXTRACT  — parse user profile from req.body
 *   2. RETRIEVE — embed the profile query → Atlas $vectorSearch → top-3 safety rules
 *   3. AUGMENT  — build a clinical mega-prompt with rules as hard guardrails
 *   4. GENERATE — call gemini-2.5-flash with responseMimeType:"application/json"
 *   5. SAVE     — persist the parsed plan to DietPlan collection
 *   6. RESPOND  — return the saved plan document via res.status(200).json()
 *
 * Embedding model : gemini-embedding-001 (3072 dims, cosine)
 * Generative model: gemini-2.5-flash
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const NutritionalRule = require("../models/NutritionalRule");
const DietPlan = require("../models/DietPlan");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a 3072-dimensional embedding for a text string using Google's
 * gemini-embedding-001 model via the @google/generative-ai SDK.
 *
 * gemini-embedding-001 is the available embedding model on this API key.
 * It outputs 3072-dimensional float vectors. Both this controller and
 * the seed script (scripts/seedRules.js) use the same model to guarantee
 * that ingestion-time and query-time vectors are in the same vector space.
 *
 * @param {GoogleGenerativeAI} genAI - Initialised Gemini client
 * @param {string}             text  - The text to embed
 * @returns {Promise<number[]>}       3072-element float array
 */
async function getEmbedding(genAI, text) {
  const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values; // number[]
}

/**
 * Queries the NutritionalRule collection via MongoDB Atlas $vectorSearch.
 *
 * Index configuration expected in Atlas:
 *   Name       : nutrifit_vector_index
 *   Field      : embedding
 *   Dimensions : 768
 *   Similarity : cosine
 *
 * @param {number[]} queryVector - 768-dim embedding of the user profile query
 * @param {number}   limit       - Number of top results to return (default 3)
 * @returns {Promise<Array<{ruleText: string, tags: string[], score: number}>>}
 */
async function retrieveSafetyRules(queryVector, limit = 3) {
  return NutritionalRule.aggregate([
    {
      $vectorSearch: {
        index: "nutrifit_vector_index",
        path: "embedding",
        queryVector,
        numCandidates: limit * 10, // over-fetch for better accuracy
        limit,
      },
    },
    {
      // Project only the fields we need; include the Atlas search score
      $project: {
        _id: 0,
        ruleText: 1,
        tags: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);
}

/**
 * Builds the clinical mega-prompt that instructs gemini-1.5-flash to produce
 * a strictly formatted 7-day JSON diet plan while honouring the retrieved
 * safety rules as non-negotiable clinical constraints.
 *
 * @param {Object}   profile         - User profile extracted from req.body
 * @param {string}   profile.age
 * @param {string}   profile.weight
 * @param {string}   profile.goal
 * @param {string}   profile.medicalConditions
 * @param {Array}    safetyRules     - Retrieved NutritionalRule documents
 * @returns {string}                   The complete prompt string
 */
function buildMegaPrompt(profile, safetyRules) {
  const rulesBlock = safetyRules
    .map((r, i) => `  Rule ${i + 1}: ${r.ruleText}`)
    .join("\n\n");

  return `
You are a licensed clinical dietician with 20 years of hospital experience
specialising in medical nutrition therapy. You design evidence-based meal plans
that are both nutritionally complete and safe for patients with complex health
profiles. You NEVER violate clinical safety rules.

════════════════════════════════════════
PATIENT PROFILE
════════════════════════════════════════
Age               : ${profile.age}
Weight            : ${profile.weight} kg
Primary Goal      : ${profile.goal}
Medical Conditions: ${profile.medicalConditions || "None reported"}

════════════════════════════════════════
⚠  MANDATORY SAFETY RULES (DO NOT VIOLATE)
════════════════════════════════════════
The following rules have been retrieved from a clinical knowledge base.
Every meal in the plan MUST comply with ALL of these rules without exception.
Violating any rule is clinically unacceptable and is strictly forbidden.

${rulesBlock}

════════════════════════════════════════
TASK
════════════════════════════════════════
Generate a complete 7-day personalised meal plan for this patient.
The plan must cover Monday through Sunday.
Each day must include exactly three meals: Breakfast, Lunch, and Dinner.
For each meal provide:
  • A descriptive name
  • A list of food items with approximate portion sizes
  • Key nutritional notes (e.g., why this meal suits the patient's conditions)

════════════════════════════════════════
REQUIRED JSON OUTPUT FORMAT
════════════════════════════════════════
Return ONLY a valid JSON object — no markdown, no code fences, no commentary.
Use this exact structure:

{
  "monday":    { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "tuesday":   { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "wednesday": { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "thursday":  { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "friday":    { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "saturday":  { "breakfast": "...", "lunch": "...", "dinner": "..." },
  "sunday":    { "breakfast": "...", "lunch": "...", "dinner": "..." }
}

Each meal value should be a concise but informative string describing the meal
(food items + portions + brief clinical note). Do not nest further objects.
`.trim();
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/diet-plan/generate
 *
 * Body:
 *   consumerId       {string}  — ObjectId of the authenticated Consumer
 *   age              {string|number}
 *   weight           {string|number}  — in kilograms
 *   goal             {string}  — e.g. "Weight Loss", "Muscle Gain"
 *   medicalConditions{string}  — free text, e.g. "Type 2 Diabetes, Hypertension"
 *
 * Response 200:
 *   { success: true, data: <DietPlan document> }
 *
 * Response 400:
 *   { success: false, message: "..." }   — missing required fields
 *
 * Response 500:
 *   { success: false, message: "..." }   — internal / AI / DB error
 */
const generateAIPlan = async (req, res) => {
  try {
    // ── STEP 1: EXTRACT ─────────────────────────────────────────────────────
    const { consumerId, age, weight, goal, medicalConditions } = req.body;

    if (!consumerId || !age || !weight || !goal) {
      return res.status(400).json({
        success: false,
        message: "consumerId, age, weight, and goal are required fields.",
      });
    }

    // Build a rich search string that captures the full patient context;
    // this string will be embedded to find the most relevant safety rules.
    const searchString =
      `Patient profile: age ${age}, weight ${weight} kg, goal: ${goal}. ` +
      `Medical conditions: ${medicalConditions || "none"}. ` +
      `Dietary guidance needed for safe and effective nutrition planning.`;

    // ── STEP 2: RETRIEVE ─────────────────────────────────────────────────────
    // 2a. Initialise the Gemini client (requires GEMINI_API_KEY in .env)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // 2b. Embed the search string with text-embedding-004
    console.log("🔍 [RAG] Generating query embedding...");
    const queryVector = await getEmbedding(genAI, searchString);

    // 2c. Perform Atlas Vector Search to retrieve top-3 safety rules
    console.log("🗄  [RAG] Performing vector search on NutritionalRule collection...");
    const safetyRules = await retrieveSafetyRules(queryVector, 3);
    console.log(`✅ [RAG] Retrieved ${safetyRules.length} safety rule(s).`);

    // ── STEP 3: AUGMENT ──────────────────────────────────────────────────────
    const megaPrompt = buildMegaPrompt(
      { age, weight, goal, medicalConditions },
      safetyRules
    );

    // ── STEP 4: GENERATE ─────────────────────────────────────────────────────
    // Configure gemini-2.5-flash with responseMimeType:"application/json"
    // This forces the model to return raw JSON without markdown fences,
    // preventing hallucinated formatting that would break JSON.parse().
    console.log("🤖 [RAG] Calling gemini-2.5-flash for plan generation...");
    // getGenerativeModel takes only one arg here; generationConfig is passed
    // inside generateContent below — this is the correct SDK usage pattern.
    const generativeModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const generationResult = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: megaPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,      // lower temp = more consistent clinical output
        topP: 0.85,
        maxOutputTokens: 4096,
      },
    });

    const rawText = generationResult.response.text();
    console.log("✅ [RAG] Gemini response received. Parsing JSON...");

    // Parse the JSON response — responseMimeType ensures no markdown wrappers
    let weekSchedule;
    try {
      weekSchedule = JSON.parse(rawText);
    } catch (parseError) {
      console.error("❌ [RAG] JSON parse error. Raw response snippet:", rawText.slice(0, 300));
      return res.status(500).json({
        success: false,
        message: "AI returned an invalid JSON response. Please try again.",
        debug: rawText.slice(0, 500),
      });
    }

    // ── STEP 5: SAVE ─────────────────────────────────────────────────────────
    console.log("💾 [RAG] Saving diet plan to database...");
    const newPlan = await DietPlan.create({
      consumerId,
      userId: consumerId,          // keep userId in sync for legacy routes
      status: "Active",
      week_schedule: weekSchedule,
      // Phase-1 required fields — provide sensible defaults for AI-generated plans
      dieticianId: consumerId,     // self-generated; no dietician in this flow
      clientId: consumerId,
      title: `AI Diet Plan — ${goal}`,
      description: `Auto-generated 7-day plan for age ${age}, ${weight}kg. Conditions: ${medicalConditions || "None"}.`,
    });

    console.log(`✅ [RAG] Diet plan saved. ID: ${newPlan._id}`);

    // ── STEP 6: RESPOND ───────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: "AI diet plan generated and saved successfully.",
      data: newPlan,
    });
  } catch (error) {
    console.error("❌ [RAG] generateAIPlan error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while generating the AI diet plan.",
      error: error.message,
    });
  }
};

module.exports = { generateAIPlan };
