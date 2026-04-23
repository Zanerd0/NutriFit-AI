/**
 * @file DietPlan.js
 * @description Mongoose model for a Diet Plan document.
 *
 * Phase 1 — Dietician-created plan assigned to a Consumer.
 * Phase 2 — Extended to support AI-generated weekly schedules:
 *   • userId        → the Consumer this plan belongs to
 *   • status        → lifecycle state of the plan
 *   • week_schedule → raw JSON blob returned by the AI (Schema.Types.Mixed)
 *
 * Schema Relations:
 *   userId       →  User (role: "Consumer")   — plan owner  [Phase 2]
 *   dieticianId  →  User (role: "Dietician")  — plan creator
 *   clientId     →  User (role: "Consumer")   — plan recipient (Phase 1 alias)
 */

const mongoose = require("mongoose");

// ─── Meal Sub-Schema ──────────────────────────────────────────────────────────
// Each element in the `meals` array describes one meal slot for the day.
// We define this as a nested sub-document so Mongoose validates it properly.

const mealSchema = new mongoose.Schema(
  {
    /**
     * mealTime - When this meal should be eaten.
     * Examples: "Breakfast", "Morning Snack", "Lunch", "Dinner"
     */
    mealTime: {
      type: String,
      required: [true, "Meal time is required (e.g., Breakfast, Lunch)."],
      trim: true,
    },

    /**
     * foodItems - A free-text description of what to eat for this meal.
     * Kept as a simple string for flexibility; could be an array in v2.
     * Example: "2 eggs, 1 slice whole-grain toast, 1 glass orange juice"
     */
    foodItems: {
      type: String,
      required: [true, "Food items description is required."],
      trim: true,
    },
  },
  { _id: true } // Each meal gets its own sub-document _id for future CRUD ops
);

// ─── Diet Plan Schema ─────────────────────────────────────────────────────────

const dietPlanSchema = new mongoose.Schema(
  {
    // ── Phase 2: AI Plan Fields ──────────────────────────────────────────────

    /**
     * userId - The Consumer this plan belongs to.
     * Used by AI-generation routes to associate the plan with its owner
     * directly, without going through the dieticianId → clientId chain.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * status - Lifecycle state of the diet plan.
     *   'No_Plan'   → no plan has been generated yet
     *   'Active'    → currently in use by the consumer
     *   'Completed' → the scheduled week has passed
     *   'Archived'  → manually archived, no longer active
     */
    status: {
      type: String,
      enum: ["No_Plan", "Active", "Completed", "Archived"],
      default: "Active",
    },

    /**
     * week_schedule - Raw JSON structure returned by the AI planner.
     * Stored as Schema.Types.Mixed so any object/array shape can be persisted
     * without a rigid sub-document definition.
     * Example shape: { monday: { breakfast: "...", lunch: "..." }, tuesday: … }
     */
    week_schedule: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Phase 1: Dietician-Created Plan Fields ───────────────────────────────

    /**
     * dieticianId - Reference to the User who created this plan.
     * Automatically populated in queries via Model.populate("dieticianId").
     */
    dieticianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A Dietician must be associated with this plan."],
    },

    /**
     * clientId - Reference to the Consumer this plan is assigned to.
     * In Phase 1, dieticians can pick any Consumer; future phases will
     * introduce an explicit assignment/acceptance workflow.
     */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A client (Consumer) must be assigned to this plan."],
    },

    /** title - Short descriptive label for the plan (e.g., "Weight Loss Week 1") */
    title: {
      type: String,
      required: [true, "Diet plan title is required."],
      trim: true,
      maxlength: [120, "Title cannot exceed 120 characters."],
    },

    /** description - Longer free-text explaining the general goals or notes. */
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters."],
      default: "",
    },

    /**
     * meals - An ordered array of meal entries for this plan.
     * Each entry uses the mealSchema sub-document defined above.
     */
    meals: {
      type: [mealSchema],
      default: [], // A plan can be saved with no meals initially
    },
  },
  {
    /**
     * timestamps: true  →  Mongoose automatically adds:
     *   createdAt: Date — when the document was first saved
     *   updatedAt: Date — when the document was last modified
     */
    timestamps: true,
  }
);

module.exports = mongoose.model("DietPlan", dietPlanSchema);