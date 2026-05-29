/**
 * @file consumerController.js
 * @description Business-logic handlers for all consumer-specific API endpoints.
 *
 * All functions in this controller assume the request has already passed through:
 *   1. verifyToken  — req.userId is a valid, authenticated user ID
 *   2. isConsumer   — req.user  is a User with role "Consumer"
 *
 * Controller Functions:
 *   getMyDietPlans         — GET   /api/consumer/diet-plans              → Consumer's assigned diet plans
 *   getMyWorkoutPlans      — GET   /api/consumer/workout-plans           → Consumer's assigned workout plans
 *   getMyWorkout           — GET   /api/consumer/my-workout              → Most recent template-assigned plan
 *   updateProfile          — PATCH /api/consumer/profile                 → Update health metrics
 *   completeOnboarding     — PUT   /api/consumer/onboarding              → Save first-time health profile
 *   linkProfessional       — PUT   /api/consumer/link-professional       → Link a Dietician or Instructor
 *   disconnectProfessional — PUT   /api/consumer/disconnect-professional → Nullify a professional link
 *   getMyProfile           — GET   /api/consumer/me                      → Fetch fresh consumer document
 *   logProgress            — POST  /api/consumer/log-progress            → Upsert daily weight log
 *   getProgressHistory     — GET   /api/consumer/progress-history        → All weight logs (oldest→newest)
 */

const User        = require("../models/User");
const DietPlan    = require("../models/DietPlan");
const WorkoutPlan = require("../models/WorkoutPlan");
const DailyLog    = require("../models/DailyLog");
const PlanAdherence = require("../models/PlanAdherence");
const {
  formatDateKey,
  syncBlockForDate,
  getEntryForDate,
  upsertEntryForDate,
  migrateLegacyBlock,
} = require("../utils/adherenceHelpers");

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
// GET /api/consumer/my-workout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getMyWorkout
 * @description Returns the single most recently assigned WorkoutPlan for the
 * logged-in consumer. This endpoint is designed for the "My Workout" tab which
 * shows the consumer their current active routine.
 *
 * Queries by `clientId` (Phase 1 field) for full compatibility with both the
 * legacy `createWorkoutPlan` flow and the new template-based `assignWorkout`.
 *
 * Response shape:
 *   { plan: WorkoutPlan } — or — { plan: null } when none exists
 */
const getMyWorkout = async (req, res) => {
  try {
    // Find the most recently created plan for this consumer.
    // Using findOne + sort is more efficient than find() when only one doc is needed.
    const plan = await WorkoutPlan.findOne({ clientId: req.userId })
      .populate("instructorId", "full_name email") // Resolve instructor's name for display
      .sort({ createdAt: -1 });                    // Newest plan first

    // Return null plan explicitly so the frontend can show an empty state cleanly
    res.status(200).json({ plan: plan ?? null });
  } catch (error) {
    console.error("getMyWorkout error:", error.message);
    res.status(500).json({ error: "Failed to fetch your workout." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/consumer/adherence
// ─────────────────────────────────────────────────────────────────────────────
const getAdherence = async (req, res) => {
  try {
    const dateKey = req.query.date || formatDateKey(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });
    }

    const [dietPlan, workoutPlan] = await Promise.all([
      DietPlan.findOne({ consumerId: req.userId, status: "Active" }).sort({ createdAt: -1 }),
      WorkoutPlan.findOne({ clientId: req.userId }).sort({ createdAt: -1 }),
    ]);

    const adherence = await PlanAdherence.findOneAndUpdate(
      { userId: req.userId },
      { $setOnInsert: { userId: req.userId } },
      { upsert: true, new: true }
    );

    let changed = false;

    const dietSync = syncBlockForDate(adherence.diet, "diet", dietPlan, dateKey);
    adherence.diet = dietSync.block;
    if (dietSync.changed) changed = true;

    if (!dietPlan && (adherence.diet?.planId || (adherence.diet?.entries || []).length > 0)) {
      adherence.diet = { planId: null, sourceSignature: "", entries: [], updatedAt: null };
      changed = true;
    }

    const workoutSync = syncBlockForDate(adherence.workout, "workout", workoutPlan, dateKey);
    adherence.workout = workoutSync.block;
    if (workoutSync.changed) changed = true;

    if (!workoutPlan && (adherence.workout?.planId || (adherence.workout?.entries || []).length > 0)) {
      adherence.workout = { planId: null, sourceSignature: "", entries: [], updatedAt: null };
      changed = true;
    }

    if (changed) await adherence.save();

    res.status(200).json({
      date: dateKey,
      diet: dietPlan ? dietSync.payload : { planId: null, date: dateKey, items: [] },
      workout: workoutPlan ? workoutSync.payload : { planId: null, date: dateKey, items: [] },
    });
  } catch (error) {
    console.error("getAdherence error:", error.message);
    res.status(500).json({ error: "Failed to load adherence checklist." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/consumer/adherence/:type
// ─────────────────────────────────────────────────────────────────────────────
const updateAdherence = async (req, res) => {
  try {
    const { type } = req.params;
    const { itemKey, completed, date } = req.body;
    const dateKey = date || formatDateKey(new Date());

    if (!["diet", "workout"].includes(type)) {
      return res.status(400).json({ error: "Invalid adherence type." });
    }
    if (!itemKey || typeof completed !== "boolean") {
      return res.status(400).json({ error: "itemKey and completed are required." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });
    }

    const plan =
      type === "diet"
        ? await DietPlan.findOne({ consumerId: req.userId, status: "Active" }).sort({ createdAt: -1 })
        : await WorkoutPlan.findOne({ clientId: req.userId }).sort({ createdAt: -1 });

    if (!plan) {
      return res.status(404).json({ error: "No active plan found for this checklist." });
    }

    let adherence = await PlanAdherence.findOne({ userId: req.userId });
    if (!adherence) {
      adherence = await PlanAdherence.create({ userId: req.userId });
    }

    const sync = syncBlockForDate(adherence[type], type, plan, dateKey);
    adherence[type] = sync.block;

    const entry = getEntryForDate(adherence[type], dateKey);
    const idx = (entry?.items || []).findIndex((it) => it.key === itemKey);
    if (idx === -1) {
      return res.status(404).json({ error: "Checklist item not found." });
    }

    entry.items[idx].completed = completed;
    upsertEntryForDate(adherence[type], dateKey, entry.items);
    migrateLegacyBlock(adherence[type]);

    await adherence.save();

    res.status(200).json({
      message: "Checklist updated.",
      date: dateKey,
      [type]: { planId: plan._id, date: dateKey, items: entry.items },
    });
  } catch (error) {
    console.error("updateAdherence error:", error.message);
    res.status(500).json({ error: "Failed to update checklist." });
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
    const ALLOWED_FIELDS = ["weight", "height", "goal", "primary_goal"];

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

    // returnDocument: 'after' returns the updated document (replaces deprecated { new: true })
    // runValidators ensures the goal enum is validated on update operations
    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { returnDocument: "after", runValidators: true }
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
// PUT /api/consumer/onboarding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * completeOnboarding
 * @description Saves the consumer's first-time health profile collected on the
 * Onboarding page. This endpoint is intentionally separate from updateProfile
 * so the onboarding flow has its own clear contract and can be versioned
 * independently.
 *
 * Fields accepted (all required for a complete onboarding submission):
 * {
 *   age:                  number   — Age in whole years
 *   weight:               number   — Body weight in kg
 *   height:               number   — Body height in cm
 *   primary_goal:         string   — e.g. 'Weight Loss', 'Muscle Gain'
 *   dietary_preferences:  string[] — e.g. ['Keto', 'Vegan']
 * }
 *
 * Returns the updated user document (password excluded) so the frontend can
 * refresh localStorage with the latest profile data in one round-trip.
 */
const completeOnboarding = async (req, res) => {
  try {
    // Strict allowlist — consumers cannot overwrite role, email, password, etc.
    const ONBOARDING_FIELDS = [
      "age",
      "weight",
      "height",
      "primary_goal",
      "dietary_preferences",
    ];

    const updates = {};
    ONBOARDING_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ error: "No valid onboarding fields provided." });
    }

    // req.userId is injected by verifyToken; isConsumer has already confirmed
    // the account exists and holds the Consumer role.
    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    ).select("-password -__v");

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({
      message: "Onboarding complete. Profile saved successfully.",
      user: updatedUser,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("completeOnboarding error:", error.message);
    res.status(500).json({ error: "Failed to save onboarding data." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/consumer/link-professional
// ─────────────────────────────────────────────────────────────────────────────

/**
 * linkProfessional
 * @description Links the logged-in consumer to a Dietician or Instructor by
 * saving that professional's MongoDB ObjectId into the consumer's document.
 *
 * Expected request body:
 * {
 *   professionalId:   string  — The MongoDB _id of the professional to link
 *   professionalRole: string  — Either "Dietician" or "Instructor"
 * }
 *
 * Business Rules:
 *   - Only "Dietician" and "Instructor" are valid roles to link against.
 *   - The professional must exist in the database and hold the correct role.
 *   - Linking overwrites any previously linked professional of the same type.
 *
 * Returns the updated consumer document (password excluded) so the frontend
 * can refresh localStorage in a single round-trip.
 */
const linkProfessional = async (req, res) => {
  try {
    const { professionalId, professionalRole } = req.body;

    // ── 1. Validate the incoming role ────────────────────────────────────────
    const VALID_ROLES = ["Dietician", "Instructor"];
    if (!professionalId || !professionalRole) {
      return res.status(400).json({
        error: "Both professionalId and professionalRole are required.",
      });
    }
    if (!VALID_ROLES.includes(professionalRole)) {
      return res.status(400).json({
        error: `Invalid professionalRole. Must be one of: ${VALID_ROLES.join(", ")}.`,
      });
    }

    // ── 2. Verify the referenced professional actually exists ─────────────────
    // This prevents linking to a deleted or non-existent user.
    const professional = await User.findById(professionalId).select("role full_name");
    if (!professional) {
      return res.status(404).json({ error: "Professional not found." });
    }
    if (professional.role !== professionalRole) {
      return res.status(400).json({
        error: `The specified user is not a ${professionalRole}.`,
      });
    }

    // ── 3. Map professionalRole to the correct schema field ───────────────────
    // "Dietician"  → dieticianId
    // "Instructor" → instructorId
    const fieldMap = {
      Dietician:  "dieticianId",
      Instructor: "instructorId",
    };
    const fieldToUpdate = fieldMap[professionalRole];

    // ── 4. Persist the link on the consumer document ──────────────────────────
    // req.userId is injected by verifyToken; isConsumer has already confirmed
    // the account exists and holds the Consumer role.
    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { $set: { [fieldToUpdate]: professionalId } },
      { returnDocument: "after", runValidators: true }
    ).select("-password -__v");

    if (!updatedUser) {
      return res.status(404).json({ error: "Consumer account not found." });
    }

    res.status(200).json({
      message: `Successfully linked to ${professional.full_name} as your ${professionalRole}.`,
      user: updatedUser,
    });
  } catch (error) {
    // Handle invalid ObjectId format gracefully
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid professionalId format." });
    }
    console.error("linkProfessional error:", error.message);
    res.status(500).json({ error: "Failed to link professional." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/consumer/disconnect-professional
// ─────────────────────────────────────────────────────────────────────────────

/**
 * disconnectProfessional
 * @description Removes a professional link by nullifying the consumer's
 * `dieticianId` or `instructorId` field (sets it to null).
 *
 * Expected request body:
 * {
 *   professionalRole: string  — Either "Dietician" or "Instructor"
 * }
 *
 * Returns the updated consumer document (password excluded).
 */
const disconnectProfessional = async (req, res) => {
  try {
    const { professionalRole } = req.body;

    // ── 1. Validate the role ──────────────────────────────────────────────────
    const VALID_ROLES = ["Dietician", "Instructor"];
    if (!professionalRole || !VALID_ROLES.includes(professionalRole)) {
      return res.status(400).json({
        error: `Invalid professionalRole. Must be one of: ${VALID_ROLES.join(", ")}.`,
      });
    }

    // ── 2. Map role to the schema field and set it to null ────────────────────
    const fieldMap = {
      Dietician:  "dieticianId",
      Instructor: "instructorId",
    };
    const fieldToNullify = fieldMap[professionalRole];

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { $set: { [fieldToNullify]: null } },
      { returnDocument: "after" }
    ).select("-password -__v");

    if (!updatedUser) {
      return res.status(404).json({ error: "Consumer account not found." });
    }

    res.status(200).json({
      message: `Your ${professionalRole} has been disconnected successfully.`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("disconnectProfessional error:", error.message);
    res.status(500).json({ error: "Failed to disconnect professional." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/consumer/me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getMyProfile
 * @description Returns the full, fresh consumer document from MongoDB.
 * Called by the frontend after any connect/disconnect action to ensure the
 * local state always reflects the true database state — solving the refresh
 * persistence problem.
 *
 * Response shape: { user: Consumer } (password excluded)
 */
const getMyProfile = async (req, res) => {
  try {
    // req.userId is set by verifyToken; isConsumer has validated the role.
    const user = await User.findById(req.userId).select("-password -__v");

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("getMyProfile error:", error.message);
    res.status(500).json({ error: "Failed to fetch profile." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/consumer/log-progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * logProgress
 * @description Upserts a DailyLog entry for the current calendar day.
 *
 * Business rules:
 *   - Computes the start (00:00:00.000) and end (23:59:59.999) of today in
 *     UTC so the date boundary is deterministic regardless of server timezone.
 *   - If a DailyLog already exists for this userId within today's window,
 *     the `weight` field is updated in-place (findOneAndUpdate + upsert: false).
 *   - If no log exists yet, a brand-new document is created.
 *   - This approach avoids duplicate logs per day while being idempotent;
 *     the consumer can re-submit to correct an earlier entry.
 *
 * Expected request body:
 * {
 *   weight: number  — Body weight in kg (or lbs, depending on frontend unit)
 * }
 *
 * Response: { message, log } — the created or updated DailyLog document.
 */
const logProgress = async (req, res) => {
  try {
    const { weight } = req.body;

    // ── 1. Validate input ─────────────────────────────────────────────────────
    if (weight === undefined || weight === null || weight === "") {
      return res.status(400).json({ error: "Weight is required." });
    }
    const numericWeight = Number(weight);
    if (isNaN(numericWeight) || numericWeight <= 0) {
      return res.status(400).json({ error: "Weight must be a positive number." });
    }

    // ── 2. Build today's date window (UTC midnight → UTC end-of-day) ──────────
    // Using UTC boundaries ensures each consumer gets exactly one log per
    // calendar day, regardless of the server's local timezone offset.
    const now       = new Date();
    const startOfDay = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      0, 0, 0, 0
    ));
    const endOfDay = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      23, 59, 59, 999
    ));

    // ── 3. Check for an existing log for today ────────────────────────────────
    const existingLog = await DailyLog.findOne({
      userId: req.userId,
      date:   { $gte: startOfDay, $lte: endOfDay },
    });

    let log;
    let message;

    if (existingLog) {
      // ── 4a. Update the existing log ─────────────────────────────────────────
      existingLog.weight = numericWeight;
      log     = await existingLog.save();
      message = "Today's weight log updated successfully.";
    } else {
      // ── 4b. Create a brand-new log for today ────────────────────────────────
      log = await DailyLog.create({
        userId: req.userId,
        date:   startOfDay,   // anchor to midnight for consistent querying
        weight: numericWeight,
      });
      message = "Weight logged successfully for today.";
    }

    res.status(200).json({ message, log });
  } catch (error) {
    console.error("logProgress error:", error.message);
    res.status(500).json({ error: "Failed to log progress." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/consumer/progress-history
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getProgressHistory
 * @description Returns all DailyLog documents for the logged-in consumer,
 * sorted in ascending date order (oldest entry first) so the data arrives
 * in the correct left-to-right chronological order for chart rendering.
 *
 * Only documents where `weight` is a non-null number are included, because
 * a DailyLog can exist with only meal data and no weight entry.
 *
 * Response: Array<{ _id, date, weight }> — lightweight projection.
 */
const getProgressHistory = async (req, res) => {
  try {
    const logs = await DailyLog.find(
      // Filter: only this consumer's logs that actually have a weight reading
      { userId: req.userId, weight: { $ne: null } },
      // Projection: only the fields the chart needs (omit meals for efficiency)
      { date: 1, weight: 1, _id: 1 }
    ).sort({ date: 1 }); // ascending — oldest first, matching chart X-axis

    res.status(200).json(logs);
  } catch (error) {
    console.error("getProgressHistory error:", error.message);
    res.status(500).json({ error: "Failed to fetch progress history." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  getMyDietPlans,
  getMyWorkoutPlans,
  getMyWorkout,
  getAdherence,
  updateAdherence,
  updateProfile,
  completeOnboarding,
  linkProfessional,
  disconnectProfessional,
  getMyProfile,
  logProgress,
  getProgressHistory,
};
