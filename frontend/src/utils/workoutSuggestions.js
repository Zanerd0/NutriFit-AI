/**
 * @file workoutSuggestions.js
 * @description Vague, goal-based workout hints for instructors building plans.
 */

const GOAL_SUGGESTIONS = {
  "Lose Weight": [
    "Give more cardio — jogging, cycling, or rowing work well.",
    "Keep rest periods shorter between sets to keep heart rate up.",
    "Favour higher-rep, full-body circuits over heavy low-rep lifting.",
    "Add a short bodyweight finisher at the end of each session.",
  ],
  "Gain Muscle": [
    "Prioritise compound lifts such as squats, presses, and rows.",
    "Allow longer rest between heavy strength sets for recovery.",
    "Progressive overload — slowly increase weight or reps over time.",
    "Add isolation work for lagging muscle groups if needed.",
  ],
  "Maintain Weight": [
    "Balance strength training with moderate cardio.",
    "Mix rep ranges — some heavy work, some higher-rep endurance sets.",
    "Keep sessions varied so the client stays engaged long term.",
    "Include mobility or light active-recovery work in the plan.",
  ],
  "Improve Endurance": [
    "Give more cardio — build in steady-state and interval sessions.",
    "Use time- or distance-based exercises rather than heavy lifting.",
    "Gradually increase duration or distance week to week.",
    "Keep strength work light and supportive, not fatiguing.",
  ],
  "General Fitness": [
    "Blend strength, cardio, and mobility in each week.",
    "Keep exercise selection simple and beginner-friendly.",
    "Rotate movement patterns — push, pull, legs, and core.",
    "Leave room for the client to scale intensity up or down.",
  ],
};

const GOAL_ALIASES = {
  "weight loss": "Lose Weight",
  "lose weight": "Lose Weight",
  "fat loss": "Lose Weight",
  "muscle gain": "Gain Muscle",
  "gain muscle": "Gain Muscle",
  "build muscle": "Gain Muscle",
  "maintain weight": "Maintain Weight",
  "maintenance": "Maintain Weight",
  "improve endurance": "Improve Endurance",
  "endurance": "Improve Endurance",
  "cardio": "Improve Endurance",
  "general fitness": "General Fitness",
  "fitness": "General Fitness",
};

const DEFAULT_SUGGESTIONS = [
  "Ask the client about their goal if it is not set yet.",
  "Start with a simple full-body structure they can follow consistently.",
  "Mix strength and cardio unless you know their preference.",
  "Keep the first plan approachable — progress beats perfection.",
];

/**
 * Normalises free-text or enum goal labels to a known suggestion key.
 * @param {string|null|undefined} goal
 * @returns {string|null}
 */
export const normalizeClientGoal = (goal) => {
  if (!goal || typeof goal !== "string") return null;
  const trimmed = goal.trim();
  if (!trimmed) return null;
  if (GOAL_SUGGESTIONS[trimmed]) return trimmed;
  return GOAL_ALIASES[trimmed.toLowerCase()] || null;
};

/**
 * Returns vague workout suggestions for a client's goal.
 * @param {string|null|undefined} goal — primary_goal or legacy goal field
 * @returns {string[]}
 */
export const getWorkoutSuggestions = (goal) => {
  const normalized = normalizeClientGoal(goal);
  if (normalized && GOAL_SUGGESTIONS[normalized]) {
    return GOAL_SUGGESTIONS[normalized];
  }
  return DEFAULT_SUGGESTIONS;
};

/**
 * @param {object|null|undefined} client — consumer user document
 * @returns {string|null}
 */
export const getClientGoal = (client) =>
  client?.primary_goal || client?.goal || null;
