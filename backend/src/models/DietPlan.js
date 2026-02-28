const mongoose = require("mongoose");

const dietPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { 
    type: String, 
    enum: ["Active", "Completed", "Archived"], 
    default: "Active" 
  },
  // Stores the AI JSON structure
  week_schedule: { type: Object, required: true } 
}, { timestamps: true });

module.exports = mongoose.model("DietPlan", dietPlanSchema);