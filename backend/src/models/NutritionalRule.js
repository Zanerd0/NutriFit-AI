/**
 * @file NutritionalRule.js
 * @description Mongoose model for a Nutritional Rule document.
 *
 * Each document stores a dietary/clinical rule as plain text alongside
 * a 3072-dimensional vector embedding (produced by Google's gemini-embedding-001
 * model). The embedding field enables MongoDB Atlas Vector Search so that
 * the RAG pipeline can retrieve the most semantically relevant rules for a
 * given user profile before passing them to the generative model.
 *
 * Atlas Vector Search index (must be created in Atlas UI or CLI):
 *   Index name  : nutrifit_vector_index
 *   Field       : embedding
 *   Dimensions  : 3072
 *   Similarity  : cosine
 */

const mongoose = require("mongoose");

const nutritionalRuleSchema = new mongoose.Schema(
  {
    /**
     * ruleText - The full text of the dietary/clinical rule.
     * This is the human-readable content that gets embedded and later
     * injected into the AI mega-prompt as a safety guardrail.
     * Example: "Patients with Type 2 Diabetes must limit refined carbohydrates..."
     */
    ruleText: {
      type: String,
      required: [true, "Rule text is required."],
      trim: true,
    },

    /**
     * tags - Categorical labels for this rule.
     * Useful for filtering / grouping rules outside of vector search.
     * Example: ["diabetes", "low-carb", "glycemic-control"]
     */
    tags: {
      type: [String],
      default: [],
    },

    /**
     * embedding - 3072-dimensional float vector produced by gemini-embedding-001.
     * Stored as an array of numbers so that Atlas Vector Search can index it
     * using the cosine similarity metric.
     *
     * ⚠  Do NOT change this length without re-generating all embeddings and
     *    updating the Atlas index definition to match the new dimension count.
     */
    embedding: {
      type: [Number],
      required: [true, "Embedding vector is required."],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length === 3072;
        },
        message: "Embedding must be exactly 3072 dimensions (gemini-embedding-001).",
      },
    },
  },
  {
    /**
     * timestamps: true → Mongoose automatically manages:
     *   createdAt  — when the rule was first ingested
     *   updatedAt  — when the rule or its embedding was last refreshed
     */
    timestamps: true,
  }
);

module.exports = mongoose.model("NutritionalRule", nutritionalRuleSchema);
