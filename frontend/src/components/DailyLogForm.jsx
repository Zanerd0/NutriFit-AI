/**
 * @file DailyLogForm.jsx
 * @description A form component that lets a Consumer log their body weight for
 * the current day. Submits to POST /api/consumer/log-progress which performs
 * an upsert — updating today's entry if it already exists, or creating a new
 * one if it does not.
 *
 * Props:
 *   onSuccess {function} — optional callback invoked after a successful save;
 *                          used by the parent to trigger a chart data refresh.
 */

import { useState }   from "react";
import axios          from "../api/axios";
import "./DailyLogForm.css";

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * DailyLogForm
 * @param {{ onSuccess?: () => void }} props
 */
const DailyLogForm = ({ onSuccess }) => {
  // ── Local State ─────────────────────────────────────────────────────────────
  const [weight,   setWeight]   = useState("");
  const [status,   setStatus]   = useState({ type: "", text: "" }); // success | error | ""
  const [submitting, setSubmitting] = useState(false);

  // ── Submit Handler ──────────────────────────────────────────────────────────

  /**
   * handleSubmit
   * POSTs { weight } to /api/consumer/log-progress.
   * On success: shows a confirmation banner, clears the input, then calls
   * the optional onSuccess prop so the parent chart can refresh its data.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic client-side guard before hitting the network
    if (!weight || isNaN(Number(weight)) || Number(weight) <= 0) {
      setStatus({ type: "error", text: "Please enter a valid positive weight." });
      return;
    }

    setSubmitting(true);
    setStatus({ type: "", text: "" });

    try {
      const res = await axios.post("/consumer/log-progress", {
        weight: Number(weight),
      });

      // Show the server's confirmation message (handles create vs. update wording)
      setStatus({ type: "success", text: res.data.message });
      setWeight(""); // Clear the input after a successful save

      // Notify parent so the chart can re-fetch the latest data
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setStatus({
        type: "error",
        text: err.response?.data?.error || "Failed to save progress. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="dlf-card" id="daily-log-form-card">
      {/* Card header */}
      <div className="dlf-card__header">
        <div className="dlf-card__icon-wrap">
          <svg className="dlf-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className="dlf-card__title">Log Today's Weight</h2>
          <p className="dlf-card__subtitle">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Form */}
      <form className="dlf-form" onSubmit={handleSubmit} noValidate>
        <div className="dlf-form__group">
          <label className="dlf-form__label" htmlFor="log-weight-input">
            Current Weight
          </label>

          {/* Input row: number field + unit badge */}
          <div className="dlf-input-row">
            <input
              id="log-weight-input"
              type="number"
              step="0.1"
              min="1"
              max="999"
              className="dlf-form__input"
              placeholder="e.g. 72.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              disabled={submitting}
              aria-label="Enter your current body weight"
              aria-describedby={status.text ? "dlf-status-msg" : undefined}
            />
            <span className="dlf-input-unit" aria-label="unit: kilograms or pounds">
              kg / lbs
            </span>
          </div>
        </div>

        {/* Submit button */}
        <button
          id="save-progress-btn"
          type="submit"
          className="dlf-form__btn"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="dlf-spinner" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              <svg className="dlf-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Save Progress
            </>
          )}
        </button>
      </form>

      {/* Status banner (success or error) */}
      {status.text && (
        <div
          id="dlf-status-msg"
          className={`dlf-status dlf-status--${status.type}`}
          role="status"
          aria-live="polite"
        >
          {status.text}
        </div>
      )}

      {/* Informational hint */}
      <p className="dlf-hint">
        Submitting again today will update your existing entry.
      </p>
    </div>
  );
};

export default DailyLogForm;
