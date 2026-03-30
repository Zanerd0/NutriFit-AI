/**
 * @file instructorController.js
 * @description Business-logic handlers for all instructor-specific API endpoints.
 *
 * All functions in this controller assume the request has already passed through:
 *   1. verifyToken    — req.userId is a valid, authenticated user ID
 *   2. isInstructor   — req.user  is a User with role "Instructor"
 *
 * Controller Functions:
 *   getClients        — GET  /api/instructor/clients   → All Consumer-role users
 *   createWorkoutPlan — POST /api/instructor/plans     → Create a new WorkoutPlan
 *   getWorkoutPlans   — GET  /api/instructor/plans     → Plans created by this instructor
 */

const User        = require("../models/User");
const WorkoutPlan = require("../models/WorkoutPlan");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instructor/clients
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getClients
 * @description Fetch all users who hold the role "Consumer".
 *
 * Phase-1 implementation: every registered Consumer is visible to every
 * Instructor. A future update will introduce an explicit instructor↔consumer
 * assignment so each instructor only sees their own clients.
 *
 * Response shape: Array<{ _id, full_name, email, createdAt }>
 */
const getClients = async (req, res) => {
  try {
    // Find all Consumer-role users; strip the hashed password from the response
    const clients = await User.find({ role: "Consumer" }).select("-password -__v");

    res.status(200).json(clients);
  } catch (error) {
    console.error("getClients error:", error.message);
    res.status(500).json({ error: "Failed to fetch client list." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/instructor/plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createWorkoutPlan
 * @description Create and persist a new WorkoutPlan document.
 *
 * Expected request body:
 * {
 *   clientId:    string   — MongoDB ObjectId of the target Consumer
 *   title:       string   — Short plan label
 *   description: string   — (optional) Longer coaching notes
 *   exercises:   Array<{ exerciseName: string, sets: number, reps: number, duration?: number }>
 * }
 *
 * The `instructorId` is taken from `req.userId` (injected by verifyToken),
 * so the client can NEVER forge the plan's author.
 */
const createWorkoutPlan = async (req, res) => {
  try {
    const { clientId, title, description, exercises } = req.body;

    // ── Input Validation ─────────────────────────────────────────────────────
    if (!clientId || !title) {
      return res
        .status(400)
        .json({ error: "clientId and title are required fields." });
    }

    // Verify the target client exists AND is a Consumer.
    // This prevents plans being accidentally assigned to admins or other instructors.
    const client = await User.findById(clientId).select("role");
    if (!client || client.role !== "Consumer") {
      return res.status(404).json({
        error: "Client not found or is not a Consumer.",
      });
    }

    // ── Create Document ───────────────────────────────────────────────────────
    const newPlan = new WorkoutPlan({
      instructorId: req.userId,  // Sourced from verified JWT — tamper-proof
      clientId,
      title,
      description: description || "",
      exercises:   exercises   || [],
    });

    // Persist to MongoDB; Mongoose validates exercise sub-documents here
    const savedPlan = await newPlan.save();

    // 201 Created + the new document
    res.status(201).json({
      message: "Workout plan created successfully.",
      plan:    savedPlan,
    });
  } catch (error) {
    // Mongoose validation errors (e.g., missing sets/reps) surface here
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("createWorkoutPlan error:", error.message);
    res.status(500).json({ error: "Failed to create workout plan." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instructor/plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getWorkoutPlans
 * @description Fetch all workout plans created by the currently authenticated instructor.
 *
 * Uses `.populate()` to resolve the raw clientId ObjectRef into the actual
 * user document so the frontend can display client names without extra calls.
 *
 * Response shape: Array<WorkoutPlan with populated clientId { full_name, email }>
 */
const getWorkoutPlans = async (req, res) => {
  try {
    const plans = await WorkoutPlan.find({ instructorId: req.userId })
      .populate("clientId", "full_name email") // Replace ObjectId with user fields
      .sort({ createdAt: -1 });                // Newest plans first

    res.status(200).json(plans);
  } catch (error) {
    console.error("getWorkoutPlans error:", error.message);
    res.status(500).json({ error: "Failed to fetch workout plans." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = { getClients, createWorkoutPlan, getWorkoutPlans };
