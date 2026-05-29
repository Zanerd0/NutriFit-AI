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
     * Example: "Barbell Back Squat", "Push-Up", "Plank", "Running"
     */
    exerciseName: {
      type: String,
      required: [true, "Exercise name is required."],
      trim: true,
    },

    /**
     * metricType - Describes what unit/format the activity uses.
     * "sets_reps"  : classic sets × reps (e.g. 3 sets × 10 reps)
     * "sets_time"  : sets × duration in seconds (e.g. 3 × 60s plank)
     * "distance"   : a single distance value (e.g. 5 km run)
     * "time"       : a single total duration in minutes (e.g. 30 min jog)
     * "laps"       : a number of laps (e.g. 10 pool laps)
     * "custom"     : instructor writes whatever they want in `customMetric`
     */
    metricType: {
      type: String,
      enum: ["sets_reps", "sets_time", "distance", "time", "laps", "custom"],
      default: "sets_reps",
    },

    // ── Sets × Reps fields (metricType: "sets_reps") ────────────────────────────────
    sets: { type: Number, default: null },
    reps: { type: Number, default: null },

    // ── Sets × Time fields (metricType: "sets_time") ───────────────────────────────
    durationSecs: { type: Number, default: null }, // seconds per set

    // ── Distance (metricType: "distance") ───────────────────────────────────────────
    distanceValue: { type: Number, default: null },
    distanceUnit:  { type: String, default: "km", enum: ["km", "miles", "meters"] },

    // ── Time (metricType: "time") ────────────────────────────────────────────────────
    timeMinutes: { type: Number, default: null },

    // ── Laps (metricType: "laps") ─────────────────────────────────────────────────────
    laps: { type: Number, default: null },

    // ── Custom (metricType: "custom") ──────────────────────────────────────────────────
    customMetric: { type: String, default: "" }, // e.g. "3 rounds of 400m sprint"

    /**
     * notes - Optional instructor notes per exercise (form cues, warnings, video links).
     */
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Exercise notes cannot exceed 500 characters."],
      default: "",
    },
  },
  { _id: true }
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
