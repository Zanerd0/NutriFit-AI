/**

 * @file PlanAdherence.js

 * @description Per-day checklist adherence for diet and workout plans.

 */



const mongoose = require("mongoose");



const checklistItemSchema = new mongoose.Schema(

  {

    key: { type: String, required: true, trim: true },

    label: { type: String, required: true, trim: true },

    completed: { type: Boolean, default: false },

  },

  { _id: false }

);



const dailyEntrySchema = new mongoose.Schema(

  {

    date: { type: String, required: true, trim: true },

    items: { type: [checklistItemSchema], default: [] },

  },

  { _id: false }

);



const adherenceBlockSchema = new mongoose.Schema(

  {

    planId: { type: mongoose.Schema.Types.ObjectId, default: null },

    sourceSignature: { type: String, default: "" },

    entries: { type: [dailyEntrySchema], default: [] },

    updatedAt: { type: Date, default: null },

  },

  { _id: false }

);



const planAdherenceSchema = new mongoose.Schema(

  {

    userId: {

      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,

      unique: true,

    },

    diet: { type: adherenceBlockSchema, default: () => ({}) },

    workout: { type: adherenceBlockSchema, default: () => ({}) },

  },

  { timestamps: true }

);



module.exports = mongoose.model("PlanAdherence", planAdherenceSchema);

