/**
 * @file isDietician.js
 * @description Authorization middleware that enforces Dietician-only access.
 *
 * This middleware is designed to run AFTER the verifyToken middleware in a
 * middleware chain. It relies on `req.userId` being set by verifyToken. It
 * then queries the database to fetch the full user document and checks if
 * their role is "Dietician". If not, the request is rejected with a 403.
 *
 * Security Architecture (mirrors isAdmin.js pattern):
 *   verifyToken  →  Confirms a valid, unexpired JWT exists  (authentication)
 *   isDietician  →  Confirms the user's role is "Dietician" (authorization)
 *
 * Usage in a route file:
 *   router.get("/dietician-only", verifyToken, isDietician, handler);
 */

const User = require("../models/User");

/**
 * isDietician - Express middleware to authorize Dietician-level access.
 *
 * @param {import('express').Request}      req  - Must have `req.userId` set by verifyToken.
 * @param {import('express').Response}     res  - The outgoing response object.
 * @param {import('express').NextFunction} next - The next middleware in the chain.
 */
const isDietician = async (req, res, next) => {
  try {
    // 1. Look up the full user document using the userId injected by verifyToken.
    //    We only select the fields we actually need to keep the DB query lean.
    const user = await User.findById(req.userId).select("role full_name email");

    // 2. Guard: user was deleted after their token was issued
    if (!user) {
      return res.status(404).json({ error: "Forbidden: User not found." });
    }

    // 3. Core authorization check — strict equality against the schema enum value
    if (user.role !== "Dietician") {
      return res.status(403).json({
        error: "Forbidden: Dietician access required.",
      });
    }

    // 4. User is both authenticated (by verifyToken) and authorized (Dietician role).
    //    Attach the full user object so downstream controllers don't re-query the DB.
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in isDietician middleware:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = isDietician;
