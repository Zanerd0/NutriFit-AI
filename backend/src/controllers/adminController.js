/**
 * @file adminController.js
 * @description Controller containing all admin-specific business logic.
 *
 * Each function in this file is an Express route handler that corresponds to
 * a specific admin operation. These handlers are protected upstream by the
 * verifyToken + isAdmin middleware chain, so by the time a request reaches
 * any of these functions, we already know the requester is a valid Admin.
 *
 * Admin Operations:
 *  - getAllUsers:    Fetches all registered users for the management table.
 *  - getSystemStats: Provides aggregated counts for the overview dashboard cards.
 *  - deleteUser:    Permanently removes a user document from the database.
 */

const User = require("../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getAllUsers - Fetches every registered user from the database.
 *
 * Returns a sanitized list of user objects — the password field is explicitly
 * excluded using Mongoose's `.select("-password")` projection to ensure
 * sensitive data never leaves the server.
 *
 * @param {import('express').Request}  req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
exports.getAllUsers = async (req, res) => {
  try {
    // Fetch all users and omit the password field from the result projection
    const users = await User.find({}).select("-password");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error in getAllUsers:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getSystemStats - Computes and returns high-level platform statistics.
 *
 * Uses Promise.all to fire all count queries concurrently for efficiency,
 * rather than making sequential round-trips to the database.
 *
 * @param {import('express').Request}  req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
exports.getSystemStats = async (req, res) => {
  try {
    // Run all database count queries in parallel using Promise.all
    const [
      totalUsers,
      totalConsumers,
      totalDieticians,
      totalInstructors,
      totalAdmins,
    ] = await Promise.all([
      User.countDocuments({}),                            // All users regardless of role
      User.countDocuments({ role: "Consumer" }),          // Only Consumers
      User.countDocuments({ role: "Dietician" }),         // Only Dieticians
      User.countDocuments({ role: "Instructor" }),        // Only Instructors
      User.countDocuments({ role: "Admin" }),             // Only Admins
    ]);

    // Return the aggregated stats as a single structured object
    res.status(200).json({
      totalUsers,
      totalConsumers,
      totalDieticians,
      totalInstructors,
      totalAdmins,
    });
  } catch (error) {
    console.error("Error in getSystemStats:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE  /api/admin/users/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * deleteUser - Permanently deletes a user by their MongoDB ObjectId.
 *
 * Includes a safety guard to prevent an admin from accidentally deleting
 * their own account, which could lock them out of the system.
 *
 * @param {import('express').Request}  req - Express request object. Expects `req.params.id`.
 * @param {import('express').Response} res - Express response object.
 */
exports.deleteUser = async (req, res) => {
  try {
    // Extract the target user's ID from the URL parameter (e.g., DELETE /api/admin/users/abc123)
    const { id } = req.params;

    // Safety guard: Prevent the currently logged-in admin from deleting themselves.
    // req.userId is set by the verifyToken middleware.
    if (id === req.userId.toString()) {
      return res
        .status(400)
        .json({ error: "Admins cannot delete their own account." });
    }

    // Find the user and remove them from the database
    const deletedUser = await User.findByIdAndDelete(id);

    // If no user was found with that ID, return a 404
    if (!deletedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    // Return success confirmation with minimal details about the deleted user
    res.status(200).json({
      message: `User "${deletedUser.full_name}" deleted successfully.`,
    });
  } catch (error) {
    console.error("Error in deleteUser:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
