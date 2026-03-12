const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const env = require("./src/config/env"); // Load validated environment variables
const connectDB = require("./src/config/db"); // Load Database connection
const authRoutes = require("./src/routes/authRoutes"); // Load Authentication routes
const healthRoutes = require("./src/routes/healthRoutes"); // Load Health routes

const app = express();

// --- MIDDLEWARE ---
// CORS configured strictly to allow cookies to pass between frontend and backend
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));



// Parse incoming JSON payloads
app.use(express.json());

// Parse incoming cookies
app.use(cookieParser());

// --- ROUTES ---
// Mount the authentication routes
app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);

// A simple test route to verify the server is up
app.get("/", (req, res) => {
  res.send("NutriFit AI Backend is Running with Auth & Cookies!");
});

// --- START SERVER ---
const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Start the Express server
    app.listen(env.PORT, () => {
      console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1); // Stop the app if it fails to start
  }
};

startServer();