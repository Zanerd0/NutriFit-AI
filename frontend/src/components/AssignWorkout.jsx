/**
 * @file AssignWorkout.jsx
 * @description Instructor-facing "Assign Workout" panel.
 *
 * Workflow:
 *   1. Instructor selects one of their linked clients from a dropdown.
 *   2. The component fetches available WorkoutTemplates from the backend.
 *   3. The instructor clicks a template card to load its default exercises.
 *   4. Each exercise row's sets & reps are editable inline.
 *   5. Hitting "Assign Routine" POSTs to /api/instructor/assign-workout.
 *
 * Props:
 *   clients  {Array}  — The already-fetched linked clients list from
 *                       InstructorDashboard state (avoids a duplicate fetch).
 *
 * Styling: BEM class prefix `aw-` (AssignWorkout).
 */

import { useState, useEffect, useCallback } from "react";
import axios from "../api/axios";
import "./AssignWorkout.css";

// ─── Goal tag → accent colour map (used for template card badges) ──────────────
const GOAL_COLOURS = {
  "Weight Loss": "#22c55e",
  "Muscle Gain": "#f59e0b",
  "Cardio":      "#06b6d4",
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * TemplateCard — Clickable card for a single WorkoutTemplate.
 * Shows name, goal badge, and exercise count.
 */
const TemplateCard = ({ template, isSelected, onSelect }) => {
  const accentColor = GOAL_COLOURS[template.goal_tag] || "#6366f1";
  return (
    <div
      className={`aw-template-card ${isSelected ? "aw-template-card--selected" : ""}`}
      style={{ "--aw-accent": accentColor }}
      onClick={() => onSelect(template)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={(e) => e.key === "Enter" && onSelect(template)}
      id={`template-card-${template._id}`}
    >
      {/* Selection check mark */}
      {isSelected && <span className="aw-template-card__check">✔</span>}

      {/* Goal tag badge */}
      <span className="aw-template-card__badge" style={{ background: accentColor }}>
        {template.goal_tag}
      </span>

      {/* Template name */}
      <h3 className="aw-template-card__name">{template.name}</h3>

      {/* Exercise count */}
      <p className="aw-template-card__count">
        {template.exercises.length} exercise{template.exercises.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
};

/**
 * ExerciseRow — An editable row for one exercise inside the customise table.
 */
const ExerciseRow = ({ exercise, index, onChange }) => (
  <div className="aw-exercise-row" id={`exercise-row-${index}`}>
    {/* Exercise name (read-only label) */}
    <span className="aw-exercise-row__name">{exercise.exerciseName}</span>

    {/* Sets input */}
    <div className="aw-exercise-row__field">
      <label className="aw-exercise-row__label" htmlFor={`sets-${index}`}>Sets</label>
      <input
        id={`sets-${index}`}
        type="number"
        min="1"
        className="aw-exercise-row__input"
        value={exercise.sets}
        onChange={(e) => onChange(index, "sets", e.target.value)}
        aria-label={`Sets for ${exercise.exerciseName}`}
      />
    </div>

    {/* Reps input */}
    <div className="aw-exercise-row__field">
      <label className="aw-exercise-row__label" htmlFor={`reps-${index}`}>Reps</label>
      <input
        id={`reps-${index}`}
        type="number"
        min="1"
        className="aw-exercise-row__input"
        value={exercise.reps}
        onChange={(e) => onChange(index, "reps", e.target.value)}
        aria-label={`Reps for ${exercise.exerciseName}`}
      />
    </div>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AssignWorkout
 * @param {object[]} clients — Linked consumer list from InstructorDashboard.
 */
const AssignWorkout = ({ clients }) => {

  // ── Step tracking ────────────────────────────────────────────────────────────
  // 1 = select client, 2 = pick template, 3 = customise & submit
  const [step, setStep] = useState(1);

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedClient,   setSelectedClient]   = useState(null);
  const [templates,        setTemplates]        = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [exercises,        setExercises]        = useState([]);   // Editable copy

  // ── Loading / feedback ───────────────────────────────────────────────────────
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [submitting,       setSubmitting]       = useState(false);
  const [successMsg,       setSuccessMsg]       = useState("");
  const [errorMsg,         setErrorMsg]         = useState("");

  // ── Fetch templates when a client is selected ─────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    setErrorMsg("");
    try {
      const res = await axios.get("/instructor/templates");
      setTemplates(res.data);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || "Failed to load workout templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  // Fetch templates whenever we advance to step 2
  useEffect(() => {
    if (step === 2) fetchTemplates();
  }, [step, fetchTemplates]);

  // ── Event handlers ────────────────────────────────────────────────────────────

  /** handleClientSelect — Move to step 2 when a client is chosen. */
  const handleClientSelect = (e) => {
    const client = clients.find((c) => c._id === e.target.value);
    setSelectedClient(client || null);
    setSelectedTemplate(null);
    setExercises([]);
    setSuccessMsg("");
    setErrorMsg("");
    if (client) setStep(2);
  };

  /**
   * handleTemplateSelect — Load the template's base exercises into editable state
   * and advance to step 3 (customise).
   */
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    // Map baseSets/baseReps → sets/reps for the editable form
    setExercises(
      template.exercises.map((ex) => ({
        exerciseName: ex.exerciseName,
        sets:         ex.baseSets,
        reps:         ex.baseReps,
      }))
    );
    setStep(3);
  };

  /**
   * handleExerciseChange — Inline edit of a single field in an exercise row.
   * @param {number} index  Row index in the exercises array.
   * @param {string} field  "sets" | "reps"
   * @param {string} value  New raw input value (string, parsed server-side too)
   */
  const handleExerciseChange = (index, field, value) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  /**
   * handleSubmit — POST the assignment to the backend.
   */
  const handleSubmit = async () => {
    if (!selectedClient || !selectedTemplate || exercises.length === 0) return;

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await axios.post("/instructor/assign-workout", {
        clientId:   selectedClient._id,
        templateId: selectedTemplate._id,
        exercises,
      });

      setSuccessMsg(res.data.message || "Workout assigned successfully! 🎉");

      // Reset form back to step 1 after a short delay
      setTimeout(() => {
        setStep(1);
        setSelectedClient(null);
        setSelectedTemplate(null);
        setExercises([]);
        setSuccessMsg("");
      }, 2500);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || "Failed to assign workout. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step back helper ──────────────────────────────────────────────────────────
  const goBack = () => {
    if (step === 3) { setStep(2); setSelectedTemplate(null); setExercises([]); }
    else if (step === 2) { setStep(1); setSelectedClient(null); }
    setErrorMsg("");
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <section className="aw-panel" id="assign-workout-panel" aria-label="Assign Workout">

      {/* ── Panel header ── */}
      <div className="aw-panel__header">
        <div>
          <h2 className="aw-panel__title">Assign Workout</h2>
          <p className="aw-panel__sub">
            Select a client, choose a template, and customise the sets & reps
            before assigning their personalised routine.
          </p>
        </div>

        {/* Step indicator */}
        <div className="aw-steps" aria-label="Progress steps">
          {["Select Client", "Choose Template", "Customise & Assign"].map((label, i) => (
            <div
              key={i}
              className={`aw-step ${step === i + 1 ? "aw-step--active" : ""} ${step > i + 1 ? "aw-step--done" : ""}`}
              aria-current={step === i + 1 ? "step" : undefined}
            >
              <span className="aw-step__num">{step > i + 1 ? "✔" : i + 1}</span>
              <span className="aw-step__label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Global feedback banners ── */}
      {successMsg && (
        <div className="aw-success-banner" role="status">{successMsg}</div>
      )}
      {errorMsg && (
        <div className="aw-error-banner" role="alert">{errorMsg}</div>
      )}

      {/* ════════════════════════════════════════════════════════════
          STEP 1 — Select Client
      ════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="aw-step-body" id="step-1-body">
          <label className="aw-label" htmlFor="client-select">
            Which client are you assigning a workout to?
          </label>

          {clients.length === 0 ? (
            /* No linked clients yet */
            <div className="aw-empty">
              <p className="aw-empty__text">
                You have no linked clients yet. Clients appear here once they
                connect with you from their dashboard.
              </p>
            </div>
          ) : (
            <select
              id="client-select"
              className="aw-select"
              value={selectedClient?._id || ""}
              onChange={handleClientSelect}
            >
              <option value="" disabled>— Select a client —</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.full_name} — {c.primary_goal || c.goal || "No goal set"}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          STEP 2 — Choose Template
      ════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="aw-step-body" id="step-2-body">

          {/* Context pill */}
          <div className="aw-context-pill">
            Assigning to: <strong>{selectedClient?.full_name}</strong>
            {selectedClient?.primary_goal && (
              <span className="aw-context-pill__goal">
                &nbsp;· Goal: {selectedClient.primary_goal}
              </span>
            )}
          </div>

          <p className="aw-label">Select a workout template:</p>

          {loadingTemplates ? (
            <div className="aw-loading">
              <div className="aw-spinner" />
              <p>Loading templates…</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="aw-empty">
              <p className="aw-empty__text">No templates found.</p>
            </div>
          ) : (
            <div className="aw-templates-grid">
              {templates.map((t) => (
                <TemplateCard
                  key={t._id}
                  template={t}
                  isSelected={selectedTemplate?._id === t._id}
                  onSelect={handleTemplateSelect}
                />
              ))}
            </div>
          )}

          {/* Back button */}
          <button className="aw-btn aw-btn--ghost" onClick={goBack} id="back-to-step1-btn">
            ← Back
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          STEP 3 — Customise & Assign
      ════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="aw-step-body" id="step-3-body">

          {/* Context summary */}
          <div className="aw-context-pill">
            Assigning <strong>{selectedTemplate?.name}</strong> to{" "}
            <strong>{selectedClient?.full_name}</strong>
          </div>

          <p className="aw-label">
            Customise sets & reps for each exercise:
          </p>

          {/* Exercise table */}
          <div className="aw-exercises-list" role="list">
            {exercises.map((ex, i) => (
              <ExerciseRow
                key={i}
                index={i}
                exercise={ex}
                onChange={handleExerciseChange}
              />
            ))}
          </div>

          {/* Action row */}
          <div className="aw-actions">
            <button
              className="aw-btn aw-btn--ghost"
              onClick={goBack}
              id="back-to-step2-btn"
            >
              ← Back
            </button>
            <button
              className="aw-btn aw-btn--primary"
              onClick={handleSubmit}
              disabled={submitting}
              id="assign-routine-btn"
            >
              {submitting ? (
                <><span className="aw-spinner-sm" /> Assigning…</>
              ) : (
                "✔ Assign Routine"
              )}
            </button>
          </div>
        </div>
      )}

    </section>
  );
};

export default AssignWorkout;
