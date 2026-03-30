/**
 * @file consumerController.js
 * @description Business-logic handlers for all consumer-specific API endpoints.
 *
 * All functions in this controller assume the request has already passed through:
 *   1. verifyToken  — req.userId is a valid, authenticated user ID
 *   2. isConsumer   — req.user  is a User with role "Consumer"
 *
 * Controller Functions:
 *   getMyDietPlans    — GET   /api/consumer/diet-plans     → Consumer's assigned diet plans
 *   getMyWorkoutPlans — GET   /api/consumer/workout-plans  → Consumer's assigned workout plans
 *   updateProfile     — PATCH /api/consumer/profile        → Update health metrics
 */

const User        = require("../models/User");
const DietPlan    = require("../models/DietPlan");
const WorkoutPlan = require("../models/WorkoutPlan");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/consumer/diet-plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getMyDietPlans
 * @description Fetch all DietPlan documents where clientId matches the
 * logged-in consumer's ID. Uses populate() to resolve the dietician's name
 * so the frontend can display "Plan by Dr. X" without a second request.
 *
 * Response shape: Array<DietPlan with populated dieticianId { full_name, email }>
 */
const getMyDietPlans = async (req, res) => {
  try {
    // req.userId is set by verifyToken and validated by isConsumer
    const plans = await DietPlan.find({ clientId: req.userId })
      // Replace the raw dieticianId ObjectId with the dietician's name and email
      .populate("dieticianId", "full_name email")
      // Most recently created plan appears first
      .sort({ createdAt: -1 });

    res.status(200).json(plans);
  } catch (error) {
    console.error("getMyDietPlans error:", error.message);
    res.status(500).json({ error: "Failed to fetch your diet plans." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/consumer/workout-plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getMyWorkoutPlans
 * @description Fetch all WorkoutPlan documents where clientId matches the
 * logged-in consumer's ID. Uses populate() to resolve the instructor's name.
 *
 * Response shape: Array<WorkoutPlan with populated instructorId { full_name, email }>
 */
const getMyWorkoutPlans = async (req, res) => {
  try {
    const plans = await WorkoutPlan.find({ clientId: req.userId })
      .populate("instructorId", "full_name email")
      .sort({ createdAt: -1 });

    res.status(200).json(plans);
  } catch (error) {
    console.error("getMyWorkoutPlans error:", error.message);
    res.status(500).json({ error: "Failed to fetch your workout plans." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/consumer/profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * updateProfile
 * @description Allow the consumer to update their health profile metrics.
 *
 * Only the fields explicitly listed in ALLOWED_FIELDS can be updated.
 * All other fields in the request body are silently ignored, preventing
 * consumers from escalating their role or modifying protected fields.
 *
 * Expected request body (all fields optional):
 * {
 *   weight: number   — Body weight in kg
 *   height: number   — Body height in cm
 *   goal:   string   — One of the goal enum values
 * }
 */
const updateProfile = async (req, res) => {
  try {
    // Whitelist of fields a consumer is permitted to update on their own document
    const ALLOWED_FIELDS = ["weight", "height", "goal"];

    // Build the update object — only include keys that are whitelisted AND
    // actually present in the request body
    const updates = {};
    ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update." });
    }

    // findByIdAndUpdate with { new: true } returns the updated document
    // runValidators ensures the goal enum is validated on update operations
    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password -__v");

    res.status(200).json({
      message: "Profile updated successfully.",
      user:    updatedUser,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("updateProfile error:", error.message);
    res.status(500).json({ error: "Failed to update profile." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = { getMyDietPlans, getMyWorkoutPlans, updateProfile };
