/**
 * @file seedTemplates.js
 * @description Auto-seed utility for WorkoutTemplate documents.
 *
 * Called once from backend/index.js immediately after the MongoDB connection
 * is established. If the `workouttemplates` collection already contains at
 * least one document the function exits immediately, so it is safe to call on
 * every server restart without duplicating data.
 *
 * Seeded templates:
 *   1. Fat Loss Circuit      — goal_tag: "Weight Loss"
 *   2. Hypertrophy Builder   — goal_tag: "Muscle Gain"
 *   3. Cardio Endurance Run  — goal_tag: "Cardio"
 */

const WorkoutTemplate = require("../models/WorkoutTemplate");

/**
 * seedWorkoutTemplates
 * @description Inserts the 3 default workout templates if the collection is
 * empty. Logs the outcome so it is visible in docker-compose logs.
 *
 * @returns {Promise<void>}
 */
const seedWorkoutTemplates = async () => {
  try {
    // ── Guard: skip if templates already exist ──────────────────────────────
    const count = await WorkoutTemplate.countDocuments();
    if (count > 0) {
      console.log(
        `✅ WorkoutTemplates: ${count} template(s) already in DB — skipping seed.`
      );
      return;
    }

    // ── Default templates ────────────────────────────────────────────────────
    const templates = [
      {
        name:     "Fat Loss Circuit",
        goal_tag: "Weight Loss",
        exercises: [
          { exerciseName: "Burpee",            baseSets: 4, baseReps: 15 },
          { exerciseName: "Jump Squat",         baseSets: 4, baseReps: 12 },
          { exerciseName: "Mountain Climber",   baseSets: 3, baseReps: 20 },
          { exerciseName: "High Knees",         baseSets: 3, baseReps: 30 },
          { exerciseName: "Push-Up",            baseSets: 3, baseReps: 15 },
        ],
      },
      {
        name:     "Hypertrophy Builder",
        goal_tag: "Muscle Gain",
        exercises: [
          { exerciseName: "Barbell Back Squat", baseSets: 4, baseReps: 8  },
          { exerciseName: "Bench Press",        baseSets: 4, baseReps: 8  },
          { exerciseName: "Barbell Row",        baseSets: 3, baseReps: 10 },
          { exerciseName: "Overhead Press",     baseSets: 3, baseReps: 10 },
          { exerciseName: "Romanian Deadlift",  baseSets: 3, baseReps: 10 },
          { exerciseName: "Dumbbell Curl",      baseSets: 3, baseReps: 12 },
        ],
      },
      {
        name:     "Cardio Endurance Run",
        goal_tag: "Cardio",
        exercises: [
          { exerciseName: "Treadmill Jog",      baseSets: 1, baseReps: 1  },
          { exerciseName: "Box Step-Up",        baseSets: 3, baseReps: 20 },
          { exerciseName: "Jumping Jack",       baseSets: 4, baseReps: 40 },
          { exerciseName: "Stationary Bike",    baseSets: 1, baseReps: 1  },
          { exerciseName: "Bear Crawl",         baseSets: 3, baseReps: 10 },
        ],
      },
    ];

    await WorkoutTemplate.insertMany(templates);
    console.log("🌱 WorkoutTemplates seeded: 3 default templates inserted.");
  } catch (error) {
    // Non-fatal — log and continue; the server should still start
    console.error("❌ WorkoutTemplate seed failed:", error.message);
  }
};

module.exports = seedWorkoutTemplates;
