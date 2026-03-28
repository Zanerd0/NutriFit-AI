const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  full_name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["Consumer", "Dietician", "Instructor", "Admin"], 
    default: "Consumer" 
  }
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