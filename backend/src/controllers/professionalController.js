/**
 * @file professionalController.js
 * @description Controller for the professionals directory and the Premium Hub
 * assignment endpoints.
 *
 * Controller Functions:
 *   getProfessionals     — GET  /api/professionals                        → All Dieticians + Instructors
 *   getMyClients         — GET  /api/professional/clients                 → Linked clients + compliance
 *   requestInstructor    — POST /api/professionals/request-instructor     → Random instructor assignment
 *   requestDietician     — POST /api/professionals/request-dietician      → Diet plan review request
 */

const User          = require("../models/User");
const DailyLog      = require("../models/DailyLog");
const DietPlan      = require("../models/DietPlan");
const WorkoutPlan   = require("../models/WorkoutPlan");
const PlanAdherence = require("../models/PlanAdherence");
const { computeTwoDayAdherenceFlag } = require("../utils/adherenceHelpers");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/professionals/status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getConnectionStatus
 * @description Returns the current dietician and instructor connection status
 * for the authenticated Consumer. The frontend uses this to update the
 * ProfessionalHub UI without a full page reload.
 *
 * Response 200:
 *   {
 *     dietician:  { status: "none" | "connected", name: string },
 *     instructor: { status: "none" | "connected", name: string },
 *   }
 */
const getConnectionStatus = async (req, res) => {
  try {
    // req.userId is set by verifyToken; isConsumer has validated the role.
    const consumer = await User.findById(req.userId)
      .select("dieticianId instructorId")
      .populate("dieticianId",  "full_name")
      .populate("instructorId", "full_name");

    if (!consumer) {
      return res.status(404).json({ error: "Consumer not found." });
    }

    return res.status(200).json({
      dietician: {
        status: consumer.dieticianId  ? "connected" : "none",
        name:   consumer.dieticianId?.full_name  ?? "",
      },
      instructor: {
        status: consumer.instructorId ? "connected" : "none",
        name:   consumer.instructorId?.full_name ?? "",
      },
    });
  } catch (error) {
    console.error("getConnectionStatus error:", error.message);
    return res.status(500).json({ error: "Failed to fetch connection status." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/professionals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getProfessionals
 * @description Returns all registered Dieticians and Instructors.
 * Sensitive fields (password, __v) are excluded via .select() projection.
 */
const getProfessionals = async (req, res) => {
  try {
    const professionals = await User.find({
      role: { $in: ["Dietician", "Instructor"] },
    }).select("-password -__v");

    res.status(200).json(professionals);
  } catch (error) {
    console.error("getProfessionals error:", error.message);
    res.status(500).json({ error: "Failed to fetch professionals list." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/professional/clients
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getMyClients
 * @description Returns all Consumer users linked to the authenticated
 * professional, enriched with a hasRecentLogs compliance boolean.
 */
const getMyClients = async (req, res) => {
  try {
    const role           = req.user.role;
    const professionalId = req.user._id;

    let filter = { role: "Consumer" };
    if (role === "Dietician") {
      filter.dieticianId = professionalId;
    } else {
      filter.instructorId = professionalId;
    }

    const clients = await User.find(filter).select(
      "_id full_name email primary_goal workoutRequested workoutRequestNotes dietPlanRequested dietPlanRequestNotes"
    );

    const clientIds = clients.map((c) => c._id);
    const threshold = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const [adherences, activeDietPlans, workoutPlans] = await Promise.all([
      PlanAdherence.find({ userId: { $in: clientIds } }).lean(),
      role === "Dietician"
        ? DietPlan.find({ consumerId: { $in: clientIds }, status: "Active" }).lean()
        : Promise.resolve([]),
      role === "Instructor"
        ? WorkoutPlan.find({ clientId: { $in: clientIds } }).sort({ createdAt: -1 }).lean()
        : Promise.resolve([]),
    ]);

    const adherenceByUser = new Map(adherences.map((a) => [String(a.userId), a]));
    const dietPlanByUser = new Map();
    for (const plan of activeDietPlans) {
      const key = String(plan.consumerId);
      if (!dietPlanByUser.has(key)) dietPlanByUser.set(key, plan);
    }
    const workoutPlanByUser = new Map();
    for (const plan of workoutPlans) {
      const key = String(plan.clientId);
      if (!workoutPlanByUser.has(key)) workoutPlanByUser.set(key, plan);
    }

    const clientsWithCompliance = await Promise.all(
      clients.map(async (client) => {
        const recentLog = await DailyLog.findOne({
          userId:    client._id,
          createdAt: { $gte: threshold },
        }).select("_id");

        const adherence = adherenceByUser.get(String(client._id));
        const adherenceType = role === "Dietician" ? "diet" : "workout";
        const plan =
          role === "Dietician"
            ? dietPlanByUser.get(String(client._id))
            : workoutPlanByUser.get(String(client._id));

        const adherenceFlag = computeTwoDayAdherenceFlag(
          adherence?.[adherenceType],
          adherenceType,
          plan
        );

        let aiPlanSentForReview = false;
        if (role === "Dietician" && client.dietPlanRequested) {
          const aiSent = await DietPlan.findOne({
            consumerId: client._id,
            status: "Active",
            sentToDietician: true,
          }).select("_id");
          aiPlanSentForReview = !!aiSent;
        }

        return {
          _id:                  client._id,
          full_name:            client.full_name,
          email:                client.email,
          primary_goal:         client.primary_goal,
          hasRecentLogs:        recentLog !== null,
          workoutRequested:     client.workoutRequested || false,
          workoutRequestNotes:  client.workoutRequestNotes || "",
          dietPlanRequested:    client.dietPlanRequested || false,
          dietPlanRequestNotes: client.dietPlanRequestNotes || "",
          aiPlanSentForReview,
          adherenceFlag,
        };
      })
    );

    res.status(200).json(clientsWithCompliance);
  } catch (error) {
    console.error("getMyClients error:", error.message);
    res.status(500).json({ error: "Failed to fetch client list." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/request-instructor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requestInstructor
 * @description Premium Hub endpoint. Randomly assigns one Gym Instructor to
 * the requesting Consumer using MongoDB's $sample aggregation operator, then
 * persists the assignment on the Consumer's User document.
 *
 * Request body:
 *   consumerId   {string} — The _id of the Consumer making the request.
 *   fitnessGoal  {string} — (Optional) The consumer's selected fitness goal.
 *   notes        {string} — (Optional) Extra context for the instructor.
 *
 * Response 200:
 *   { message: string, instructor: { _id, full_name, email } }
 *
 * Errors:
 *   400 — consumerId missing
 *   404 — no Instructors found in the system
 *   500 — server / database error
 */
const requestInstructor = async (req, res) => {
  try {
    const { consumerId, fitnessGoal, notes } = req.body;

    // ── 1. Validate required field ───────────────────────────────────────────
    if (!consumerId) {
      return res.status(400).json({ error: "consumerId is required." });
    }

    // ── 2. Randomly select one Instructor via $sample aggregation ────────────
    // $sample picks documents at random using a reservoir-sampling algorithm.
    // This is far more efficient than fetching all instructors and using JS Math.random().
    const [randomInstructor] = await User.aggregate([
      { $match: { role: "Instructor" } },
      { $sample: { size: 1 } },
      { $project: { password: 0, __v: 0 } }, // strip sensitive fields
    ]);

    if (!randomInstructor) {
      return res.status(404).json({
        error: "No Gym Instructors are currently available. Please try again later.",
      });
    }

    // ── 3. Persist assignment to the Consumer's User document ────────────────
    // findByIdAndUpdate is atomic — no race-condition risk with concurrent requests.
    await User.findByIdAndUpdate(
      consumerId,
      { instructorId: randomInstructor._id },
      { new: true }
    );

    console.log(
      `[requestInstructor] Consumer ${consumerId} assigned to Instructor ` +
      `${randomInstructor.full_name} (${randomInstructor._id})`
    );

    // ── 4. Return confirmation ───────────────────────────────────────────────
    return res.status(200).json({
      message: `You've been matched with Instructor ${randomInstructor.full_name}! They will build your custom workout plan shortly.`,
      instructor: {
        _id:       randomInstructor._id,
        full_name: randomInstructor.full_name,
        email:     randomInstructor.email,
      },
    });
  } catch (error) {
    console.error("requestInstructor error:", error.message);
    return res.status(500).json({
      error: "Failed to process your instructor request. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/request-dietician
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requestDietician
 * @description Premium Hub endpoint. Randomly assigns one Dietician to the
 * requesting Consumer using $sample, then records the assignment.
 *
 * Request body:
 *   consumerId  {string} — The _id of the Consumer making the request.
 *   dietPlanId  {string} — (Optional) The active AI diet plan being submitted.
 *   notes       {string} — (Optional) Consumer notes for the dietician.
 *
 * Response 200:
 *   { message: string, dietician: { _id, full_name, email } }
 *
 * Errors:
 *   400 — consumerId missing
 *   404 — no Dieticians found in the system
 *   500 — server / database error
 */
const requestDietician = async (req, res) => {
  try {
    const { consumerId, dietPlanId, notes } = req.body;

    // ── 1. Validate ──────────────────────────────────────────────────────────
    if (!consumerId) {
      return res.status(400).json({ error: "consumerId is required." });
    }

    // ── 2. Randomly select one Dietician ────────────────────────────────────
    const [randomDietician] = await User.aggregate([
      { $match: { role: "Dietician" } },
      { $sample: { size: 1 } },
      { $project: { password: 0, __v: 0 } },
    ]);

    if (!randomDietician) {
      return res.status(404).json({
        error: "No Dieticians are currently available. Please try again later.",
      });
    }

    // ── 3. Persist assignment ────────────────────────────────────────────────
    await User.findByIdAndUpdate(
      consumerId,
      { dieticianId: randomDietician._id },
      { new: true }
    );

    console.log(
      `[requestDietician] Consumer ${consumerId} assigned to Dietician ` +
      `${randomDietician.full_name} (${randomDietician._id})` +
      `${dietPlanId ? ` | Diet Plan: ${dietPlanId}` : ""}`
    );

    // ── 4. Return confirmation ───────────────────────────────────────────────
    return res.status(200).json({
      message: `You've been matched with Dietician ${randomDietician.full_name}! Head to the Diet Plans tab to send your AI plan for review or request a custom plan.`,
      dietician: {
        _id:       randomDietician._id,
        full_name: randomDietician.full_name,
        email:     randomDietician.email,
      },
    });
  } catch (error) {
    console.error("requestDietician error:", error.message);
    return res.status(500).json({
      error: "Failed to process your dietician request. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/connect-by-code
// ─────────────────────────────────────────────────────────────────────────────

/**
 * connectByCode
 * @description Allows a premium Consumer to connect with a Dietician or
 * Instructor by entering that professional's unique code (their MongoDB _id).
 * Persists the link on the Consumer's User document.
 *
 * Request body:
 *   code       {string} — The professional's unique code (their MongoDB _id)
 *   type       {string} — "Dietician" | "Instructor"
 *   consumerId {string} — The _id of the Consumer making the request
 *
 * Response 200:
 *   { message: string, professional: { _id, full_name, email } }
 *
 * Errors:
 *   400 — Missing or invalid fields
 *   404 — No professional found with that code
 *   500 — server / database error
 */
const connectByCode = async (req, res) => {
  try {
    const { code, type, consumerId } = req.body;

    // ── 1. Validate required fields ──────────────────────────────────────────
    if (!code || !type || !consumerId) {
      return res.status(400).json({
        error: "code, type, and consumerId are all required.",
      });
    }

    const VALID_TYPES = ["Dietician", "Instructor"];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}.`,
      });
    }

    // ── 2. Look up the professional by their code (_id) ──────────────────────
    // We use a try/catch around findById because passing an invalid ObjectId
    // format would throw a CastError before reaching the database.
    let professional;
    try {
      professional = await User.findById(code).select("_id full_name email role");
    } catch {
      return res.status(404).json({
        error: "No professional found with that code. Please check and try again.",
      });
    }

    if (!professional) {
      return res.status(404).json({
        error: "No professional found with that code. Please check and try again.",
      });
    }

    // ── 3. Verify they actually have the requested role ───────────────────────
    if (professional.role !== type) {
      return res.status(400).json({
        error: `That code does not belong to a ${type}. Please verify with your professional.`,
      });
    }

    // ── 4. Persist the connection on the Consumer's document ─────────────────
    const fieldMap = {
      Dietician:  "dieticianId",
      Instructor: "instructorId",
    };
    const fieldToUpdate = fieldMap[type];

    await User.findByIdAndUpdate(
      consumerId,
      { [fieldToUpdate]: professional._id },
      { new: true }
    );

    console.log(
      `[connectByCode] Consumer ${consumerId} connected to ${type} ` +
      `${professional.full_name} (${professional._id})`
    );

    // ── 5. Return confirmation ───────────────────────────────────────────────
    return res.status(200).json({
      message: `Successfully connected to ${professional.full_name}!`,
      professional: {
        _id:       professional._id,
        full_name: professional.full_name,
        email:     professional.email,
      },
    });
  } catch (error) {
    console.error("connectByCode error:", error.message);
    return res.status(500).json({
      error: "Failed to process connection request. Please try again.",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/professionals/request-workout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requestWorkout
 * @description Stores a workout-plan request from the consumer on their User
 * document. The connected Instructor can read this flag from their dashboard.
 *
 * Request body:
 *   consumerId {string} — MongoDB ObjectId of the Consumer
 *   notes      {string} — (Optional) Consumer's requirements / notes
 *
 * Response 200:
 *   { success: true, message: string }
 *
 * Errors:
 *   400 — consumerId missing
 *   404 — consumer not found, or no instructor connected
 *   500 — database error
 */
const requestWorkout = async (req, res) => {
  try {
    const { consumerId, notes } = req.body;

    if (!consumerId) {
      return res.status(400).json({ error: "consumerId is required." });
    }

    const consumer = await User.findById(consumerId).select("instructorId full_name");
    if (!consumer) {
      return res.status(404).json({ error: "Consumer not found." });
    }
    if (!consumer.instructorId) {
      return res.status(404).json({
        error: "You are not connected to an instructor. Connect one in the Professional Hub first.",
      });
    }

    // Persist request as flags on the consumer document
    await User.findByIdAndUpdate(consumerId, {
      workoutRequested:    true,
      workoutRequestedAt:  new Date(),
      workoutRequestNotes: notes?.trim() || "",
    });

    console.log(
      `[requestWorkout] Consumer ${consumerId} (${consumer.full_name}) ` +
      `requested workout from Instructor ${consumer.instructorId}`
    );

    return res.status(200).json({
      success: true,
      message: "Your workout request has been sent! Your instructor will create a custom plan for you soon.",
    });
  } catch (error) {
    console.error("requestWorkout error:", error.message);
    return res.status(500).json({ error: "Failed to send workout request." });
  }
};

module.exports = {
  getConnectionStatus,
  getProfessionals,
  getMyClients,
  requestInstructor,
  requestDietician,
  connectByCode,
  requestWorkout,
};

