/**
 * @file utils/workoutExerciseValidation.js
 * @description Client-side validation for instructor workout exercise forms.
 */

const NUMERIC_FIELDS_BY_TYPE = {
  sets_reps:  ["sets", "reps"],
  sets_time:  ["sets", "durationSecs"],
  distance:   ["distanceValue"],
  time:       ["timeMinutes"],
  laps:       ["laps"],
};

/**
 * validateWorkoutExercises — Ensures exercise names are present and numeric fields are not negative.
 * @param {Array}  exercises
 * @param {{ requireNames?: boolean }} options
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateWorkoutExercises(exercises, { requireNames = true } = {}) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { valid: false, error: "Add at least one exercise." };
  }

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const label = `Exercise ${i + 1}`;

    if (requireNames && !String(ex.exerciseName || "").trim()) {
      return { valid: false, error: `${label} needs a name.` };
    }

    const type = ex.metricType || "sets_reps";
    const fields = NUMERIC_FIELDS_BY_TYPE[type] || NUMERIC_FIELDS_BY_TYPE.sets_reps;

    for (const field of fields) {
      const raw = ex[field];
      if (raw === "" || raw === null || raw === undefined) continue;
      const num = Number(raw);
      if (Number.isNaN(num) || num < 0) {
        return {
          valid: false,
          error: `${label}: ${field.replace(/([A-Z])/g, " $1")} cannot be negative.`,
        };
      }
    }
  }

  return { valid: true };
}
