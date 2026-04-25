/**
 * @file professionalController.js
 * @description Controller for the public-facing professionals directory endpoint
 * and the shared professional client-list endpoint.
 *
 * Controller Functions:
 *   getProfessionals — GET /api/professionals          → Returns all Dieticians + Instructors
 *   getMyClients     — GET /api/professional/clients   → Returns linked clients for the logged-in
 *                                                         professional with compliance flags
 */

const User     = require("../models/User");
const DailyLog = require("../models/DailyLog");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/professionals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getProfessionals
 * @description Returns a publicly accessible list of all registered Dieticians
 * and Instructors. Sensitive fields (password, __v) are excluded from the
 * response using Mongoose's .select() projection.
 *
 * This endpoint is intentionally open to any authenticated user so Consumers
 * can browse and connect with professionals without needing special permissions.
 *
 * Response shape: Array<User> where role is "Dietician" or "Instructor"
 *   - _id, full_name, email, role (safe fields only)
 */
const getProfessionals = async (req, res) => {
  try {
    // Query for users whose role is either "Dietician" or "Instructor".
    // The $in operator performs an efficient indexed scan on the role field.
    // .select() strips password and internal Mongoose version key from the result.
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
 * @description Returns all Consumer users currently linked to the authenticated
 * professional. The linkage field depends on role:
 *   • Dietician  → consumers whose `dieticianId` === req.user._id
 *   • Instructor → consumers whose `instructorId` === req.user._id
 *
 * For each client a `hasRecentLogs` boolean is computed: true when at least
 * one DailyLog exists for that consumer created within the last 72 hours.
 *
 * Response shape: Array<{
 *   _id, full_name, email, primary_goal, hasRecentLogs
 * }>
 */
const getMyClients = async (req, res) => {
  try {
    // ── 1. Build the role-aware query filter ─────────────────────────────────
    // req.user is guaranteed to be set by the isProfessional middleware.
    const role = req.user.role;
    const professionalId = req.user._id;

    let filter = { role: "Consumer" };
    if (role === "Dietician") {
      filter.dieticianId = professionalId;
    } else {
      // role === "Instructor"
      filter.instructorId = professionalId;
    }

    // ── 2. Fetch only the consumers linked to this professional ──────────────
    const clients = await User.find(filter).select(
      "_id full_name email primary_goal"
    );

    // ── 3. Compute compliance flag for each client ───────────────────────────
    // Threshold: 72 hours (3 days) ago in UTC
    const threshold = new Date(Date.now() - 72 * 60 * 60 * 1000);

    // Run all compliance checks in parallel to avoid a sequential waterfall
    const clientsWithCompliance = await Promise.all(
      clients.map(async (client) => {
        // Look for any DailyLog by this user created after the 72-hour threshold
        const recentLog = await DailyLog.findOne({
          userId:    client._id,
          createdAt: { $gte: threshold },
        }).select("_id"); // Lean projection — we only need existence, not content

        return {
          _id:           client._id,
          full_name:     client.full_name,
          email:         client.email,
          primary_goal:  client.primary_goal,
          hasRecentLogs: recentLog !== null, // true = active, false = missed logs
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
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = { getProfessionals, getMyClients };
