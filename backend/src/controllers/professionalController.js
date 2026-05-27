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

const User     = require("../models/User");
const DailyLog = require("../models/DailyLog");

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
      "_id full_name email primary_goal"
    );

    const threshold = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const clientsWithCompliance = await Promise.all(
      clients.map(async (client) => {
        const recentLog = await DailyLog.findOne({
          userId:    client._id,
          createdAt: { $gte: threshold },
        }).select("_id");

        return {
          _id:           client._id,
          full_name:     client.full_name,
          email:         client.email,
          primary_goal:  client.primary_goal,
          hasRecentLogs: recentLog !== null,
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
      message: `Your request has been sent to Instructor ${randomInstructor.full_name}! They will build your custom workout plan shortly.`,
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
      message: `Your diet plan has been submitted to Dietician ${randomDietician.full_name} for review! They will contact you with personalised feedback shortly.`,
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
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  getProfessionals,
  getMyClients,
  requestInstructor,
  requestDietician,
};
