const REQUIRED_DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const REQUIRED_MEALS = ["breakfast", "lunch", "dinner"];

/** Forbidden ingredient patterns keyed by onboarding preference label. */
const FORBIDDEN_BY_PREFERENCE = {
  Halal: [
    /\bpork\b/i,
    /\bbacon\b/i,
    /\bham\b/i,
    /\bprosciutto\b/i,
    /\bpepperoni\b/i,
    /\blard\b/i,
    /\bpancetta\b/i,
    /\bsalami\b(?!.*halal)/i,
    /\bsausage\b(?!.*(halal|chicken|turkey|beef))/i,
    /\bwine\b/i,
    /\bbeer\b/i,
    /\brum\b/i,
    /\bvodka\b/i,
    /\bwhisk(e)?y\b/i,
    /\bbrandy\b/i,
    /\balcohol\b/i,
    /\bgelatin\b(?!.*(halal|agar|plant))/i,
  ],
  Vegan: [
    /\bchicken\b/i,
    /\bturkey\b/i,
    /\bbeef\b/i,
    /\blamb\b/i,
    /\bpork\b/i,
    /\bbacon\b/i,
    /\bham\b/i,
    /\bfish\b/i,
    /\bsalmon\b/i,
    /\btuna\b/i,
    /\bshrimp\b/i,
    /\bprawn/i,
    /\begg\b/i,
    /\bcheese\b/i,
    /\bmilk\b/i,
    /\byogurt\b/i,
    /\bbutter\b/i,
    /\bcream\b/i,
    /\bhoney\b/i,
  ],
  Vegetarian: [
    /\bchicken\b/i,
    /\bturkey\b/i,
    /\bbeef\b/i,
    /\blamb\b/i,
    /\bpork\b/i,
    /\bbacon\b/i,
    /\bham\b/i,
    /\bfish\b/i,
    /\bsalmon\b/i,
    /\btuna\b/i,
    /\bshrimp\b/i,
    /\bprawn/i,
  ],
};

const DAY_KEY_ALIASES = {
  mon: "monday",
  tue: "tuesday",
  tues: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

/**
 * Normalises model output keys to lowercase monday–sunday with breakfast/lunch/dinner.
 */
function normalizeWeekSchedule(raw) {
  if (!raw || typeof raw !== "object") return {};

  const normalized = {};
  for (const [key, value] of Object.entries(raw)) {
    const dayKey = String(key).trim().toLowerCase();
    const resolvedDay = DAY_KEY_ALIASES[dayKey] ?? dayKey;
    if (!REQUIRED_DAYS.includes(resolvedDay)) continue;

    const meals = value && typeof value === "object" ? value : {};
    normalized[resolvedDay] = {
      breakfast: String(meals.breakfast ?? meals.Breakfast ?? "").trim(),
      lunch:     String(meals.lunch     ?? meals.Lunch     ?? "").trim(),
      dinner:    String(meals.dinner    ?? meals.Dinner    ?? "").trim(),
    };
  }
  return normalized;
}

function validateWeekSchedule(weekSchedule) {
  const missing = [];

  for (const day of REQUIRED_DAYS) {
    const dayMeals = weekSchedule?.[day];
    if (!dayMeals) {
      missing.push(`${day} (entire day)`);
      continue;
    }
    for (const meal of REQUIRED_MEALS) {
      const text = dayMeals[meal];
      if (!text || typeof text !== "string" || !text.trim()) {
        missing.push(`${day}.${meal}`);
      }
    }
  }

  return missing.length
    ? { valid: false, missing }
    : { valid: true };
}

function collectMealTexts(weekSchedule) {
  const texts = [];
  for (const day of REQUIRED_DAYS) {
    for (const meal of REQUIRED_MEALS) {
      const text = weekSchedule?.[day]?.[meal];
      if (text) texts.push({ day, meal, text });
    }
  }
  return texts;
}

function validateDietaryCompliance(weekSchedule, dietaryPreferences = []) {
  const activePrefs = dietaryPreferences.filter((p) => p && p !== "None");
  if (activePrefs.length === 0) return { valid: true, violations: [] };

  const violations = [];

  for (const pref of activePrefs) {
    const patterns = FORBIDDEN_BY_PREFERENCE[pref];
    if (!patterns) continue;

    for (const { day, meal, text } of collectMealTexts(weekSchedule)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          violations.push(
            `${day} ${meal} violates ${pref} preference (found forbidden item in: "${text.length > 80 ? `${text.slice(0, 80)}…` : text}")`
          );
          break;
        }
      }
    }
  }

  return violations.length
    ? { valid: false, violations }
    : { valid: true, violations: [] };
}

function formatDietaryConstraints(dietaryPreferences = []) {
  const active = dietaryPreferences.filter((p) => p && p !== "None");
  if (active.length === 0) {
    return "No specific dietary preference restrictions beyond medical conditions.";
  }

  const rules = {
    Halal:
      "HALAL (mandatory): Every meal must be halal-compliant. NEVER include pork, bacon, ham, " +
      "prosciutto, pepperoni, lard, pancetta, or alcohol in any form. Use only halal-certified " +
      "or naturally halal proteins (halal chicken, halal beef, lamb, fish, eggs, legumes, tofu). " +
      "When in doubt, choose plant-based or clearly halal-labelled options.",
    Vegan:
      "VEGAN (mandatory): No meat, poultry, fish, seafood, eggs, dairy, honey, or animal-derived gelatin.",
    Vegetarian:
      "VEGETARIAN (mandatory): No meat, poultry, fish, or seafood. Eggs and dairy are allowed unless Vegan is also listed.",
    Keto:
      "KETO (mandatory): Keep net carbohydrates low; avoid sugar, bread, pasta, rice, and starchy sides.",
    "Gluten-Free":
      "GLUTEN-FREE (mandatory): No wheat, barley, rye, or regular pasta/bread unless explicitly gluten-free.",
  };

  return active
    .map((pref) => `  • ${rules[pref] ?? `${pref}: strictly follow this eating pattern in every meal.`}`)
    .join("\n");
}

module.exports = {
  REQUIRED_DAYS,
  REQUIRED_MEALS,
  normalizeWeekSchedule,
  validateWeekSchedule,
  validateDietaryCompliance,
  formatDietaryConstraints,
};
