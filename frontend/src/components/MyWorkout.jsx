/**
 * @file components/MyWorkout.jsx
 * @description Consumer-facing "My Workout" component.
 *
 * Prop-driven — receives the active WorkoutPlan document from the
 * parent (ConsumerDashboard) and renders:
 *   - Loading state → spinner (while parent is fetching)
 *   - Empty state   → friendly card with a call-to-action when no plan exists
 *   - Loaded state  → plan header + responsive grid of exercise cards
 *
 * Props:
 *   workoutPlan {object | null | undefined}
 *     • undefined → still loading (parent fetch in progress)
 *     • null      → fetch complete, no plan assigned
 *     • object    → the active WorkoutPlan document from the API
 *   isPremium      {boolean}  — Whether the consumer holds an active premium subscription.
 *   onUpgradeClick {function} — Called when a free-tier user clicks the locked download
 *                               button — navigates them to the Professional Hub paywall.
 *
 * Styling: BEM class prefix `mw-` (MyWorkout). All layout via CSS
 * Flexbox/Grid in MyWorkout.css — no inline styles, no utility classes.
 */

import { useState } from "react";
import { generatePDF } from "../utils/generatePDF";
import "./MyWorkout.css";

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * ExerciseCard — Displays one exercise from the workout plan.
 *
 * Renders the exercise name, a muscle-group chip (when present),
 * a sets × reps stat block, and an optional duration badge.
 */
const ExerciseCard = ({ exercise, index }) => (
  <div className="mw-exercise-card" id={`exercise-card-${index}`}>
    {/* Exercise number badge */}
    <span className="mw-exercise-card__num">{index + 1}</span>

    {/* Exercise name */}
    <h3 className="mw-exercise-card__name">{exercise.exerciseName}</h3>

    {/* Muscle group chip (optional) */}
    {exercise.muscleGroup && (
      <span className="mw-exercise-card__muscle">{exercise.muscleGroup}</span>
    )}

    {/* Sets × Reps stat block */}
    <div className="mw-exercise-card__stats">
      <div className="mw-exercise-stat">
        <span className="mw-exercise-stat__value">{exercise.sets ?? "—"}</span>
        <span className="mw-exercise-stat__label">Sets</span>
      </div>
      <span className="mw-exercise-card__sep">×</span>
      <div className="mw-exercise-stat">
        <span className="mw-exercise-stat__value">{exercise.reps ?? "—"}</span>
        <span className="mw-exercise-stat__label">Reps</span>
      </div>
    </div>

    {/* Optional duration badge */}
    {exercise.duration && (
      <span className="mw-exercise-card__duration">⏱ {exercise.duration}s</span>
    )}
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * MyWorkout — Consumer's current active workout plan view.
 *
 * @param {{ workoutPlan: object | null | undefined }} props
 */
const MyWorkout = ({ workoutPlan, isPremium = false, onUpgradeClick }) => {
  // ── PDF download state ────────────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError,   setPdfError]   = useState("");

  /**
   * handleDownloadPDF — Generates a WorkoutPlan PDF and triggers a browser
   * download. generatePDF auto-detects the plan type from the data shape.
   * The download is called explicitly here — generatePDF never auto-saves.
   */
  const handleDownloadPDF = async () => {
    if (!workoutPlan) return;
    setPdfError("");
    setPdfLoading(true);
    try {
      const { doc, filename } = generatePDF(workoutPlan);
      doc.save(`${filename}.pdf`);
    } catch (err) {
      console.error("[MyWorkout] PDF generation failed:", err);
      setPdfError("Could not generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Loading state (parent fetch still in-flight) ──────────────────────────
  if (workoutPlan === undefined) {
    return (
      <div className="mw-loading" id="my-workout-loading">
        <div className="mw-spinner" />
        <p>Loading your workout plan…</p>
      </div>
    );
  }

  // ── Empty state (fetch done, no plan assigned) ────────────────────────────
  if (!workoutPlan) {
    return (
      <div className="mw-empty-state" id="my-workout-empty">
        <div className="mw-empty-state__icon">🏋️</div>
        <h2 className="mw-empty-state__title">No Active Workout Assigned</h2>
        <p className="mw-empty-state__text">
          No active workout plan has been assigned yet.
          Request one from a Gym Instructor to get started!
        </p>
        <div className="mw-empty-state__hint">
          💡 Use the{" "}
          <strong>Professional Hub</strong>{" "}
          tab to request a custom workout plan from a certified instructor.
        </div>
      </div>
    );
  }

  // ── Loaded state ──────────────────────────────────────────────────────────
  return (
    <div className="mw-container" id="my-workout-container">

      {/* ── Plan header card ── */}
      <div className="mw-plan-header">
        {/* Left: Title + meta */}
        <div className="mw-plan-header__info">
          <h2 className="mw-plan-header__title">{workoutPlan.title}</h2>

          {workoutPlan.description && (
            <p className="mw-plan-header__desc">{workoutPlan.description}</p>
          )}

          <div className="mw-plan-header__meta">
            {/* Assigned by (populated instructorId) */}
            {workoutPlan.instructorId?.full_name && (
              <span className="mw-meta-chip mw-meta-chip--instructor">
                👤 Assigned by {workoutPlan.instructorId.full_name}
              </span>
            )}

            {/* Creation date */}
            <span className="mw-meta-chip">
              📅{" "}
              {new Date(workoutPlan.createdAt).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>

            {/* Exercise count */}
            <span className="mw-meta-chip mw-meta-chip--count">
              💪 {workoutPlan.exercises?.length ?? 0} exercise
              {workoutPlan.exercises?.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Right: PDF download action */}
        <div className="mw-plan-header__actions">
          {pdfError && (
            <span className="mw-pdf-error" role="alert">{pdfError}</span>
          )}
          {isPremium ? (
            /* ── Premium: real download ── */
            <button
              id="mw-download-btn"
              className={`mw-download-btn${pdfLoading ? " mw-download-btn--loading" : ""}`}
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              aria-label="Download workout plan as PDF"
              title="Download Workout Plan as PDF"
            >
              {pdfLoading ? (
                <>
                  <span className="mw-download-btn__spinner" aria-hidden="true" />
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
              id="mw-download-btn"
              className="mw-download-btn mw-download-btn--locked"
              onClick={onUpgradeClick}
              aria-label="Upgrade to Premium to download workout plan as PDF"
              title="Upgrade to Premium to unlock PDF downloads"
            >
              <span aria-hidden="true">🔒</span>
              Download Plan{" "}
              <span className="mw-download-btn__lock-hint">Premium</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Exercise grid ── */}
      {workoutPlan.exercises?.length > 0 ? (
        <div className="mw-exercises-grid">
          {workoutPlan.exercises.map((ex, i) => (
            <ExerciseCard key={ex._id || i} exercise={ex} index={i} />
          ))}
        </div>
      ) : (
        <div className="mw-no-exercises">
          <p>This plan has no exercises defined yet.</p>
        </div>
      )}

    </div>
  );
};

export default MyWorkout;
