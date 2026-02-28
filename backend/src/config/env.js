// src/config/env.js
const dotenv = require("dotenv");
const { z } = require("zod");

// Load .env file
dotenv.config();

// Define the schema using Zod
const envSchema = z.object({
  PORT: z.string().default("5000"),
  MONGO_URI: z.string().min(1, "Mongo URI is required"),
  JWT_SECRET: z.string().min(1, "JWT Secret is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// Validate
const envVars = envSchema.safeParse(process.env);

if (!envVars.success) {
  console.error("❌ Invalid environment variables:", envVars.error.format());
  process.exit(1);
}

module.exports = envVars.data;