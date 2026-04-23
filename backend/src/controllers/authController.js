const User = require("../models/User");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

// Helper to generate token and set cookie
const generateTokenAndSetCookie = (userId, res) => {
  const token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "15d" });
  
  res.cookie("jwt", token, {
    maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days in milliseconds
    httpOnly: true, // Prevents Cross-Site Scripting (XSS)
    sameSite: "strict", // Prevents Cross-Site Request Forgery (CSRF)
    secure: env.NODE_ENV !== "development",
  });
};

exports.signup = async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email is already taken" });
    }

    const user = await User.create({ full_name, email, password, role });
    
    generateTokenAndSetCookie(user._id, res);

    res.status(201).json({
      _id:                  user._id,
      full_name:            user.full_name,
      email:                user.email,
      role:                 user.role,
      // Health metrics — needed by ConsumerRoute onboarding gate
      age:                  user.age,
      weight:               user.weight,
      height:               user.height,
      goal:                 user.goal,
      primary_goal:         user.primary_goal,
      dietary_preferences:  user.dietary_preferences,
    });
  } catch (error) {
    console.error("❌ Signup error:", error.message); // Log the real error
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    const isPasswordCorrect = await user?.comparePassword(password);

    if (!user || !isPasswordCorrect) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    generateTokenAndSetCookie(user._id, res);

    res.status(200).json({
      _id:                  user._id,
      full_name:            user.full_name,
      email:                user.email,
      role:                 user.role,
      // Health metrics — needed by ConsumerRoute onboarding gate
      age:                  user.age,
      weight:               user.weight,
      height:               user.height,
      goal:                 user.goal,
      primary_goal:         user.primary_goal,
      dietary_preferences:  user.dietary_preferences,
    });
  } catch (error) {
    console.error("❌ Login error:", error.message); // Log the real error
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};