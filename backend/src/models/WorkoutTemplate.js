/**
 * @file WorkoutTemplate.js
 * @description Mongoose model for a pre-built workout template.
 *
 * A WorkoutTemplate is a reusable routine blueprint that instructors can
 * browse and assign to their clients. It is NOT a per-user document — it
 * lives in a shared collection and is read-only from the client's perspective.
 *
 * When an instructor assigns a template to a client they can customise the
 * sets/reps before saving; the customised version is persisted as a WorkoutPlan.
 *
 * Schema fields:
 *   name      — Human-readable label (e.g. "Fat Loss Circuit")
 *   goal_tag  — High-level goal category (e.g. "Weight Loss")
 *   exercises — Ordered list of base exercise prescriptions
 */

const mongoose = require("mongoose");

// ─── Base Exercise Sub-Schema ─────────────────────────────────────────────────
// Each entry defines the "default" prescription for an exercise.
// The instructor edits these before assigning to a client.

const baseExerciseSchema = new mongoose.Schema(
  {
    /**
     * exerciseName — The movement (e.g. "Burpee", "Barbell Row").
     */
    exerciseName: {
      type:     String,
      required: [true, "Exercise name is required."],
      trim:     true,
    },

    /**
     * baseSets — Default number of sets for this template.
     * Instructors can override this per-client in the assignment form.
     */
    baseSets: {
      type:     Number,
      required: [true, "baseSets is required."],
      min:      [1,    "baseSets must be at least 1."],
    },

    /**
     * baseReps — Default number of reps per set.
     * Instructors can override this per-client in the assignment form.
     */
    baseReps: {
      type:     Number,
      required: [true, "baseReps is required."],
      min:      [1,    "baseReps must be at least 1."],
    },
  },
  { _id: true } // Give each exercise its own _id for future operations
);

// ─── WorkoutTemplate Schema ───────────────────────────────────────────────────

const workoutTemplateSchema = new mongoose.Schema(
  {
    /**
     * name — Short, descriptive label shown to instructors when browsing.
     * Example: "Fat Loss Circuit", "Hypertrophy Builder", "Cardio Endurance"
     */
    name: {
      type:      String,
      required:  [true, "Template name is required."],
      trim:      true,
      maxlength: [100, "Template name cannot exceed 100 characters."],
    },

    /**
     * goal_tag — The fitness goal this template is designed for.
     * Used by the UI to display a badge/chip and help instructors pick the
     * right template based on their client's primary_goal.
     *
     * Example values: "Weight Loss", "Muscle Gain", "Cardio", "Endurance"
     */
    goal_tag: {
      type:     String,
      required: [true, "goal_tag is required."],
      trim:     true,
    },

    /**
     * exercises — The ordered list of base exercise prescriptions.
     * An instructor selects a template and can then adjust sets/reps in the
     * assignment UI before committing the plan to the database.
     */
    exercises: {
      type:    [baseExerciseSchema],
      default: [],
    },
  },
  {
    timestamps: true, // createdAt / updatedAt managed by Mongoose
  }
);

module.exports = mongoose.model("WorkoutTemplate", workoutTemplateSchema);
