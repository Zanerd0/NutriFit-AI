/**
 * @file isConsumer.js
 * @description Authorization middleware that enforces Consumer-only access.
 *
 * This middleware is designed to run AFTER the verifyToken middleware in a
 * middleware chain. It relies on `req.userId` being set by verifyToken. It
 * then queries the database to fetch the full user document and checks if
 * their role is "Consumer". If not, the request is rejected with a 403.
 *
 * Security Architecture (mirrors isAdmin / isDietician / isInstructor pattern):
 *   verifyToken  →  Confirms a valid, unexpired JWT exists  (authentication)
 *   isConsumer   →  Confirms the user's role is "Consumer" (authorization)
 *
 * Usage in a route file:
 *   router.get("/consumer-only", verifyToken, isConsumer, handler);
 */

const User = require("../models/User");

/**
 * isConsumer - Express middleware to authorize Consumer-level access.
 *
 * @param {import('express').Request}      req  - Must have `req.userId` set by verifyToken.
 * @param {import('express').Response}     res  - The outgoing response object.
 * @param {import('express').NextFunction} next - The next middleware in the chain.
 */
const isConsumer = async (req, res, next) => {
  try {
    // 1. Look up the full user document using the userId injected by verifyToken.
    //    Select only necessary fields to keep the DB query efficient.
    const user = await User.findById(req.userId).select(
      "role full_name email weight height goal"
    );

    // 2. Guard: user was deleted after their token was issued
    if (!user) {
      return res.status(404).json({ error: "Forbidden: User not found." });
    }

    // 3. Core authorization check — strict equality against the schema enum value
    if (user.role !== "Consumer") {
      return res.status(403).json({
        error: "Forbidden: Consumer access required.",
      });
    }

    // 4. User is both authenticated (by verifyToken) and authorized (Consumer role).
    //    Attach the full user object so downstream controllers can use it
    //    without making a second DB round-trip.
    req.user = user;
    next();
  } catch (error) {
    console.error("Error in isConsumer middleware:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = isConsumer;
