/**
 * @file dieticianController.js
 * @description Business-logic handlers for all dietician-specific API endpoints.
 *
 * All functions in this controller assume the request has already passed through:
 *   1. verifyToken   — req.userId is guaranteed to be a valid, authenticated user ID
 *   2. isDietician   — req.user  is guaranteed to be a User with role "Dietician"
 *
 * Controller Functions:
 *   getClients     — GET  /api/dietician/clients      → All Consumer-role users
 *   createDietPlan — POST /api/dietician/plans        → Create a new DietPlan
 *   getDietPlans   — GET  /api/dietician/plans        → Plans created by this dietician
 */

const User     = require("../models/User");
const DietPlan = require("../models/DietPlan");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dietician/clients
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getClients
 * @description Fetch all users who hold the role "Consumer".
 *
 * In the current Phase-1 implementation every registered Consumer is visible
 * to every Dietician. A future update will introduce an explicit
 * dietician↔consumer assignment so each dietician only sees their own clients.
 *
 * Response shape:  Array<{ _id, full_name, email, createdAt }>
 */
const getClients = async (req, res) => {
  try {
    // Query: find all users whose role is "Consumer"
    // Projection: exclude the hashed password — never send it to the client
    const clients = await User.find({ role: "Consumer" }).select(
      "-password -__v"
    );

    // Return the array (may be empty if no Consumers have registered yet)
    res.status(200).json(clients);
  } catch (error) {
    console.error("getClients error:", error.message);
    res.status(500).json({ error: "Failed to fetch client list." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/dietician/plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createDietPlan
 * @description Create and persist a new DietPlan document.
 *
 * Expected request body:
 * {
 *   clientId:    string   — MongoDB ObjectId of the target Consumer
 *   title:       string   — Short plan label
 *   description: string   — (optional) Longer goal/notes text
 *   meals:       Array<{ mealTime: string, foodItems: string }>  — (optional)
 * }
 *
 * The `dieticianId` is taken from `req.userId` (injected by verifyToken),
 * so the client can never forge the plan's author.
 */
const createDietPlan = async (req, res) => {
  try {
    const { clientId, title, description, meals } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    // clientId and title are the minimum required fields to create a valid plan
    if (!clientId || !title) {
      return res
        .status(400)
        .json({ error: "clientId and title are required fields." });
    }

    // Verify the target client actually exists and is a Consumer.
    // This prevents a dietician from accidentally assigning plans to admins etc.
    const client = await User.findById(clientId).select("role");
    if (!client || client.role !== "Consumer") {
      return res.status(404).json({
        error: "Client not found or is not a Consumer.",
      });
    }

    // ── Create Document ──────────────────────────────────────────────────────
    const newPlan = new DietPlan({
      dieticianId: req.userId,   // Sourced from the verified JWT — tamper-proof
      clientId,
      title,
      description: description || "",
      meals:       meals       || [],
    });

    // Persist to MongoDB; Mongoose will validate sub-documents (meals) here too
    const savedPlan = await newPlan.save();

    // ── Response ─────────────────────────────────────────────────────────────
    // 201 Created + the newly created plan document
    res.status(201).json({
      message: "Diet plan created successfully.",
      plan:    savedPlan,
    });
  } catch (error) {
    // Mongoose validation errors (e.g., missing mealTime in an entry) land here
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("createDietPlan error:", error.message);
    res.status(500).json({ error: "Failed to create diet plan." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dietician/plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getDietPlans
 * @description Fetch all diet plans created by the currently authenticated dietician.
 *
 * Uses `.populate()` to replace the raw ObjectId references with the actual
 * user documents so the frontend can display consumer names without extra calls.
 *
 * Response shape: Array<DietPlan with populated clientId { full_name, email }>
 */
const getDietPlans = async (req, res) => {
  try {
    const plans = await DietPlan.find({ dieticianId: req.userId })
      // Populate the client's name and email so the dashboard can show them
      .populate("clientId", "full_name email")
      // Newest plans first
      .sort({ createdAt: -1 });

    res.status(200).json(plans);
  } catch (error) {
    console.error("getDietPlans error:", error.message);
    res.status(500).json({ error: "Failed to fetch diet plans." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = { getClients, createDietPlan, getDietPlans };
