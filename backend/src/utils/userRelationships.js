/**
 * @file userRelationships.js
 * @description Helpers for consumer ↔ professional links and cascade cleanup
 *              when users are deleted by an admin.
 */

const User = require("../models/User");
const DietPlan = require("../models/DietPlan");
const WorkoutPlan = require("../models/WorkoutPlan");
const PlanAdherence = require("../models/PlanAdherence");
const DailyLog = require("../models/DailyLog");

const uniqueIds = (ids) =>
  [...new Set(ids.filter(Boolean).map((id) => String(id)))];

/**
 * Removes stale dieticianId / instructorId refs when the professional no longer exists.
 * @returns {Promise<object>} Sanitized user document (plain object or mongoose doc).
 */
const sanitizeConsumerProfessionalLinks = async (consumer) => {
  if (!consumer || consumer.role !== "Consumer") return consumer;

  const updates = {};

  if (consumer.dieticianId) {
    const dietician = await User.findOne({
      _id: consumer.dieticianId,
      role: "Dietician",
    }).select("_id");

    if (!dietician) {
      updates.dieticianId = null;
      updates.dietPlanRequested = false;
      updates.dietPlanRequestedAt = null;
      updates.dietPlanRequestNotes = "";
    }
  }

  if (consumer.instructorId) {
    const instructor = await User.findOne({
      _id: consumer.instructorId,
      role: "Instructor",
    }).select("_id");

    if (!instructor) {
      updates.instructorId = null;
      updates.workoutRequested = false;
      updates.workoutRequestedAt = null;
      updates.workoutRequestNotes = "";
    }
  }

  if (Object.keys(updates).length === 0) return consumer;

  const cleaned = await User.findByIdAndUpdate(
    consumer._id,
    { $set: updates },
    { returnDocument: "after" }
  ).select("-password -__v");

  return cleaned || consumer;
};

/**
 * Consumer IDs currently linked to a dietician (active connection only).
 */
const findDieticianConsumerIds = async (dieticianId) =>
  User.distinct("_id", { role: "Consumer", dieticianId });

/**
 * Consumer IDs linked to an instructor — includes active connections and any
 * consumer who still has a workout plan assigned by this instructor (repairs
 * missing instructorId links left by legacy plan creation).
 */
const findInstructorConsumerIds = async (instructorId) => {
  const [planClientIds, planUserIds] = await Promise.all([
    WorkoutPlan.distinct("clientId", { instructorId }),
    WorkoutPlan.distinct("userId", { instructorId, userId: { $ne: null } }),
  ]);

  const planConsumerIds = uniqueIds([...planClientIds, ...planUserIds]);

  if (planConsumerIds.length > 0) {
    await User.updateMany(
      {
        _id: { $in: planConsumerIds },
        role: "Consumer",
        $or: [{ instructorId: null }, { instructorId: { $exists: false } }],
      },
      { $set: { instructorId } }
    );
  }

  return User.distinct("_id", { role: "Consumer", instructorId });
};

/**
 * Disconnects a consumer from a professional: clears the link, request flags,
 * and removes plans that professional assigned to this consumer.
 * @returns {Promise<object|null>} Updated consumer document or null if not found.
 */
const disconnectConsumerFromProfessional = async (consumerId, professionalRole) => {
  const VALID_ROLES = ["Dietician", "Instructor"];
  if (!VALID_ROLES.includes(professionalRole)) {
    throw new Error(`Invalid professionalRole: ${professionalRole}`);
  }

  const consumer = await User.findById(consumerId).select(
    "role dieticianId instructorId"
  );
  if (!consumer || consumer.role !== "Consumer") return null;

  const fieldMap = {
    Dietician: {
      field: "dieticianId",
      clear: {
        dietPlanRequested: false,
        dietPlanRequestedAt: null,
        dietPlanRequestNotes: "",
      },
    },
    Instructor: {
      field: "instructorId",
      clear: {
        workoutRequested: false,
        workoutRequestedAt: null,
        workoutRequestNotes: "",
      },
    },
  };

  const { field, clear } = fieldMap[professionalRole];
  const professionalId = consumer[field];
  const consumerOid = consumer._id;

  const cleanupTasks = [];

  if (professionalRole === "Instructor" && professionalId) {
    cleanupTasks.push(
      WorkoutPlan.deleteMany({
        instructorId: professionalId,
        $or: [{ clientId: consumerOid }, { userId: consumerOid }],
      })
    );
  }

  if (professionalRole === "Dietician" && professionalId) {
    cleanupTasks.push(
      DietPlan.deleteMany({
        dieticianId: professionalId,
        planType: "custom",
        $or: [{ consumerId: consumerOid }, { clientId: consumerOid }],
      }),
      DietPlan.updateMany(
        {
          consumerId: consumerOid,
          sentToDietician: true,
        },
        { $set: { sentToDietician: false, sentToDieticianAt: null } }
      )
    );
  }

  if (cleanupTasks.length > 0) {
    await Promise.all(cleanupTasks);
  }

  return User.findByIdAndUpdate(
    consumerId,
    { $set: { [field]: null, ...clear } },
    { returnDocument: "after" }
  ).select("-password -__v");
};

/**
 * Cascade cleanup after admin deletes a user.
 * @param {object} deletedUser - Mongoose user document that was just removed.
 */
const cleanupDeletedUser = async (deletedUser) => {
  const id = deletedUser._id;
  const role = deletedUser.role;

  if (role === "Consumer") {
    await Promise.all([
      DietPlan.deleteMany({
        $or: [{ consumerId: id }, { clientId: id }],
      }),
      WorkoutPlan.deleteMany({
        $or: [{ clientId: id }, { userId: id }],
      }),
      PlanAdherence.deleteMany({ userId: id }),
      DailyLog.deleteMany({ userId: id }),
    ]);
    await DietPlan.updateMany(
      { reviewRequestedBy: id },
      { $set: { reviewRequestedBy: null } }
    );
    return;
  }

  if (role === "Dietician") {
    await User.updateMany(
      { dieticianId: id },
      {
        $set: {
          dieticianId: null,
          dietPlanRequested: false,
          dietPlanRequestedAt: null,
          dietPlanRequestNotes: "",
        },
      }
    );
    await DietPlan.deleteMany({ dieticianId: id, planType: "custom" });
    await DietPlan.updateMany(
      { dieticianId: id },
      {
        $set: {
          sentToDietician: false,
          sentToDieticianAt: null,
        },
      }
    );
    return;
  }

  if (role === "Instructor") {
    await User.updateMany(
      { instructorId: id },
      {
        $set: {
          instructorId: null,
          workoutRequested: false,
          workoutRequestedAt: null,
          workoutRequestNotes: "",
        },
      }
    );
    await WorkoutPlan.deleteMany({
      $or: [{ instructorId: id }, { assignedBy: id }],
    });
  }
};

module.exports = {
  sanitizeConsumerProfessionalLinks,
  findDieticianConsumerIds,
  findInstructorConsumerIds,
  disconnectConsumerFromProfessional,
  cleanupDeletedUser,
};
