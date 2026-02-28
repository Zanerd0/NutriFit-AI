const mongoose = require("mongoose");

const dailyLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, default: Date.now },
  weight: { type: Number },
  // Changed to Array<Object> for Food Recognition metadata [cite: 713]
  meals: [{
    name: String,
    calories: Number,
    protein: Number,
    carbs: Number,
    fats: Number,
    image_url: String,
    verified: { type: Boolean, default: false }
  }]
});

module.exports = mongoose.model("DailyLog", dailyLogSchema);