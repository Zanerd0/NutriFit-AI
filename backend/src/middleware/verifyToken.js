/**
 * @file verifyToken.js
 * @description Middleware to verify the JWT stored in the HTTP-only cookie.
 *
 * This middleware acts as the first gate for any protected route. It reads
 * the 'jwt' cookie, verifies its signature against our secret key, and if
 * valid, attaches the decoded userId to the request object for downstream
 * middleware and controllers to use.
 */

const jwt = require("jsonwebtoken");
const env = require("../config/env");

/**
 * verifyToken - Express middleware to authenticate requests via JWT cookie.
 *
 * @param {import('express').Request} req - The incoming request object.
 * @param {import('express').Response} res - The outgoing response object.
 * @param {import('express').NextFunction} next - The next middleware in the chain.
 */
const verifyToken = (req, res, next) => {
  // 1. Extract the JWT from the HTTP-only cookie named "jwt"
  const token = req.cookies?.jwt;

  // 2. If no token is present, the user is not authenticated at all
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  try {
    // 3. Verify the token using our secret key. This will throw if invalid/expired.
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // 4. Attach the decoded userId to the request so subsequent middleware can use it
    req.userId = decoded.userId;

    // 5. Pass control to the next middleware or route handler
    next();
  } catch (error) {
    // This catches invalid signature, expired token, malformed token, etc.
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token." });
  }
};

module.exports = verifyToken;
