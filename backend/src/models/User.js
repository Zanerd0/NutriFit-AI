const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  role: {
    type:    String,
    enum:    ["Consumer", "Dietician", "Instructor", "Admin"],
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
    type:    String,
    enum:    ["Lose Weight", "Gain Muscle", "Maintain Weight", "Improve Endurance", "General Fitness", null],
    default: null,
  },
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