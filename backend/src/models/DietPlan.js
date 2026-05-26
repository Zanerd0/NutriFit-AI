/**
 * @file models/DietPlan.js
 * @description Mongoose model for an AI-generated Diet Plan document.
 *
 * This schema is designed exclusively for the RAG generation pipeline.
 * It stores the consumer's identity, the plan's lifecycle status, and the
 * full 7-day JSON schedule produced by the generative AI model.
 *
 * Schema Relations:
 *   consumerId  →  User (role: "Consumer")  — the owner of this plan
 *
 * Field Notes:
 *   weekSchedule  — Schema.Types.Mixed so any AI-generated JSON shape can be
 *                   persisted without a rigid sub-document definition.
 *                   Expected shape from the AI:
 *                   {
 *                     monday:    { breakfast: "...", lunch: "...", dinner: "..." },
 *                     tuesday:   { ... },
 *                     ...
 *                     sunday:    { ... }
 *                   }
 */

const mongoose = require("mongoose");

// ─── Diet Plan Schema ─────────────────────────────────────────────────────────

const dietPlanSchema = new mongoose.Schema(
  {
    /**
     * consumerId - The Consumer this AI-generated plan belongs to.
     * Required so every plan can be associated back to a specific user
     * for retrieval, display, and archiving operations.
     */
    consumerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A Consumer ID is required to generate a diet plan."],
    },

    /**
     * status - Lifecycle state of the AI-generated diet plan.
     *   'Active'   → the current plan in use by the consumer
     *   'Archived' → a previous plan, kept for history/comparison
     *
     * When a new plan is generated for a consumer, the application should
     * set any existing 'Active' plans for that consumer to 'Archived' first.
     */
    status: {
      type: String,
      enum: {
        values: ["Active", "Archived"],
        message: "Status must be either 'Active' or 'Archived'.",
      },
      default: "Active",
    },

    /**
     * weekSchedule - The full 7-day meal plan returned by the AI.
     * Stored as Schema.Types.Mixed so the raw JSON object can be persisted
     * without a rigid Mongoose sub-document definition. This gives maximum
     * flexibility if the AI response shape evolves over time.
     *
     * Expected structure (set by the mega-prompt in dietPlanController.js):
     * {
     *   monday:    { breakfast: String, lunch: String, dinner: String },
     *   tuesday:   { breakfast: String, lunch: String, dinner: String },
     *   wednesday: { breakfast: String, lunch: String, dinner: String },
     *   thursday:  { breakfast: String, lunch: String, dinner: String },
     *   friday:    { breakfast: String, lunch: String, dinner: String },
     *   saturday:  { breakfast: String, lunch: String, dinner: String },
     *   sunday:    { breakfast: String, lunch: String, dinner: String }
     * }
     */
    weekSchedule: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    /**
     * createdAt - When this plan was generated.
     * Explicitly defined (rather than relying on Mongoose timestamps option)
     * so the field is always present in the document from creation time.
     */
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // versionKey: false keeps the __v field out of documents for a cleaner API response
    versionKey: false,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Compound index: quickly find the active plan for a given consumer
dietPlanSchema.index({ consumerId: 1, status: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = mongoose.model("DietPlan", dietPlanSchema);