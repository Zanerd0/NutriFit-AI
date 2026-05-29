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
const DailyLog = require("../models/DailyLog");
const PlanAdherence = require("../models/PlanAdherence");
const {
  formatDateKey,
  mergeByKey,
  makeDietItemsFromPlan,
  getEntryForDate,
  migrateLegacyBlock,
} = require("../utils/adherenceHelpers");

const DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const isAiPlan = (plan) =>
  !!plan &&
  (plan.planType === "ai" ||
    (!!plan?.weekSchedule && typeof plan.weekSchedule === "object" && !plan?.title));

const getPlanClientId = (plan) => plan?.clientId || plan?.consumerId;

const assertLinkedClient = async (dieticianId, clientId) =>
  User.findOne({ _id: clientId, role: "Consumer", dieticianId });

const clearClientDietRequest = async (clientId) => {
  await User.findByIdAndUpdate(clientId, {
    dietPlanRequested: false,
    dietPlanRequestedAt: null,
    dietPlanRequestNotes: "",
  });
  await DietPlan.updateMany(
    { consumerId: clientId, sentToDietician: true },
    { $set: { sentToDietician: false, sentToDieticianAt: null } }
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dietician/clients
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getClients
 * @description Fetch only the Consumer users who have linked to the
 * currently authenticated Dietician (i.e. whose `dieticianId` field
 * matches the logged-in user's ID).
 *
 * This replaces the old Phase-1 approach of returning ALL consumers;
 * now each dietician sees only their own assigned clients.
 *
 * Response shape:  Array<{ _id, full_name, email, createdAt }>
 */
const getClients = async (req, res) => {
  try {
    // Filter: Consumer users whose dieticianId matches the logged-in dietician
    // Projection: exclude the hashed password — never send it to the client
    const clients = await User.find({
      role:        "Consumer",
      dieticianId: req.userId,   // Only this dietician's linked clients
    }).select("-password -__v");

    // Return the array (empty when no consumers have linked to this dietician yet)
    res.status(200).json(clients);
  } catch (error) {
    console.error("getClients error:", error.message);
    res.status(500).json({ error: "Failed to fetch client list." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dietician/pending-requests
// ─────────────────────────────────────────────────────────────────────────────
const getPendingDietRequests = async (req, res) => {
  try {
    const requests = await User.find({
      role: "Consumer",
      dieticianId: req.userId,
      dietPlanRequested: true,
    }).select("_id full_name email dietPlanRequestNotes dietPlanRequestedAt");

    const enriched = await Promise.all(
      requests.map(async (client) => {
        const aiSent = await DietPlan.findOne({
          consumerId: client._id,
          status: "Active",
          sentToDietician: true,
        }).select("_id sentToDieticianAt");
        return {
          ...client.toObject(),
          aiPlanSentForReview: !!aiSent,
        };
      })
    );

    res.status(200).json(enriched);
  } catch (error) {
    console.error("getPendingDietRequests error:", error.message);
    res.status(500).json({ error: "Failed to fetch pending diet requests." });
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
    const linked = await assertLinkedClient(req.userId, clientId);
    if (!linked) {
      return res.status(403).json({ error: "Client is not linked to you." });
    }

    const newPlan = new DietPlan({
      planType:    "custom",
      dieticianId: req.userId,
      clientId,
      consumerId:  clientId,
      title,
      description: description || "",
      meals:       meals       || [],
      status:      "Active",
    });

    // Persist to MongoDB; Mongoose will validate sub-documents (meals) here too
    const savedPlan = await newPlan.save();

    await clearClientDietRequest(clientId);

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
// GET /api/dietician/client-progress/:clientId
// ─────────────────────────────────────────────────────────────────────────────
const getClientProgress = async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await User.findOne({
      _id: clientId,
      role: "Consumer",
      dieticianId: req.userId,
    }).select("_id full_name email");

    if (!client) {
      return res.status(404).json({ error: "Client not found or not linked to you." });
    }

    const dateKey = req.query.date || formatDateKey(new Date());

    const [weightLogs, mealLogs, adherence, dietPlan] = await Promise.all([
      DailyLog.find({ userId: clientId, weight: { $ne: null } }, { date: 1, weight: 1 })
        .sort({ date: 1 })
        .lean(),
      DailyLog.find({ userId: clientId, meals: { $exists: true, $ne: [] } }, { date: 1, meals: 1 })
        .sort({ date: -1 })
        .limit(30)
        .lean(),
      PlanAdherence.findOne({ userId: clientId }).lean(),
      DietPlan.findOne({ consumerId: clientId, status: "Active" }).sort({ createdAt: -1 }).lean(),
    ]);

    const meals = mealLogs.flatMap((log) =>
      (log.meals || []).map((m) => ({
        date: log.date,
        foodItem: m.foodItem,
        estimatedCalories: m.estimatedCalories,
      }))
    );

    let dietItems = [];
    if (dietPlan && adherence?.diet) {
      const block = migrateLegacyBlock({ ...adherence.diet });
      const built = makeDietItemsFromPlan(dietPlan, dateKey);
      const entry = getEntryForDate(block, dateKey);
      dietItems = mergeByKey(entry?.items, built.items);
    }

    res.status(200).json({
      client,
      date: dateKey,
      weightLogs,
      meals,
      dietAdherence: { date: dateKey, items: dietItems },
      workoutAdherence: adherence?.workout || { items: [] },
    });
  } catch (error) {
    console.error("getClientProgress error:", error.message);
    res.status(500).json({ error: "Failed to fetch client progress." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dietician/clients/:clientId/plans
// ─────────────────────────────────────────────────────────────────────────────
const getClientPlans = async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await assertLinkedClient(req.userId, clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found or not linked to you." });
    }

    const [aiPlan, customPlans] = await Promise.all([
      DietPlan.findOne({
        consumerId: clientId,
        status: "Active",
        weekSchedule: { $exists: true, $ne: null },
      }).sort({ createdAt: -1 }),
      DietPlan.find({
        clientId,
        dieticianId: req.userId,
        planType: "custom",
      }).sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      client: {
        _id: client._id,
        full_name: client.full_name,
        email: client.email,
      },
      aiPlan: aiPlan || null,
      customPlans,
    });
  } catch (error) {
    console.error("getClientPlans error:", error.message);
    res.status(500).json({ error: "Failed to fetch client plans." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/dietician/plans/:planId
// ─────────────────────────────────────────────────────────────────────────────
const updateDietPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { title, description, meals, weekSchedule } = req.body;

    const plan = await DietPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found." });

    const clientId = getPlanClientId(plan);
    const client = await assertLinkedClient(req.userId, clientId);
    if (!client) {
      return res.status(403).json({ error: "You cannot edit this plan." });
    }

    if (isAiPlan(plan)) {
      if (weekSchedule && typeof weekSchedule === "object") {
        for (const day of DAYS) {
          if (!weekSchedule[day]) {
            return res.status(400).json({ error: `Missing schedule for ${day}.` });
          }
        }
        plan.weekSchedule = weekSchedule;
      }
      plan.sentToDietician = false;
      plan.sentToDieticianAt = null;
    } else {
      if (!title?.trim()) {
        return res.status(400).json({ error: "Plan title is required." });
      }
      plan.title = title.trim();
      plan.description = description?.trim() || "";
      plan.meals = Array.isArray(meals) ? meals : [];
    }

    const saved = await plan.save();
    await clearClientDietRequest(clientId);

    res.status(200).json({
      message: "Diet plan updated successfully.",
      plan: saved,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("updateDietPlan error:", error.message);
    res.status(500).json({ error: "Failed to update diet plan." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/dietician/plans/:planId
// ─────────────────────────────────────────────────────────────────────────────
const deleteDietPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await DietPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found." });

    const clientId = getPlanClientId(plan);
    const client = await assertLinkedClient(req.userId, clientId);
    if (!client) {
      return res.status(403).json({ error: "You cannot delete this plan." });
    }

    if (!isAiPlan(plan) && String(plan.dieticianId) !== String(req.userId)) {
      return res.status(403).json({ error: "You can only delete your own custom plans." });
    }

    await DietPlan.findByIdAndDelete(planId);

    res.status(200).json({ message: "Diet plan deleted successfully." });
  } catch (error) {
    console.error("deleteDietPlan error:", error.message);
    res.status(500).json({ error: "Failed to delete diet plan." });
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

module.exports = {
  getClients,
  getPendingDietRequests,
  getClientPlans,
  getClientProgress,
  createDietPlan,
  updateDietPlan,
  deleteDietPlan,
  getDietPlans,
};
