/**
 * @file instructorController.js
 * @description Business-logic handlers for all instructor-specific API endpoints.
 *
 * All functions in this controller assume the request has already passed through:
 *   1. verifyToken    — req.userId is a valid, authenticated user ID
 *   2. isInstructor   — req.user  is a User with role "Instructor"
 *
 * Controller Functions:
 *   getClients        — GET    /api/instructor/clients            → Linked Consumer users
 *   createWorkoutPlan — POST   /api/instructor/plans              → Create a new WorkoutPlan (legacy)
 *   getWorkoutPlans   — GET    /api/instructor/plans              → Plans created by this instructor
 *   deleteWorkoutPlan — DELETE /api/instructor/plans/:planId      → Delete a specific plan
 *   getTemplates      — GET    /api/instructor/templates          → All WorkoutTemplate documents
 *   assignWorkout     — POST   /api/instructor/assign-workout     → Assign a customised plan to a client
 *   createTemplate    — POST   /api/instructor/templates          → Create a new template
 *   updateTemplate    — PUT    /api/instructor/templates/:id      → Update an existing template
 *   deleteTemplate    — DELETE /api/instructor/templates/:id      → Delete a template
 */

const User             = require("../models/User");
const WorkoutPlan      = require("../models/WorkoutPlan");
const WorkoutTemplate  = require("../models/WorkoutTemplate");
const PlanAdherence    = require("../models/PlanAdherence");
const {
  formatDateKey,
  mergeByKey,
  makeWorkoutItemsFromPlan,
  getEntryForDate,
  migrateLegacyBlock,
} = require("../utils/adherenceHelpers");

/**
 * sanitisePlanExercises — Normalises exercise payloads for WorkoutPlan documents.
 * Strips unexpected fields and enforces non-negative numeric values.
 */
const sanitisePlanExercises = (exercises = []) =>
  exercises.map((ex) => {
    const base = {
      exerciseName: String(ex.exerciseName || "").trim(),
      metricType:   ex.metricType || "sets_reps",
      notes:        String(ex.notes || "").trim().slice(0, 500),
    };

    const nonNeg = (val, fallback = 0) => {
      const n = parseFloat(val);
      if (Number.isNaN(n) || n < 0) return fallback;
      return n;
    };

    switch (base.metricType) {
      case "sets_reps":
        base.sets = Math.max(0, parseInt(ex.sets, 10) || 0);
        base.reps = Math.max(0, parseInt(ex.reps, 10) || 0);
        break;
      case "sets_time":
        base.sets         = Math.max(0, parseInt(ex.sets, 10) || 0);
        base.durationSecs = Math.max(0, parseInt(ex.durationSecs, 10) || 0);
        break;
      case "distance":
        base.distanceValue = Math.max(0, nonNeg(ex.distanceValue, 0));
        base.distanceUnit  = ["km", "miles", "meters"].includes(ex.distanceUnit)
          ? ex.distanceUnit
          : "km";
        break;
      case "time":
        base.timeMinutes = Math.max(0, parseInt(ex.timeMinutes, 10) || 0);
        break;
      case "laps":
        base.laps = Math.max(0, parseInt(ex.laps, 10) || 0);
        break;
      case "custom":
        base.customMetric = String(ex.customMetric || "").trim();
        break;
      default:
        base.sets = Math.max(0, parseInt(ex.sets, 10) || 0);
        base.reps = Math.max(0, parseInt(ex.reps, 10) || 0);
    }
    return base;
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instructor/pending-requests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getPendingWorkoutRequests
 * @description Returns the list of clients who have set workoutRequested = true
 * so the dashboard can show a notification badge and highlight those rows.
 *
 * Response: Array<{ _id, full_name, email, workoutRequestNotes, workoutRequestedAt }>
 */
const getPendingWorkoutRequests = async (req, res) => {
  try {
    const requests = await User.find({
      role:             "Consumer",
      instructorId:     req.userId,
      workoutRequested: true,
    }).select("_id full_name email workoutRequestNotes workoutRequestedAt");

    res.status(200).json(requests);
  } catch (error) {
    console.error("getPendingWorkoutRequests error:", error.message);
    res.status(500).json({ error: "Failed to fetch pending workout requests." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instructor/clients
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getClients
 * @description Fetch only the Consumer users who have linked to the
 * currently authenticated Instructor (i.e. whose `instructorId` field
 * matches the logged-in user's ID).
 *
 * This replaces the old Phase-1 approach of returning ALL consumers;
 * now each instructor sees only their own assigned clients.
 *
 * Response shape: Array<{ _id, full_name, email, createdAt }>
 */
const getClients = async (req, res) => {
  try {
    // Filter: Consumer users whose instructorId matches the logged-in instructor
    // Projection: exclude the hashed password — never send it to the client
    const clients = await User.find({
      role:         "Consumer",
      instructorId: req.userId,  // Only this instructor's linked clients
    }).select("-password -__v");

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

    const sanitisedExercises = sanitisePlanExercises(exercises);

    const newPlan = new WorkoutPlan({
      instructorId: req.userId,  // Sourced from verified JWT — tamper-proof
      clientId,
      title,
      description: description || "",
      exercises:   sanitisedExercises,
    });

    // Persist to MongoDB; Mongoose validates exercise sub-documents here
    const savedPlan = await newPlan.save();

    // Clear the workout request flag now that a plan has been assigned
    await User.findByIdAndUpdate(clientId, {
      workoutRequested:    false,
      workoutRequestedAt:  null,
      workoutRequestNotes: "",
    });

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
      .populate("clientId", "full_name email")
      .sort({ createdAt: -1 });

    res.status(200).json(plans);
  } catch (error) {
    console.error("getWorkoutPlans error:", error.message);
    res.status(500).json({ error: "Failed to fetch workout plans." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/instructor/plans/:planId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * updateWorkoutPlan
 * @description Updates an existing WorkoutPlan owned by the authenticated instructor.
 *
 * Expected request body:
 * { title?: string, description?: string, exercises?: Array<exercise> }
 */
const updateWorkoutPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { title, description, exercises } = req.body;

    const plan = await WorkoutPlan.findOne({
      _id:          planId,
      instructorId: req.userId,
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found or not authorised to update." });
    }

    if (title !== undefined) {
      const trimmed = String(title).trim();
      if (!trimmed) {
        return res.status(400).json({ error: "Plan title cannot be empty." });
      }
      plan.title = trimmed;
    }

    if (description !== undefined) {
      plan.description = String(description || "").trim();
    }

    if (exercises !== undefined) {
      if (!Array.isArray(exercises) || exercises.length === 0) {
        return res.status(400).json({ error: "At least one exercise is required." });
      }
      plan.exercises = sanitisePlanExercises(exercises);
    }

    const savedPlan = await plan.save();

    res.status(200).json({
      message: "Workout plan updated successfully.",
      plan:    savedPlan,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("updateWorkoutPlan error:", error.message);
    res.status(500).json({ error: "Failed to update workout plan." });
  }
};

/**
 * deleteWorkoutPlan
 * @description Deletes a specific WorkoutPlan owned by the authenticated instructor.
 * Verifies that instructorId matches before deletion to prevent cross-instructor deletion.
 */
const deleteWorkoutPlan = async (req, res) => {
  try {
    const { planId } = req.params;

    // Find and verify ownership before deleting
    const plan = await WorkoutPlan.findOne({
      _id:          planId,
      instructorId: req.userId, // Must belong to this instructor
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found or not authorised to delete." });
    }

    await WorkoutPlan.findByIdAndDelete(planId);
    res.status(200).json({ message: "Workout plan deleted successfully." });
  } catch (error) {
    console.error("deleteWorkoutPlan error:", error.message);
    res.status(500).json({ error: "Failed to delete workout plan." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/instructor/templates   (create)
// PUT  /api/instructor/templates/:id (update)
// DELETE /api/instructor/templates/:id (delete)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createTemplate
 * @description Creates a new WorkoutTemplate in the shared collection.
 * Body: { name, goal_tag, exercises: [{ exerciseName, baseSets, baseReps }] }
 */
const createTemplate = async (req, res) => {
  try {
    const { name, goal_tag, exercises } = req.body;
    if (!name || !goal_tag) {
      return res.status(400).json({ error: "name and goal_tag are required." });
    }

    const template = new WorkoutTemplate({
      name:      name.trim(),
      goal_tag:  goal_tag.trim(),
      exercises: exercises || [],
    });

    const saved = await template.save();
    res.status(201).json(saved);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("createTemplate error:", error.message);
    res.status(500).json({ error: "Failed to create template." });
  }
};

/**
 * updateTemplate
 * @description Updates an existing WorkoutTemplate by ID.
 * Body: { name, goal_tag, exercises }
 */
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, goal_tag, exercises } = req.body;

    const updated = await WorkoutTemplate.findByIdAndUpdate(
      id,
      { $set: { name, goal_tag, exercises } },
      { returnDocument: "after", runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.status(200).json(updated);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("updateTemplate error:", error.message);
    res.status(500).json({ error: "Failed to update template." });
  }
};

/**
 * deleteTemplate
 * @description Deletes a WorkoutTemplate by ID from the shared collection.
 */
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await WorkoutTemplate.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Template not found." });
    }
    res.status(200).json({ message: "Template deleted successfully." });
  } catch (error) {
    console.error("deleteTemplate error:", error.message);
    res.status(500).json({ error: "Failed to delete template." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instructor/templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getTemplates
 * @description Returns all WorkoutTemplate documents from the shared
 * template collection. These are read-only blueprints; instructors pick one
 * and customise it before assigning it to a client.
 *
 * Response shape: Array<WorkoutTemplate>
 */
const getTemplates = async (req, res) => {
  try {
    // Fetch every template sorted alphabetically by name for a predictable UI
    const templates = await WorkoutTemplate.find().sort({ name: 1 });
    res.status(200).json(templates);
  } catch (error) {
    console.error("getTemplates error:", error.message);
    res.status(500).json({ error: "Failed to fetch workout templates." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/instructor/assign-workout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * assignWorkout
 * @description Creates and saves a customised WorkoutPlan for a specific client.
 *
 * Expected request body:
 * {
 *   clientId:   string   — ObjectId of the target Consumer
 *   templateId: string   — ObjectId of the WorkoutTemplate used as the base
 *   exercises:  Array<{ exerciseName, sets, reps }> — instructor-customised list
 * }
 *
 * The assigned plan writes all four ID fields for full forward-compatibility
 * with both Phase-1 queries (clientId) and Phase-2 queries (userId):
 *   instructorId  = req.userId   (Phase 1 author field)
 *   clientId      = clientId     (Phase 1 recipient field)
 *   assignedBy    = req.userId   (Phase 2 author field)
 *   userId        = clientId     (Phase 2 recipient field)
 *
 * Response shape: { message, plan }
 */
const assignWorkout = async (req, res) => {
  try {
    const { clientId, templateId, exercises } = req.body;

    // ── Input Validation ─────────────────────────────────────────────────────
    if (!clientId || !templateId) {
      return res.status(400).json({ error: "clientId and templateId are required." });
    }
    if (!exercises || !Array.isArray(exercises) || exercises.length === 0) {
      return res.status(400).json({ error: "At least one exercise is required." });
    }

    // ── Verify client belongs to this instructor ──────────────────────────────
    // Prevents one instructor from assigning plans to another's clients.
    const client = await User.findOne({
      _id:          clientId,
      role:         "Consumer",
      instructorId: req.userId,
    }).select("full_name primary_goal");

    if (!client) {
      return res.status(404).json({
        error: "Client not found or is not linked to your account.",
      });
    }

    // ── Verify template exists ────────────────────────────────────────────────
    const template = await WorkoutTemplate.findById(templateId).select("name goal_tag");
    if (!template) {
      return res.status(404).json({ error: "Workout template not found." });
    }

    const sanitisedExercises = sanitisePlanExercises(exercises);

    // ── Build a descriptive title from the template + client name ────────────
    const title = `${template.name} — ${client.full_name}`;

    // ── Create WorkoutPlan document with all four ID fields ───────────────────
    const plan = new WorkoutPlan({
      // Phase 1 fields (required by schema)
      instructorId: req.userId,
      clientId:     clientId,
      // Phase 2 fields (forward-compat, optional in schema)
      assignedBy:   req.userId,
      userId:       clientId,
      title,
      description:  `Based on the "${template.name}" template (${template.goal_tag} goal).`,
      exercises:    sanitisedExercises,
    });

    const savedPlan = await plan.save();

    // Clear the workout request flag now that a plan has been assigned
    await User.findByIdAndUpdate(clientId, {
      workoutRequested:    false,
      workoutRequestedAt:  null,
      workoutRequestNotes: "",
    });

    res.status(201).json({
      message: `Workout assigned to ${client.full_name} successfully.`,
      plan:    savedPlan,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    console.error("assignWorkout error:", error.message);
    res.status(500).json({ error: "Failed to assign workout plan." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/instructor/client-progress/:clientId
// ─────────────────────────────────────────────────────────────────────────────
const getClientProgress = async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await User.findOne({
      _id: clientId,
      role: "Consumer",
      instructorId: req.userId,
    }).select("_id full_name email");

    if (!client) {
      return res.status(404).json({ error: "Client not found or not linked to you." });
    }

    const dateKey = req.query.date || formatDateKey(new Date());

    const [adherence, workoutPlan] = await Promise.all([
      PlanAdherence.findOne({ userId: clientId }).lean(),
      WorkoutPlan.findOne({ clientId }).sort({ createdAt: -1 }).lean(),
    ]);

    let workoutItems = [];
    if (workoutPlan && adherence?.workout) {
      const block = migrateLegacyBlock({ ...adherence.workout });
      const built = makeWorkoutItemsFromPlan(workoutPlan);
      const entry = getEntryForDate(block, dateKey);
      workoutItems = mergeByKey(entry?.items, built.items);
    }

    res.status(200).json({
      client,
      date: dateKey,
      workoutAdherence: { date: dateKey, items: workoutItems },
    });
  } catch (error) {
    console.error("getClientProgress error:", error.message);
    res.status(500).json({ error: "Failed to fetch client progress." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  getClients,
  getClientProgress,
  createWorkoutPlan,
  getWorkoutPlans,
  updateWorkoutPlan,
  deleteWorkoutPlan,
  getTemplates,
  assignWorkout,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getPendingWorkoutRequests,
};
