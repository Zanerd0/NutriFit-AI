/**
 * @file models/DietPlan.js
 * @description Diet plans: AI-generated (weekSchedule) and dietician custom (meals list).
 */

const mongoose = require("mongoose");

const mealEntrySchema = new mongoose.Schema(
  {
    mealTime:  { type: String, trim: true, default: "" },
    foodItems: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const dietPlanSchema = new mongoose.Schema(
  {
    planType: {
      type: String,
      enum: ["ai", "custom"],
      default: "ai",
    },
    consumerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dieticianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    title:       { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    meals:       { type: [mealEntrySchema], default: [] },
    weekSchedule: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["Active", "Archived"],
      default: "Active",
    },
    sentToDietician:    { type: Boolean, default: false },
    sentToDieticianAt:  { type: Date,    default: null  },
    reviewRequestedBy:  {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

dietPlanSchema.index({ consumerId: 1, status: 1 });
dietPlanSchema.index({ clientId: 1, dieticianId: 1 });
dietPlanSchema.index({ dieticianId: 1, createdAt: -1 });

module.exports = mongoose.model("DietPlan", dietPlanSchema);
