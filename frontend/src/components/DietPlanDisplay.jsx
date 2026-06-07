/**
 * @file components/DietPlanDisplay.jsx
 * @description Renders a 7-day AI-generated diet plan as a responsive CSS
 *              Grid calendar layout, with an inline "Generate Plan" form.
 *
 * Props:
 *   weekSchedule            {object}   — The weekSchedule JSON from the DietPlan document.
 *   generatedAt             {string}   — ISO date string for the plan creation timestamp.
 *   planData                {object}   — (Optional) Full DietPlan document (enables PDF download).
 *   consumer                {object}   — Consumer user object (used to pre-fill the generate form).
 *   isPremium               {boolean}  — Whether the consumer holds an active premium subscription.
 *   onUpgradeClick          {function} — Called when a free-tier user clicks the locked download
 *                                        button — navigates them to the Professional Hub paywall.
 *   onPlanGenerated         {function} — Callback called with the new plan after a
 *                                        successful generate request. The parent can
 *                                        update its own state from this callback.
 *   dieticianId             {string}   — (Optional) ObjectId of the connected dietician.
 *                                        When truthy, dietician action buttons are shown.
 *   connectedDieticianName  {string}   — (Optional) Display name of the connected dietician.
 */

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { generatePDF } from "../utils/generatePDF";
import AdherenceChecklist from "./AdherenceChecklist";
import "./DietPlanDisplay.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_ORDER = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const DAY_LABELS = {
  monday:    "Monday",
  tuesday:   "Tuesday",
  wednesday: "Wednesday",
  thursday:  "Thursday",
  friday:    "Friday",
  saturday:  "Saturday",
  sunday:    "Sunday",
};

const MEAL_META = {
  breakfast: { icon: "🌅", label: "Breakfast" },
  lunch:     { icon: "☀️",  label: "Lunch"     },
  dinner:    { icon: "🌙", label: "Dinner"    },
};

const GOAL_OPTIONS = [
  "Lose Weight",
  "Gain Muscle",
  "Maintain Weight",
  "Improve Endurance",
  "General Fitness",
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** MealSlot — A single meal card inside a day column. */
const MealSlot = ({ type, text }) => {
  const meta = MEAL_META[type] || { icon: "🍽", label: type };
  return (
    <div className={`dpd-meal dpd-meal--${type}`}>
      <div className="dpd-meal__header">
        <span className="dpd-meal__icon" aria-hidden="true">{meta.icon}</span>
        <span className="dpd-meal__label">{meta.label}</span>
      </div>
      <p className="dpd-meal__text">{text || "—"}</p>
    </div>
  );
};

/** DayColumn — One day's column in the calendar grid. */
const DayColumn = ({ day, dayData, isToday }) => {
  const meals = dayData || {};
  return (
    <div className={`dpd-day ${isToday ? "dpd-day--today" : ""}`}>
      <div className="dpd-day__header">
        <span className="dpd-day__name">{DAY_LABELS[day]}</span>
      </div>
      <div className="dpd-day__meals">
        <MealSlot type="breakfast" text={meals.breakfast} />
        <MealSlot type="lunch"     text={meals.lunch}     />
        <MealSlot type="dinner"    text={meals.dinner}    />
      </div>
    </div>
  );
};

// ─── Generate Form ────────────────────────────────────────────────────────────

/**
 * GenerateForm — Inline expandable form that collects the user's health
 * profile inputs and POSTs to /api/diet-plan/generate.
 *
 * Props:
 *   consumer         {object}   — Pre-fill values from the consumer profile.
 *   onSuccess        {function} — Called with the new plan data on success.
 *   onCancel         {function} — Called when the user dismisses the form.
 *   hasExistingPlan  {boolean}  — Controls the button label (Generate vs Regenerate).
 */
const GenerateForm = ({ consumer, onSuccess, onCancel, hasExistingPlan }) => {
  const activePreferences = (consumer?.dietary_preferences ?? []).filter(
    (pref) => pref && pref !== "None"
  );

  const [form, setForm] = useState({
    age:               consumer?.age               ?? "",
    weight:            consumer?.weight             ?? "",
    goal:              consumer?.primary_goal       ?? consumer?.goal ?? "",
    medicalConditions: consumer?.medical_conditions ?? "",
  });
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState("");
  const submittingRef = useRef(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || generating) return;

    if (!consumer?._id) {
      setError("Could not identify your account. Please log out and log back in.");
      return;
    }

    submittingRef.current = true;
    setError("");
    setGenerating(true);

    try {
      const response = await fetch("/api/diet-plan/generate", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId:        consumer._id,
          age:               form.age,
          weight:            form.weight,
          goal:              form.goal,
          medicalConditions: form.medicalConditions,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || data.error || `Server error (${response.status})`
        );
      }

      const plan = data.data ?? data;
      onSuccess(plan);
    } catch (err) {
      setError(err.message || "Failed to generate your plan. Please try again.");
    } finally {
      submittingRef.current = false;
      setGenerating(false);
    }
  };

  // Render the overlay via a portal directly into document.body so it
  // escapes any parent CSS stacking context (transform, filter, etc.)
  return createPortal(
    <div className="dpd-gen-overlay" role="dialog" aria-modal="true" aria-label="Generate AI Diet Plan">
      <div className="dpd-gen-modal">
        {/* Sticky modal header — never scrolls away */}
        <div className="dpd-gen-modal__header">
          <div className="dpd-gen-modal__title-row">
            <h3 className="dpd-gen-modal__title">
              {hasExistingPlan ? "Regenerate AI Diet Plan" : "Generate AI Diet Plan"}
            </h3>
          </div>
          <button
            type="button"
            className="dpd-gen-modal__close"
            onClick={onCancel}
            disabled={generating}
            aria-label="Close generate form"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body below the sticky header */}
        <div className="dpd-gen-modal__body">
          <p className="dpd-gen-modal__sub">
            Your plan will be built by the Gemini AI model using your health profile
            and registered dietary preferences. Fill in your details below to get a
            personalised 7-day schedule.
          </p>

          {activePreferences.length > 0 && (
            <div className="dpd-gen-prefs">
              <p className="dpd-gen-label">Your dietary preferences (always applied)</p>
              <div className="dpd-gen-prefs__chips" role="list" aria-label="Dietary preferences">
                {activePreferences.map((pref) => (
                  <span key={pref} className="dpd-gen-prefs__chip" role="listitem">{pref}</span>
                ))}
              </div>
            </div>
          )}

        {/* Loading overlay */}
          {generating && (
            <div className="dpd-gen-loading" aria-live="polite">
              <span className="dpd-gen-loading__spinner" aria-hidden="true" />
              <p className="dpd-gen-loading__text">
                Generating your custom AI plan — this can take up to a minute…
              </p>
              <p className="dpd-gen-loading__hint">Please don&apos;t click again while this runs.</p>
            </div>
          )}

          {/* Error shown after a failed attempt (including while form is visible again) */}
          {!generating && error && (
            <div className="dpd-gen-error" role="alert">{error}</div>
          )}

          {/* Form */}
          {!generating && (
            <form className="dpd-gen-form" onSubmit={handleSubmit} id="dpd-generate-form">
              {/* Age */}
              <div className="dpd-gen-field">
                <label className="dpd-gen-label" htmlFor="dpd-age">
                  Age <span className="dpd-gen-label__hint">(years)</span>
                </label>
                <input
                  id="dpd-age"
                  name="age"
                  type="number"
                  min="10"
                  max="110"
                  className="dpd-gen-input"
                  placeholder="e.g. 24"
                  value={form.age}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Weight */}
              <div className="dpd-gen-field">
                <label className="dpd-gen-label" htmlFor="dpd-weight">
                  Weight <span className="dpd-gen-label__hint">(kg)</span>
                </label>
                <input
                  id="dpd-weight"
                  name="weight"
                  type="number"
                  min="20"
                  max="300"
                  step="0.1"
                  className="dpd-gen-input"
                  placeholder="e.g. 75"
                  value={form.weight}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Fitness Goal */}
              <div className="dpd-gen-field">
                <label className="dpd-gen-label" htmlFor="dpd-goal">
                  Fitness Goal
                  <span className="dpd-gen-label__required" aria-hidden="true"> *</span>
                </label>
                <select
                  id="dpd-goal"
                  name="goal"
                  className="dpd-gen-select"
                  value={form.goal}
                  onChange={handleChange}
                  required
                >
                  <option value="">— Select your goal —</option>
                  {GOAL_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Medical Conditions */}
              <div className="dpd-gen-field">
                <label className="dpd-gen-label" htmlFor="dpd-medical">
                  Medical Conditions{" "}
                  <span className="dpd-gen-label__hint">(optional — e.g. diabetes, lactose intolerance)</span>
                </label>
                <textarea
                  id="dpd-medical"
                  name="medicalConditions"
                  className="dpd-gen-textarea"
                  rows={2}
                  placeholder="Leave blank if none"
                  value={form.medicalConditions}
                  onChange={handleChange}
                  maxLength={400}
                />
              </div>

              {/* Actions */}
              <div className="dpd-gen-actions">
                <button
                  type="button"
                  className="dpd-gen-btn dpd-gen-btn--cancel"
                  onClick={onCancel}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="dpd-gen-submit-btn"
                  className="dpd-gen-btn dpd-gen-btn--submit"
                  disabled={generating}
                >
                  <span aria-hidden="true">✦</span>
                  {hasExistingPlan ? "Regenerate My Plan" : "Generate My Plan"}
                </button>
              </div>
            </form>
          )}
        </div>{/* end .dpd-gen-modal__body */}
      </div>
    </div>,
    document.body   // ← renders outside the dashboard stacking context
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DietPlanDisplay = ({
  weekSchedule,
  generatedAt,
  planData,
  consumer,
  isPremium            = false,
  onUpgradeClick,
  onPlanGenerated,
  onPlanDeleted,
  dieticianId          = null,
  connectedDieticianName = "",
}) => {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [showForm,    setShowForm]    = useState(false);
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [pdfError,    setPdfError]    = useState("");
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deleteError,  setDeleteError]  = useState("");

  // ── Dietician action state ─────────────────────────────────────────────────
  const [sendingToDiet,  setSendingToDiet]  = useState(false);
  const [sendDietStatus, setSendDietStatus] = useState({ type: "", text: "" });
  const [requestingPlan, setRequestingPlan] = useState(false);
  const [requestNotes,   setRequestNotes]   = useState("");
  const [requestStatus,  setRequestStatus]  = useState({ type: "", text: "" });
  const hasExistingPlan = !!(weekSchedule && Object.keys(weekSchedule).length > 0);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePlanGenerated = (newPlan) => {
    setShowForm(false);
    if (typeof onPlanGenerated === "function") {
      onPlanGenerated(newPlan);
    }
  };

  /** Send the current AI plan to the connected dietician for review. */
  const handleSendToDietician = async () => {
    setSendingToDiet(true);
    setSendDietStatus({ type: "", text: "" });
    try {
      const res = await fetch("/api/diet-plan/send-to-dietician", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerId: consumer?._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
      setSendDietStatus({ type: "success", text: data.message || "Plan sent to your dietician!" });
    } catch (err) {
      setSendDietStatus({ type: "error", text: err.message || "Failed to send plan." });
    } finally {
      setSendingToDiet(false);
    }
  };

  /** Request the connected dietician to build a custom plan. */
  const handleRequestFromDietician = async () => {
    setRequestingPlan(true);
    setRequestStatus({ type: "", text: "" });
    try {
      const res = await fetch("/api/diet-plan/request-from-dietician", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId: consumer?._id,
          notes:      requestNotes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
      setRequestStatus({ type: "success", text: data.message || "Request sent to your dietician!" });
      setRequestNotes("");
    } catch (err) {
      setRequestStatus({ type: "error", text: err.message || "Failed to send request." });
    } finally {
      setRequestingPlan(false);
    }
  };

  /** Delete the current AI diet plan. */
  const handleDeletePlan = async () => {
    if (!planData?._id) return;
    setDeletingPlan(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/diet-plan/${planData._id}`, {
        method:      "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
      if (typeof onPlanDeleted === "function") onPlanDeleted();
    } catch (err) {
      setDeleteError(err.message || "Failed to delete plan.");
    } finally {
      setDeletingPlan(false);
    }
  };

  const handleDownloadPDF = async () => {
    setPdfError("");
    if (!planData && !weekSchedule) {
      setPdfError("No plan data available to export.");
      return;
    }
    setPdfLoading(true);
    try {
      const data = planData ?? { weekSchedule, generatedAt };
      const { doc, filename } = generatePDF(data);
      doc.save(`${filename}.pdf`);
    } catch (err) {
      console.error("[DietPlanDisplay] PDF generation failed:", err);
      setPdfError("Could not generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  // Determine today's key for the grid highlight
  const todayKey = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();

  return (
    <div className="dpd-container">

      {/* ── Generate form modal (rendered inline, above everything) ── */}
      {showForm && (
        <GenerateForm
          consumer={consumer}
          onSuccess={handlePlanGenerated}
          onCancel={() => setShowForm(false)}
          hasExistingPlan={hasExistingPlan}
        />
      )}

      {/* ── Action bar (always visible) ── */}
      <div className="dpd-action-bar">
        {/* Generate / Regenerate trigger */}
        <button
          id="dpd-generate-btn"
          className="dpd-gen-trigger-btn"
          onClick={() => setShowForm(true)}
          disabled={showForm}
        >
          {hasExistingPlan ? "Regenerate AI Plan" : "Generate New AI Diet Plan"}
        </button>

        {/* PDF download — only shown when there is an active plan */}
        {hasExistingPlan && (
          isPremium ? (
            /* ── Premium: real download ── */
            <button
              id="dpd-download-btn"
              className={`dpd-download-btn${pdfLoading ? " dpd-download-btn--loading" : ""}`}
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              aria-label="Download diet plan as PDF"
              title="Download Diet Plan as PDF"
            >
              {pdfLoading ? (
                <>
                  <span className="dpd-download-btn__spinner" aria-hidden="true" />
                  Generating PDF…
                </>
              ) : (
                <>
                  <span aria-hidden="true">⬇</span>
                  Download Plan
                </>
              )}
            </button>
          ) : (
            /* ── Free tier: locked button → upgrade paywall ── */
            <button
              id="dpd-download-btn"
              className="dpd-download-btn dpd-download-btn--locked"
              onClick={onUpgradeClick}
              aria-label="Upgrade to Premium to download diet plan as PDF"
              title="Upgrade to Premium to unlock PDF downloads"
            >
              <span aria-hidden="true">🔒</span>
              Download Plan{" "}
              <span className="dpd-download-btn__lock-hint">Premium</span>
            </button>
          )
        )}

        {/* Delete plan button — only when plan exists */}
        {hasExistingPlan && planData?._id && (
          <button
            id="dpd-delete-btn"
            className={`dpd-delete-btn${deletingPlan ? " dpd-delete-btn--loading" : ""}`}
            onClick={handleDeletePlan}
            disabled={deletingPlan}
            aria-label="Delete this AI diet plan"
            title="Delete AI Diet Plan"
          >
            {deletingPlan ? (
              <><span className="dpd-delete-btn__spinner" aria-hidden="true" />Deleting…</>
            ) : (
              <>Delete Plan</>
            )}
          </button>
        )}
      </div>
      {deleteError && (
        <div className="dpd-delete-error" role="alert">{deleteError}</div>
      )}

      {/* ── Dietician Action Bar — only visible when connected to a dietician ── */}
      {dieticianId && (
        <div className="dpd-dietician-bar">
          <div className="dpd-dietician-bar__header">
            <div>
              <p className="dpd-dietician-bar__title">Connected Dietician</p>
              <p className="dpd-dietician-bar__name">{connectedDieticianName || "Your Dietician"}</p>
            </div>
          </div>

          <div className="dpd-dietician-bar__actions">
            {/* Send AI plan to dietician — only visible when plan exists */}
            {hasExistingPlan && (
              <button
                id="dpd-send-diet-btn"
                className={`dpd-diet-action-btn dpd-diet-action-btn--send${sendingToDiet ? " dpd-diet-action-btn--loading" : ""}`}
                onClick={handleSendToDietician}
                disabled={sendingToDiet || requestingPlan}
                title="Send your current AI diet plan to your dietician for review"
              >
                {sendingToDiet ? (
                  <>
                    <span className="dpd-diet-action-btn__spinner" aria-hidden="true" />
                    Sending…
                  </>
                ) : (
                  <>
                    Send Plan to Dietician
                  </>
                )}
              </button>
            )}

            <div className="dpd-request-notes-wrap">
              <label className="dpd-request-notes-label" htmlFor="dpd-request-notes">
                Notes for your dietician (optional)
              </label>
              <textarea
                id="dpd-request-notes"
                className="dpd-request-notes"
                placeholder="Goals, allergies, preferences…"
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                maxLength={500}
                rows={2}
                disabled={requestingPlan || sendingToDiet}
              />
            </div>

            {/* Request dietician to build a custom plan */}
            <button
              id="dpd-request-diet-btn"
              className={`dpd-diet-action-btn dpd-diet-action-btn--request${requestingPlan ? " dpd-diet-action-btn--loading" : ""}`}
              onClick={handleRequestFromDietician}
              disabled={requestingPlan || sendingToDiet}
              title="Ask your dietician to build you a custom plan"
            >
              {requestingPlan ? (
                <>
                  <span className="dpd-diet-action-btn__spinner" aria-hidden="true" />
                  Requesting…
                </>
              ) : (
                <>
                  Request Plan from Dietician
                </>
              )}
            </button>
          </div>

          {/* Status messages for dietician actions */}
          {sendDietStatus.text && (
            <div
              className={`dpd-diet-status dpd-diet-status--${sendDietStatus.type}`}
              role={sendDietStatus.type === "error" ? "alert" : "status"}
            >
              <span aria-hidden="true">{sendDietStatus.type === "success" ? "✔" : "✕"}</span>
              {sendDietStatus.text}
            </div>
          )}
          {requestStatus.text && (
            <div
              className={`dpd-diet-status dpd-diet-status--${requestStatus.type}`}
              role={requestStatus.type === "error" ? "alert" : "status"}
            >
              <span aria-hidden="true">{requestStatus.type === "success" ? "✔" : "✕"}</span>
              {requestStatus.text}
            </div>
          )}
        </div>
      )}

      {/* PDF error */}
      {pdfError && (
        <div className="dpd-pdf-error" role="alert">{pdfError}</div>
      )}

      {/* ── Empty state — no plan generated yet ── */}
      {!hasExistingPlan && (
        <div className="dpd-empty">
          <p className="dpd-empty__text">No AI diet plan generated yet.</p>
          <p className="dpd-empty__sub">
            Click "Generate New AI Diet Plan" above to create your personalised
            7-day schedule using your health profile.
          </p>
        </div>
      )}

      {/* ── Full plan display — shown when weekSchedule is populated ── */}
      {hasExistingPlan && (
        <>
          {/* Plan header */}
          <div className="dpd-header">
            <div className="dpd-header__left">
              <div>
                <h2 className="dpd-header__title">Your AI-Generated Diet Plan</h2>
                {generatedAt && (
                  <p className="dpd-header__sub">
                    Generated on{" "}
                    {new Date(generatedAt).toLocaleDateString("en-US", {
                      weekday: "long", year: "numeric", month: "long", day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
            <span className="dpd-header__badge">✦ Powered by Gemini AI</span>
          </div>

          {/* Legend */}
          <div className="dpd-legend">
            {Object.entries(MEAL_META).map(([type, meta]) => (
              <span key={type} className={`dpd-legend__item dpd-legend__item--${type}`}>
                {meta.icon} {meta.label}
              </span>
            ))}
          </div>

          {/* 7-day grid */}
          <div className="dpd-grid" role="grid" aria-label="7-day meal plan">
            {DAYS_ORDER.map((day) => (
              <DayColumn
                key={day}
                day={day}
                dayData={weekSchedule[day]}
                isToday={day === todayKey}
              />
            ))}
          </div>

          <AdherenceChecklist
            type="diet"
            planId={planData?._id}
            enabled={hasExistingPlan && !!planData?._id}
            title="Meal Checklist (for your dietician)"
            subtitle="Tap the date to pick a day, then mark each meal as followed or skipped."
          />

          {/* Disclaimer */}
          <p className="dpd-disclaimer">
            ⚕ This plan is generated by AI and tailored to your health profile.
            Always consult a licensed dietician before making significant dietary changes.
          </p>
        </>
      )}
    </div>
  );
};

export default DietPlanDisplay;
