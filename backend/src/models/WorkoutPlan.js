/**
 * @file WorkoutPlan.js
 * @description Mongoose model for a Workout Plan document.
 *
 * Phase 1 — Instructor-created plan assigned to a Consumer.
 * Phase 2 — Extended to support direct consumer ownership and instructor
 *            attribution without requiring the Phase 1 clientId chain:
 *   • userId     → the Consumer this plan belongs to
 *   • assignedBy → the Instructor who created/assigned the plan
 *
 * Schema Relations:
 *   userId       →  User (role: "Consumer")   — plan owner        [Phase 2]
 *   assignedBy   →  User (role: "Instructor")  — assigning instructor [Phase 2]
 *   instructorId →  User (role: "Instructor")  — plan creator (Phase 1)
 *   clientId     →  User (role: "Consumer")    — plan recipient   (Phase 1)
 */

const mongoose = require("mongoose");

// ─── Exercise Sub-Schema ──────────────────────────────────────────────────────
// Each element in the `exercises` array describes one movement in the plan.
// Defined as a nested sub-document so Mongoose validates each entry properly.

const exerciseSchema = new mongoose.Schema(
  {
    /**
     * exerciseName - The name of the movement.
     * Example: "Barbell Back Squat", "Push-Up", "Plank"
     */
    exerciseName: {
      type: String,
      required: [true, "Exercise name is required."],
      trim: true,
    },

    /**
     * sets - Number of working sets to perform.
     * Example: 3
     */
    sets: {
      type: Number,
      required: [true, "Number of sets is required."],
      min: [1, "Sets must be at least 1."],
    },

    /**
     * reps - Number of repetitions per set.
     * Example: 10
     */
    reps: {
      type: Number,
      required: [true, "Number of reps is required."],
      min: [1, "Reps must be at least 1."],
    },

    /**
     * duration - Optional time-based hold/work duration in seconds.
     * Used for timed exercises like planks, rests, or cardio intervals.
     * Example: 60 (seconds)
     */
    duration: {
      type: Number,
      default: null,
    },
  },
  { _id: true } // Each exercise gets its own sub-document _id for future CRUD ops
);

// ─── Workout Plan Schema ──────────────────────────────────────────────────────

const workoutPlanSchema = new mongoose.Schema(
  {
    // ── Phase 2: Consumer Ownership & Instructor Attribution ─────────────────

    /**
     * userId - The Consumer this plan belongs to.
     * Mirrors the pattern used by DietPlan.userId for consistency across
     * AI-generated and instructor-assigned plans.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * assignedBy - The Instructor (User) who created and assigned this plan.
     * Kept separate from the Phase 1 instructorId to allow routes that use
     * either field without a breaking migration.
     */
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Phase 1: Instructor-Created Plan Fields ───────────────────────────────

    /**
     * instructorId - Reference to the User who created this plan.
     * Automatically populated in queries via Model.populate("instructorId").
     */
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "An Instructor must be associated with this plan."],
    },

    /**
     * clientId - Reference to the Consumer this plan is assigned to.
     * Phase 1: any registered Consumer is eligible. Future phases will
     * introduce an explicit assignment/acceptance workflow.
     */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A client (Consumer) must be assigned to this plan."],
    },

    /** title - Short descriptive label (e.g., "Beginner Full-Body Week 1") */
    title: {
      type: String,
      required: [true, "Workout plan title is required."],
      trim: true,
      maxlength: [120, "Title cannot exceed 120 characters."],
    },

    /** description - Free-text goals, notes, or coaching cues for the client. */
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters."],
      default: "",
    },

    /**
     * exercises - Ordered array of exercise entries.
     * Each entry uses the exerciseSchema sub-document defined above.
     */
    exercises: {
      type: [exerciseSchema],
      default: [], // A plan can be saved with no exercises initially
    },
  },
  {
    /**
     * timestamps: true → Mongoose automatically manages:
     *   createdAt: Date — when the document was first saved
     *   updatedAt: Date — when the document was last modified
     */
    timestamps: true,
  }
);

module.exports = mongoose.model("WorkoutPlan", workoutPlanSchema);
