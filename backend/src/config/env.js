const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { z } = require("zod");

const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
];

const loadedEnvPath = envPaths.find((envPath) => fs.existsSync(envPath));

if (loadedEnvPath) {
  dotenv.config({ path: loadedEnvPath });
} else {
  dotenv.config();
}

// Define the schema using Zod
const envSchema = z.object({
  PORT: z.string().default("5000"),
  MONGO_URI: z.string().min(1, "Mongo URI is required"),
  JWT_SECRET: z.string().min(1, "JWT Secret is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // GEMINI_API_KEY is optional at startup; ragController validates it at request time
  GEMINI_API_KEY: z.string().optional(),
});

// Validate
const envVars = envSchema.safeParse(process.env);

if (!envVars.success) {
  console.error("❌ Invalid environment variables.");
  console.error("Create a .env file in /backend (or project root) using backend/.env.example.");
  console.error(envVars.error.format());
  process.exit(1);
}

module.exports = envVars.data;