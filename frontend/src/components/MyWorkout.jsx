/**
 * @file components/MyWorkout.jsx
 * @description Consumer-facing "My Workout" component.
 *
 * Props:
 *   workoutPlan          {object | null | undefined}
 *   isPremium            {boolean}
 *   onUpgradeClick       {function}
 *   instructorId         {string | null}   — ObjectId of connected instructor
 *   connectedInstructorName {string}       — Display name of connected instructor
 *   consumer             {object}          — Consumer document
 *
 * Styling: BEM class prefix `mw-`
 */

import { useState } from "react";
import { generatePDF } from "../utils/generatePDF";
import AdherenceChecklist from "./AdherenceChecklist";
import "./MyWorkout.css";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * formatExerciseMetric — Human-readable target for an exercise based on metricType.
 */
const formatExerciseMetric = (ex) => {
  const type = ex.metricType || "sets_reps";
  switch (type) {
    case "sets_time":
      return {
        primary:   ex.sets ?? "—",
        primaryLabel: "Sets",
        sep:       "×",
        secondary: ex.durationSecs ?? "—",
        secondaryLabel: "Sec",
      };
    case "distance":
      return {
        single:    ex.distanceValue ?? "—",
        singleLabel: ex.distanceUnit || "km",
      };
    case "time":
      return {
        single:    ex.timeMinutes ?? "—",
        singleLabel: "Minutes",
      };
    case "laps":
      return {
        single:    ex.laps ?? "—",
        singleLabel: "Laps",
      };
    case "custom":
      return { custom: ex.customMetric || "—" };
    default:
      return {
        primary:   ex.sets ?? "—",
        primaryLabel: "Sets",
        sep:       "×",
        secondary: ex.reps ?? "—",
        secondaryLabel: "Reps",
      };
  }
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * ExerciseMetricDisplay — Renders the correct stat block for the exercise metric type.
 */
const ExerciseMetricDisplay = ({ exercise }) => {
  const metric = formatExerciseMetric(exercise);

  if (metric.custom !== undefined) {
    return (
      <p className="mw-exercise-card__custom-metric">{metric.custom}</p>
    );
  }

  if (metric.single !== undefined) {
    return (
      <div className="mw-exercise-card__stats mw-exercise-card__stats--single">
        <div className="mw-exercise-stat">
          <span className="mw-exercise-stat__value">{metric.single}</span>
          <span className="mw-exercise-stat__label">{metric.singleLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mw-exercise-card__stats">
      <div className="mw-exercise-stat">
        <span className="mw-exercise-stat__value">{metric.primary}</span>
        <span className="mw-exercise-stat__label">{metric.primaryLabel}</span>
      </div>
      <span className="mw-exercise-card__sep">{metric.sep}</span>
      <div className="mw-exercise-stat">
        <span className="mw-exercise-stat__value">{metric.secondary}</span>
        <span className="mw-exercise-stat__label">{metric.secondaryLabel}</span>
      </div>
    </div>
  );
};

/**
 * ExerciseCard — Displays one exercise from the workout plan.
 *
 * Renders the exercise name, a muscle-group chip (when present),
 * and the metric block matching the instructor-assigned metricType.
 */
const ExerciseCard = ({ exercise, index }) => {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const hasNotes = Boolean(String(exercise.notes || "").trim());

  return (
    <div className="mw-exercise-card" id={`exercise-card-${index}`}>
      {/* Exercise number badge */}
      <span className="mw-exercise-card__num">{index + 1}</span>

      {/* Exercise name */}
      <h3 className="mw-exercise-card__name">{exercise.exerciseName}</h3>

      {/* Muscle group chip (optional) */}
      {exercise.muscleGroup && (
        <span className="mw-exercise-card__muscle">{exercise.muscleGroup}</span>
      )}

      <ExerciseMetricDisplay exercise={exercise} />

      {hasNotes && (
        <button
          type="button"
          className={`mw-exercise-card__notes${notesExpanded ? " mw-exercise-card__notes--expanded" : ""}`}
          onClick={() => setNotesExpanded((v) => !v)}
          aria-expanded={notesExpanded}
          title={notesExpanded ? "Click to collapse notes" : "Click to expand notes"}
        >
          <span className="mw-exercise-card__notes-text">{exercise.notes}</span>
          {!notesExpanded && (
            <span className="mw-exercise-card__notes-hint">Show more</span>
          )}
        </button>
      )}
    </div>
  );
};

// =============================================================================
// INSTRUCTOR REQUEST PANEL
// =============================================================================

/**
 * InstructorRequestPanel — shown when consumer is connected to an instructor.
 * Lets them write notes/requirements and submit a workout request.
 */
const InstructorRequestPanel = ({ instructorName, consumer }) => {
  const [notes,      setNotes]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [status,     setStatus]     = useState({ type: "", text: "" });

  const handleRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: "", text: "" });
    try {
      const res = await fetch("/api/professionals/request-workout", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerId: consumer?._id, notes: notes.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`);
      setStatus({ type: "success", text: data.message || "Request sent to your instructor!" });
      setNotes("");
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Failed to send request. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mw-instructor-panel" id="mw-instructor-request">
      <div className="mw-instructor-panel__header">
        <div>
          <p className="mw-instructor-panel__label">Connected Instructor</p>
          <p className="mw-instructor-panel__name">{instructorName || "Your Instructor"}</p>
        </div>
      </div>

      <form className="mw-request-form" onSubmit={handleRequest}>
        <label className="mw-request-form__label" htmlFor="mw-workout-notes">
          Request a Custom Workout Plan
          <span className="mw-request-form__hint"> (optional notes for your instructor)</span>
        </label>
        <textarea
          id="mw-workout-notes"
          className="mw-request-form__textarea"
          placeholder="e.g. I want to focus on upper body, I train 4 days a week, I have a knee injury so no heavy squats…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          disabled={loading}
          maxLength={1000}
        />
        <div className="mw-request-form__footer">
          <span className="mw-request-form__char-count">{notes.length}/1000</span>
          <button
            id="mw-request-workout-btn"
            type="submit"
            className="mw-request-form__btn"
            disabled={loading}
          >
            {loading ? (
              <><span className="mw-request-form__spinner" aria-hidden="true" />Sending…</>
            ) : (
              <>Request Workout Plan</>
            )}
          </button>
        </div>
        {status.text && (
          <div
            className={`mw-request-status mw-request-status--${status.type}`}
            role={status.type === "error" ? "alert" : "status"}
          >
            <span aria-hidden="true">{status.type === "success" ? "✔" : "✕"}</span>
            {status.text}
          </div>
        )}
      </form>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * MyWorkout — Consumer's current active workout plan view.
 */
const MyWorkout = ({
  workoutPlan,
  isPremium      = false,
  onUpgradeClick,
  instructorId   = null,
  connectedInstructorName = "",
  consumer,
}) => {
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

  // ── Empty state (fetch done, no plan assigned yet) ────────────────────────
  if (!workoutPlan) {
    return (
      <div className="mw-empty-wrapper" id="my-workout-empty">
        <div className="mw-empty-state">
          <h2 className="mw-empty-state__title">No Active Workout Assigned</h2>
          <p className="mw-empty-state__text">
            No active workout plan has been assigned yet.
            {instructorId
              ? " Use the request form below to ask your instructor for a plan."
              : " Connect with a certified instructor in the Professional Hub to get started."}
          </p>
          {!instructorId && (
            <div className="mw-empty-state__hint">
              Use the <strong>Professional Hub</strong> tab to connect with a certified instructor.
            </div>
          )}
        </div>

        {/* Show request panel even when no plan exists, if instructor is connected */}
        {instructorId && (
          <InstructorRequestPanel
            instructorName={connectedInstructorName}
            consumer={consumer}
          />
        )}
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
                Assigned by {workoutPlan.instructorId.full_name}
              </span>
            )}

            {/* Creation date */}
            <span className="mw-meta-chip">
              {new Date(workoutPlan.createdAt).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>

            {/* Exercise count */}
            <span className="mw-meta-chip mw-meta-chip--count">
              {workoutPlan.exercises?.length ?? 0} exercise
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
        <>
          <div className="mw-exercises-grid">
            {workoutPlan.exercises.map((ex, i) => (
              <ExerciseCard key={ex._id || i} exercise={ex} index={i} />
            ))}
          </div>

          <AdherenceChecklist
            type="workout"
            planId={workoutPlan?._id}
            enabled={!!workoutPlan?._id}
            title="Workout Checklist (for your instructor)"
            subtitle="Tap the date to pick a day, then mark each exercise done or skipped."
          />
        </>
      ) : (
        <div className="mw-no-exercises">
          <p>This plan has no exercises defined yet.</p>
        </div>
      )}

      {/* ── Instructor request panel (always visible when instructor connected) ── */}
      {instructorId && (
        <InstructorRequestPanel
          instructorName={connectedInstructorName}
          consumer={consumer}
        />
      )}

    </div>
  );
};

export default MyWorkout;
