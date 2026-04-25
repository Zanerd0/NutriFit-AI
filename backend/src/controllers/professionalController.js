/**
 * @file professionalController.js
 * @description Controller for the public-facing professionals directory endpoint.
 *
 * This controller is intentionally kept separate from the consumer and admin
 * controllers to keep the concern of "browsing professionals" decoupled from
 * any role-specific logic.
 *
 * Controller Functions:
 *   getProfessionals — GET /api/professionals → Returns all Dieticians and Instructors
 */

const User = require("../models/User");

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
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = { getProfessionals };
