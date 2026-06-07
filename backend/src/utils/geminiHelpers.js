/**
 * Shared Gemini API helpers — model fallback and error classification.
 * Used by controllers that call generateContent (chat, diet plan, etc.).
 */

const GENERATION_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
];

const getErrorStatus = (error) => {
  const msg = error?.message ?? "";
  const bracketMatch = msg.match(/\[(429|503|404|500)\s/);
  if (bracketMatch) return Number(bracketMatch[1]);
  if (typeof error?.status === "number") return error.status;
  return null;
};

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
 * Calls generateContent, cycling through models when one is unavailable or over quota.
 */
async function generateContentWithFallback(genAI, { contents, generationConfig, logPrefix = "[gemini]" }) {
  let lastError = null;

  for (const modelName of GENERATION_MODELS) {
    try {
      console.log(`${logPrefix} 🤖 Trying ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({ contents, generationConfig });
      const rawText = result.response.text();
      console.log(`${logPrefix} ✅ Response from ${modelName} (${rawText.length} chars).`);
      return { rawText, modelName };
    } catch (error) {
      lastError = error;
      console.warn(`${logPrefix} ⚠️ ${modelName} failed: ${formatGeminiError(error)}`);

      if (isModelNotFoundError(error)) continue;
      if (isQuotaExceededError(error)) continue;
      if (isRetryableError(error)) continue;

      throw error;
    }
  }

  throw lastError ?? new Error("All generation models failed.");
}

module.exports = {
  GENERATION_MODELS,
  getErrorStatus,
  formatGeminiError,
  isModelNotFoundError,
  isQuotaExceededError,
  isRetryableError,
  isServiceOverloaded,
  generateContentWithFallback,
};
