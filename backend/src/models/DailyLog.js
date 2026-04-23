/**
 * @file DailyLog.js
 * @description Mongoose model for a Consumer's daily progress entry.
 *
 * Each document represents a single day's snapshot for one consumer:
 *   • weight      → self-reported body weight for the day
 *   • meals       → food items recognised by the AI Vision API, each storing
 *                   the food name and the AI-estimated calorie count
 *
 * Schema Relations:
 *   userId  →  User (role: "Consumer")  — the log owner
 */

const mongoose = require("mongoose");

// ─── Meal Sub-Schema ──────────────────────────────────────────────────────────
// Each entry in the `meals` array represents one food item scanned by the
// AI Vision API. Defined as a sub-document so Mongoose validates it properly.

const mealEntrySchema = new mongoose.Schema(
  {
    /**
     * foodItem - Human-readable name of the recognised food.
     * Example: "Grilled Chicken Breast", "White Rice (1 cup)"
     */
    foodItem: {
      type: String,
      required: [true, "Food item name is required."],
      trim: true,
    },

    /**
     * estimatedCalories - AI-estimated calorie count for this item.
     * Stored as a Number (kcal); the AI may return a float, which is fine.
     */
    estimatedCalories: {
      type: Number,
      required: [true, "Estimated calories are required."],
      min: [0, "Calories cannot be negative."],
    },
  },
  { _id: true } // Each meal entry gets its own _id for future per-item CRUD
);

// ─── Daily Log Schema ─────────────────────────────────────────────────────────

const dailyLogSchema = new mongoose.Schema(
  {
    /**
     * userId - The Consumer this log entry belongs to.
     * Required so every log is traceable to its owner.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A User (Consumer) must be associated with this log."],
    },

    /**
     * date - Calendar date of the log entry.
     * Defaults to the moment the document is created (today).
     */
    date: { type: Date, default: Date.now },

    /**
     * weight - Consumer's self-reported body weight for this day (kg).
     * Optional; consumers may log meals without weighing themselves.
     */
    weight: { type: Number, default: null },

    /**
     * meals - Array of food items scanned by the AI Vision API during the day.
     * Each entry uses the mealEntrySchema sub-document defined above.
     */
    meals: {
      type: [mealEntrySchema],
      default: [],
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

module.exports = mongoose.model("DailyLog", dailyLogSchema);