/**
 * @file scripts/seedRules.js
 * @description Standalone ingestion script — populates the NutritionalRule
 *              collection with sample dietary rules and their 3072-dimensional
 *              vector embeddings produced by Google's gemini-embedding-001 model.
 *
 * Usage (MUST run inside the Docker container via docker-compose exec):
 *   docker-compose exec backend node scripts/seedRules.js
 *
 * Prerequisites:
 *   • MONGO_URI and GEMINI_API_KEY must be present in backend/.env
 *   • The 'nutrifit_vector_index' Atlas Vector Search index must be configured
 *     for the NutritionalRule.embedding field with:
 *       Dimensions : 3072  (gemini-embedding-001 output size)
 *       Similarity : cosine
 *
 * ⚠  Do NOT run this script directly on the host with `node scripts/seedRules.js`.
 *    Always use: docker-compose exec backend node scripts/seedRules.js
 */

// ─── 1. Environment & Dependencies ───────────────────────────────────────────

require("dotenv").config(); // Load .env from CWD (run from /backend)

// Apply the same DNS override that db.js uses to ensure Atlas SRV URIs resolve
// correctly inside Docker (prevents ECONNREFUSED on _mongodb._tcp SRV lookups).
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Resolve the model relative to this script's location so it works
// regardless of the working directory the script is launched from.
const NutritionalRule = require("../src/models/NutritionalRule");

// ─── 2. Validate Required Environment Variables ───────────────────────────────

const { MONGO_URI, GEMINI_API_KEY } = process.env;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env — cannot connect to MongoDB.");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is not set in .env — cannot call the Gemini embedding API.");
  process.exit(1);
}

// ─── 3. Sample Dietary Rules Knowledge Base ───────────────────────────────────
// Three clinical rules covering diabetes and hypertension — expand freely.
// Each rule will be embedded and stored as a separate NutritionalRule document.

const SAMPLE_RULES = [
  {
    ruleText:
      "Patients diagnosed with Type 2 Diabetes must strictly limit refined carbohydrates " +
      "and added sugars. Daily carbohydrate intake should be spread evenly across meals to " +
      "prevent postprandial blood glucose spikes. Preferred carbohydrate sources include " +
      "whole grains, legumes, and non-starchy vegetables. Sugary drinks, white bread, " +
      "white rice, and pastries must be avoided.",
    tags: ["diabetes", "type-2-diabetes", "low-carb", "glycemic-control", "blood-glucose"],
  },
  {
    ruleText:
      "Individuals with hypertension (high blood pressure) must follow a low-sodium diet. " +
      "Daily sodium intake must not exceed 1,500 mg. Processed foods, canned soups, " +
      "fast food, pickles, and cured meats are prohibited due to their high sodium content. " +
      "The DASH diet pattern — rich in fruits, vegetables, whole grains, and low-fat dairy — " +
      "is strongly recommended. Potassium-rich foods such as bananas, sweet potatoes, and " +
      "spinach help counteract sodium's effect on blood pressure.",
    tags: ["hypertension", "high-blood-pressure", "low-sodium", "DASH-diet", "cardiovascular"],
  },
  {
    ruleText:
      "For patients managing both Type 2 Diabetes and hypertension concurrently, meal plans " +
      "must simultaneously be low in refined carbohydrates AND low in sodium. Saturated fats " +
      "must be minimised (less than 7% of total daily calories) to protect cardiovascular " +
      "health. Healthy fat sources such as avocados, olive oil, and unsalted nuts are " +
      "permitted in moderation. Alcohol consumption must be avoided as it destabilises both " +
      "blood glucose and blood pressure. Portion control is essential at every meal.",
    tags: ["diabetes", "hypertension", "comorbidity", "low-carb", "low-sodium", "cardiovascular"],
  },
];

// ─── 4. Embedding Helper ──────────────────────────────────────────────────────

/**
 * Generates a 3072-dimensional embedding for the given text using Google's
 * gemini-embedding-001 model via the @google/generative-ai SDK.
 *
 * This is the only embedding model available on this API key that supports
 * the embedContent method. It outputs 3072-dimensional float vectors.
 * Both the Atlas index and NutritionalRule schema must be configured for
 * 3072 dimensions to match.
 *
 * @param {GoogleGenerativeAI} genAI - Initialised Gemini client
 * @param {string}             text  - The text to embed
 * @returns {Promise<number[]>}       3072-dimensional float array
 */
async function generateEmbedding(genAI, text) {
  const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await embeddingModel.embedContent(text);
  // The SDK returns: { embedding: { values: number[] } }
  return result.embedding.values;
}

// ─── 5. Main Ingestion Function ───────────────────────────────────────────────

async function seedRules() {
  console.log("🌱 NutriFit AI — Nutritional Rules Ingestion Script");
  console.log("=".repeat(55));

  // 5a. Connect to MongoDB
  console.log("\n📡 Connecting to MongoDB Atlas...");
  await mongoose.connect(MONGO_URI, { family: 4 });
  console.log(`✅ Connected: ${mongoose.connection.host}`);

  // 5b. Initialise the Gemini client
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  console.log("✅ Gemini client initialised.");

  // 5c. Loop through each sample rule
  console.log(`\n🔄 Ingesting ${SAMPLE_RULES.length} rules...\n`);

  for (let i = 0; i < SAMPLE_RULES.length; i++) {
    const { ruleText, tags } = SAMPLE_RULES[i];

    console.log(`[${i + 1}/${SAMPLE_RULES.length}] Embedding rule: "${ruleText.slice(0, 60)}..."`);

    try {
      // Generate the 768-dim embedding for this rule's text
      const embedding = await generateEmbedding(genAI, ruleText);

      if (embedding.length !== 3072) {
        console.warn(
          `  ⚠  Unexpected embedding dimensions: ${embedding.length} (expected 3072). Skipping.`
        );
        continue;
      }

      // Upsert the rule to avoid duplicates on repeated runs
      // (match on ruleText; update embedding in case the model was retrained)
      await NutritionalRule.findOneAndUpdate(
        { ruleText },
        { ruleText, tags, embedding },
        { upsert: true, returnDocument: "after", runValidators: true }
      );

      console.log(`  ✅ Saved — ${embedding.length} dimensions, tags: [${tags.join(", ")}]`);
    } catch (err) {
      console.error(`  ❌ Failed to process rule ${i + 1}:`, err.message);
    }
  }

  // 5d. Done
  console.log("\n🎉 Seeding complete. Disconnecting...");
  await mongoose.disconnect();
  console.log("✅ Disconnected. Process exiting cleanly.");
  process.exit(0);
}

// ─── 6. Run ───────────────────────────────────────────────────────────────────

seedRules().catch((err) => {
  console.error("❌ Fatal error during seeding:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
