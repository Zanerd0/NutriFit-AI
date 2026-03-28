/**
 * @file isAdmin.js
 * @description Authorization middleware that enforces Admin-only access.
 *
 * This middleware is designed to run AFTER the verifyToken middleware in a
 * middleware chain. It relies on `req.userId` being set by verifyToken. It
 * then queries the database to fetch the full user document and checks if
 * their role is "Admin". If not, the request is rejected with a 403 Forbidden
 * status before it ever reaches a route handler.
 *
 * Usage in a route file:
 *   router.get("/admin-only", verifyToken, isAdmin, handler);
 */

const User = require("../models/User");

/**
 * isAdmin - Express middleware to authorize Admin-level access.
 *
 * @param {import('express').Request} req - The incoming request object (must have req.userId from verifyToken).
 * @param {import('express').Response} res - The outgoing response object.
 * @param {import('express').NextFunction} next - The next middleware in the chain.
 */
const isAdmin = async (req, res, next) => {
  try {
    // 1. Use the userId attached by the preceding verifyToken middleware
    //    to look up the full user document from the database.
    const user = await User.findById(req.userId);

    // 2. If the user no longer exists in the DB (e.g., account was deleted
    //    after the token was issued), deny access.
    if (!user) {
      return res.status(404).json({ error: "Forbidden: User not found." });
    }

    // 3. The core authorization check: verify the role field equals "Admin".
    //    This is a strict string comparison against the User schema enum.
    if (user.role !== "Admin") {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required." });
    }

    // 4. User is authenticated AND authorized. Attach the full user object
    //    to the request for convenient access in route handlers, then proceed.
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in isAdmin middleware:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = isAdmin;
