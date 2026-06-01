/**
 * @file visionController.js
 * @description Stateless AI meal scanner — estimates calories from a food image
 *              via the Google Gemini Vision API. No database reads or writes.
 *
 * Resilience: tries multiple vision-capable Flash models in priority order,
 * with per-model retries on transient overload (503/429). Calorie estimation
 * does not need the heaviest model — any multimodal Flash variant is sufficient.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

const SYSTEM_PROMPT =
  "You are a nutrition assistant analyzing a food photo. " +
  "Identify the visible food items and estimate the total calories for the portion shown on the plate or in the container. " +
  "Use typical serving sizes for what is visible. If uncertain, choose a moderate estimate — not a minimum or maximum. " +
  "Return ONLY one whole number (integer). No words, units, punctuation, or explanation.";

/** Deterministic generation — vision scans should not vary wildly on the same image. */
const GENERATION_CONFIG = {
  temperature: 0,
  topP: 1,
  topK: 1,
  maxOutputTokens: 8,
};

/** Plausible range for a single meal photo (kcal). Outside this is likely a bad guess. */
const MIN_MEAL_CALORIES = 50;
const MAX_MEAL_CALORIES = 3000;

/** Vision-capable models, best quality first → lighter fallbacks when overloaded. */
const VISION_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
];

const MAX_RETRIES_PER_MODEL = 2;
const RETRY_BASE_DELAY_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorStatus = (error) => {
  const msg = error?.message ?? "";
  const bracketMatch = msg.match(/\[(429|503|404|500)\s/);
  if (bracketMatch) return Number(bracketMatch[1]);
  if (typeof error?.status === "number") return error.status;
  return null;
};

/** Strip the huge JSON blob Google appends to SDK error messages. */
const formatGeminiError = (error) => {
  const msg = error?.message ?? String(error);
  const status = getErrorStatus(error);
  const summary = msg.split(". [{")[0].split("\n")[0].trim();
  return status ? `[${status}] ${summary}` : summary;
};

const isModelNotFoundError = (error) => {
  if (getErrorStatus(error) === 404) return true;
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("not found") || msg.includes("is not supported");
};

const isQuotaExceededError = (error) => {
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("quota exceeded") || msg.includes("exceeded your current quota");
};

const isRetryableError = (error) => {
  if (isQuotaExceededError(error)) return false;

  const status = getErrorStatus(error);
  if (status === 503 || status === 429 || status === 500) return true;
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("resource exhausted")
  );
};

const isServiceOverloaded = (error) => {
  if (isQuotaExceededError(error)) return false;

  const status = getErrorStatus(error);
  if (status === 503 || status === 429) return true;
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("high demand") || msg.includes("overloaded");
};

/**
 * Parses the model output into a single calorie integer.
 * Prefers a digits-only response; falls back to the first number found.
 */
const parseCalorieEstimate = (rawText) => {
  const trimmed = rawText.trim();
  const digitsOnly = trimmed.replace(/[,.\s]/g, "");

  if (/^\d+$/.test(digitsOnly)) {
    return Number(digitsOnly);
  }

  const numericMatch = trimmed.match(/\d+/);
  return numericMatch ? Number(numericMatch[0]) : NaN;
};

/**
 * Calls Gemini with the meal image, cycling models and retrying on transient errors.
 * @returns {Promise<{ rawText: string, modelName: string }>}
 */
const estimateCaloriesWithFallback = async (genAI, buffer, mimetype) => {
  const imagePart = {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType: mimetype,
    },
  };

  let lastError = null;

  for (const modelName of VISION_MODELS) {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        if (attempt === 0) {
          console.log(`[visionController] 🤖 Trying ${modelName}...`);
        } else {
          console.log(
            `[visionController] ⏳ Retry ${attempt}/${MAX_RETRIES_PER_MODEL} on ${modelName}...`
          );
          await sleep(RETRY_BASE_DELAY_MS * attempt);
        }

        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
        });

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [imagePart] }],
          generationConfig: GENERATION_CONFIG,
        });
        const rawText = result.response.text().trim();
        console.log(`[visionController] ✅ Response from ${modelName}:`, rawText);
        return { rawText, modelName };
      } catch (error) {
        lastError = error;
        console.warn(`[visionController] ⚠️ ${modelName} failed: ${formatGeminiError(error)}`);

        if (isQuotaExceededError(error)) break;

        if (isModelNotFoundError(error)) break;

        if (isRetryableError(error) && attempt < MAX_RETRIES_PER_MODEL) continue;
        if (isRetryableError(error)) break;

        throw error;
      }
    }
  }

  throw lastError ?? new Error("All vision models failed.");
};

/**
 * scanMeal — POST /api/vision/scan
 * Accepts a JPEG/PNG image (via multer memory buffer) and returns an estimated
 * calorie count as { estimatedCalories: Number }.
 */
const scanMeal = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided. Upload a JPEG or PNG." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Vision service is not configured (GEMINI_API_KEY missing)." });
    }

    const { buffer, mimetype } = req.file;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const { rawText, modelName } = await estimateCaloriesWithFallback(genAI, buffer, mimetype);

    const estimatedCalories = parseCalorieEstimate(rawText);
    if (!Number.isFinite(estimatedCalories)) {
      return res.status(422).json({
        error: "Could not parse a valid calorie estimate from the AI response.",
      });
    }

    if (estimatedCalories < MIN_MEAL_CALORIES || estimatedCalories > MAX_MEAL_CALORIES) {
      return res.status(422).json({
        error: `AI estimate (${estimatedCalories} kcal) looks unrealistic. Please try scanning again.`,
      });
    }

    console.log(`[visionController] ✅ Estimated calories: ${estimatedCalories} (via ${modelName})`);

    return res.status(200).json({
      estimatedCalories,
      approximate: true,
    });
  } catch (error) {
    console.error("[visionController] ❌ scanMeal error:", formatGeminiError(error));

    if (isQuotaExceededError(error)) {
      return res.status(429).json({
        error: "Gemini API free-tier quota reached. Wait a minute and try again, or check usage in Google AI Studio.",
      });
    }

    if (isServiceOverloaded(error)) {
      return res.status(503).json({
        error: "The AI service is temporarily busy. Please wait a moment and try again.",
      });
    }

    return res.status(500).json({
      error: "Failed to scan meal. Please try again.",
    });
  }
};

module.exports = { scanMeal };
