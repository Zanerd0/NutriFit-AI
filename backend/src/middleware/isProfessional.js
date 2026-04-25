/**
 * @file isProfessional.js
 * @description Authorization middleware that permits access for both
 * "Dietician" and "Instructor" roles. Used for shared endpoints that
 * apply to all professional users, such as the Client List module.
 *
 * Security Architecture:
 *   verifyToken    →  Confirms a valid JWT exists          (authentication)
 *   isProfessional →  Confirms role is Dietician OR Instructor (authorization)
 *
 * Usage in a route file:
 *   router.get("/clients", verifyToken, isProfessional, handler);
 */

const User = require("../models/User");

/**
 * isProfessional - Express middleware to authorize professional-level access.
 * Allows both "Dietician" and "Instructor" roles to proceed.
 *
 * @param {import('express').Request}      req  - Must have `req.userId` set by verifyToken.
 * @param {import('express').Response}     res  - The outgoing response object.
 * @param {import('express').NextFunction} next - The next middleware in the chain.
 */
const isProfessional = async (req, res, next) => {
  try {
    // 1. Fetch the user document using the userId injected by verifyToken.
    //    Select only the fields needed to authorize and pass downstream.
    const user = await User.findById(req.userId).select("role full_name email");

    // 2. Guard: user was deleted after their token was issued
    if (!user) {
      return res.status(404).json({ error: "Forbidden: User not found." });
    }

    // 3. Core authorization check — allow Dietician OR Instructor roles
    const ALLOWED_ROLES = ["Dietician", "Instructor"];
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({
        error: "Forbidden: Professional (Dietician or Instructor) access required.",
      });
    }

    // 4. Attach the full user object so downstream controllers have role context
    //    without needing to re-query the database.
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in isProfessional middleware:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = isProfessional;
