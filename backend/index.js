const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const env = require("./src/config/env"); // Load validated environment variables
const connectDB = require("./src/config/db"); // Load Database connection
const authRoutes = require("./src/routes/authRoutes"); // Load Authentication routes
const healthRoutes = require("./src/routes/healthRoutes"); // Load Health routes
const adminRoutes     = require("./src/routes/adminRoutes");     // Load Admin routes
const dieticianRoutes  = require("./src/routes/dieticianRoutes");  // Load Dietician routes
const instructorRoutes = require("./src/routes/instructorRoutes"); // Load Instructor routes
const consumerRoutes   = require("./src/routes/consumerRoutes");   // Load Consumer routes
const professionalRoutes = require("./src/routes/professionalRoutes"); // Load Professionals directory routes
const dietPlanRoutes     = require("./src/routes/dietPlanRoutes");     // Load AI Diet Plan (RAG) routes
const chatRoutes         = require("./src/routes/chatRoutes");         // Load Free Tier AI Chat routes
const stripeRoutes       = require("./src/routes/stripeRoutes");       // Load Stripe payment routes
const seedWorkoutTemplates = require("./src/utils/seedTemplates"); // Auto-seed default workout templates

const app = express();

// --- MIDDLEWARE ---
// CORS configured strictly to allow cookies to pass between frontend and backend
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

// Parse incoming cookies — must be before ANY route that reads req.cookies,
// including the Stripe create-checkout-session route which calls verifyToken.
app.use(cookieParser());

// ---------------------------------------------------------------------------
// ⚠️  CRITICAL: Mount Stripe routes BEFORE express.json().
// The webhook handler uses express.raw() internally to receive the unparsed
// request body required by stripe.webhooks.constructEvent().
// If express.json() runs first it consumes the body stream and verification fails.
// ---------------------------------------------------------------------------
app.use("/api/stripe", stripeRoutes);

// Parse incoming JSON payloads (applied to all other routes)
app.use(express.json());

// --- ROUTES ---
// Mount the authentication routes
app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);
// Mount admin routes — all endpoints require verifyToken + isAdmin middleware
app.use("/api/admin",     adminRoutes);
// Mount dietician routes — all endpoints require verifyToken + isDietician middleware
app.use("/api/dietician",  dieticianRoutes);
// Mount instructor routes — all endpoints require verifyToken + isInstructor middleware
app.use("/api/instructor", instructorRoutes);
// Mount consumer routes — all endpoints require verifyToken + isConsumer middleware
app.use("/api/consumer",   consumerRoutes);
// Mount professionals directory — any authenticated user can browse professionals
app.use("/api/professionals", professionalRoutes);
// Mount professional-specific endpoints (role-protected: Dietician or Instructor only)
// Note: same router, different mount path — /api/professional (singular) vs /api/professionals (plural)
app.use("/api/professional", professionalRoutes);
// Mount AI diet plan generation route (RAG pipeline — no auth middleware for now)
app.use("/api/diet-plan",  dietPlanRoutes);
// Mount Free Tier AI Chat route — POST /api/chat/send
app.use("/api/chat",       chatRoutes);

// A simple test route to verify the server is up
app.get("/", (req, res) => {
  res.send("NutriFit AI Backend is Running with Auth & Cookies!");
});

// --- START SERVER ---
const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Seed default WorkoutTemplates (no-op if already seeded)
    await seedWorkoutTemplates();

    // 3. Start the Express server
    app.listen(env.PORT, () => {
      console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1); // Stop the app if it fails to start
  }
};

startServer();