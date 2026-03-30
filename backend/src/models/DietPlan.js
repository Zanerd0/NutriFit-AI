/**
 * @file DietPlan.js
 * @description Mongoose model for a Diet Plan document.
 *
 * A DietPlan is created by a Dietician and assigned to a Consumer (client).
 * It stores high-level metadata (title, description) together with a flexible
 * array of meal entries so that dieticians can capture any meal structure
 * without being locked into a rigid schema.
 *
 * Schema Relations:
 *   dieticianId  →  User (role: "Dietician")  — the plan creator
 *   clientId     →  User (role: "Consumer")   — the plan recipient
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