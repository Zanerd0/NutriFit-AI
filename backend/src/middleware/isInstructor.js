/**
 * @file isInstructor.js
 * @description Authorization middleware that enforces Instructor-only access.
 *
 * This middleware is designed to run AFTER the verifyToken middleware in a
 * middleware chain. It relies on `req.userId` being set by verifyToken. It
 * then queries the database to fetch the full user document and checks if
 * their role is "Instructor". If not, the request is rejected with a 403.
 *
 * Security Architecture (mirrors isAdmin.js / isDietician.js pattern):
 *   verifyToken   →  Confirms a valid, unexpired JWT exists  (authentication)
 *   isInstructor  →  Confirms the user's role is "Instructor" (authorization)
 *
 * This two-layer separation follows the Single Responsibility Principle:
 * each middleware does exactly one job and is independently reusable.
 *
 * Usage in a route file:
 *   router.get("/instructor-only", verifyToken, isInstructor, handler);
 */

const User = require("../models/User");

/**
 * isInstructor - Express middleware to authorize Instructor-level access.
 *
 * @param {import('express').Request}      req  - Must have `req.userId` set by verifyToken.
 * @param {import('express').Response}     res  - The outgoing response object.
 * @param {import('express').NextFunction} next - The next middleware in the chain.
 */
const isInstructor = async (req, res, next) => {
  try {
    // 1. Look up the full user document using the userId injected by verifyToken.
    //    We select only the fields needed to keep the DB query lean.
    const user = await User.findById(req.userId).select("role full_name email");

    // 2. Guard: user was deleted after their token was issued
    if (!user) {
      return res.status(404).json({ error: "Forbidden: User not found." });
    }

    // 3. Core authorization check — strict equality against the schema enum value
    if (user.role !== "Instructor") {
      return res.status(403).json({
        error: "Forbidden: Instructor access required.",
      });
    }

    // 4. User is both authenticated (by verifyToken) and authorized (Instructor role).
    //    Attach the full user object so downstream controllers don't re-query the DB.
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in isInstructor middleware:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = isInstructor;
