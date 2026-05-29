const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["Consumer", "Dietician", "Instructor", "Admin"],
    default: "Consumer",
  },

  // ── Health Profile (Consumer-specific, optional fields) ──────────────────
  // These fields are only meaningful for Consumer-role users. They are kept on
  // the User document (rather than a separate Profile collection) to avoid an
  // extra DB query on every consumer dashboard load.

  /** weight - Body weight in kilograms, stored as a float */
  weight: { type: Number, default: null },

  /** height - Body height in centimetres, stored as a float */
  height: { type: Number, default: null },

  /**
   * goal - The consumer's current fitness intention.
   * Constrained to a fixed enum so the frontend can render meaningful labels
   * without free-text parsing.
   */
  goal: {
    type: String,
    enum: ["Lose Weight", "Gain Muscle", "Maintain Weight", "Improve Endurance", "General Fitness", null],
    default: null,
  },

  // ── Phase 2: Health Metrics ───────────────────────────────────────────────

  /** age - Consumer's age in whole years (used by AI profile generator) */
  age: { type: Number, default: null },

  /**
   * primary_goal - High-level fitness goal label produced/consumed by the AI.
   * Kept as a free String (e.g., 'Weight Loss', 'Muscle Gain') so the AI
   * response can be stored verbatim without enum constraints.
   */
  primary_goal: { type: String, default: null },

  /**
   * dietary_preferences - Eating-pattern tags used to personalise AI plans.
   * Example: ['Keto', 'Vegan'] or ['Halal', 'Gluten-Free'].
   * Array so multiple tags can coexist.
   */
  dietary_preferences: { type: [String], default: [] },

  // ── Phase 2: Professional Links ───────────────────────────────────────────
  // Self-referencing ObjectIds that link a Consumer to their assigned
  // professionals. Both default to null until a linkage is made.

  /**
   * dieticianId - The Dietician (User) currently managing this consumer's
   * nutrition. Populated via Model.populate("dieticianId").
   */
  dieticianId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },

  /**
   * instructorId - The Instructor (User) currently managing this consumer's
   * workout routine. Populated via Model.populate("instructorId").
   */
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },

  // ── Phase 2: Subscription State ───────────────────────────────────────────

  /**
   * isPremium - True when the user holds an active paid subscription.
   * Set by the payment / admin workflow; defaults to false (free tier).
   */
  isPremium: { type: Boolean, default: false },

  /**
   * subscriptionExpiry - UTC timestamp when the current premium period lapses.
   * Null for free-tier users or when no expiry has been explicitly set.
   */
  subscriptionExpiry: { type: Date, default: null },

  // ── Workout Request (set by Consumer, read by Instructor) ─────────────────
  /**
   * workoutRequested — True when the Consumer has sent a "request workout plan"
   * signal to their connected Instructor. Cleared when the instructor assigns a plan.
   */
  workoutRequested:    { type: Boolean, default: false },
  workoutRequestedAt:  { type: Date,    default: null  },
  workoutRequestNotes: { type: String,  default: ""   },

  // ── Diet Request (set by Consumer, read by Dietician) ─────────────────────
  dietPlanRequested:      { type: Boolean, default: false },
  dietPlanRequestedAt:    { type: Date,    default: null  },
  dietPlanRequestNotes:   { type: String,  default: ""    },

}, { timestamps: true });

// Hash password before saving to database
// NOTE: In Mongoose 7+, async pre-hooks do NOT receive a `next` callback.
// Mongoose resolves the returned Promise automatically. Use `return` to exit early.
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return; // Exit early if password unchanged
  this.password = await bcrypt.hash(this.password, 10);
});

// Helper method to check password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);