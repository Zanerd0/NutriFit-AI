/**
 * @file TemplateManager.jsx
 * @description Instructor-facing "Templates" tab.
 *
 * Features:
 *   - View all existing WorkoutTemplates in cards
 *   - Create a new template (name, goal_tag, exercises)
 *   - Edit any template inline (expand to form)
 *   - Delete a template with confirmation
 *   - "Assign to Client" on any card: pick client → assign via /api/instructor/assign-workout
 *
 * Props:
 *   clients        {Array}     — Already-fetched linked clients from InstructorDashboard
 *   onPlanCreated  {Function}  — Called after successful assignment so parent can refresh plans
 *
 * Styling: BEM prefix `tm-` (TemplateManager). Reuses inst-* variables from InstructorDashboard.css.
 */

import { useState, useEffect, useCallback } from "react";
import axios from "../api/axios";
import "./TemplateManager.css";

// ─── Goal tag options used in create / edit forms ─────────────────────────────
const GOAL_OPTIONS = ["Weight Loss", "Muscle Gain", "Cardio", "Endurance", "Flexibility", "General Fitness"];

const METRIC_OPTIONS = [
  { value: "sets_reps",  label: "Sets × Reps"    },
  { value: "sets_time",  label: "Sets × Duration" },
  { value: "distance",   label: "Distance"       },
  { value: "time",       label: "Time (mins)"    },
  { value: "laps",       label: "Laps"           },
  { value: "custom",     label: "Custom"         },
];

// Helper: produce a short readable stat string for the template card preview
const formatTemplateStat = (ex) => {
  switch (ex.metricType) {
    case "sets_time": return `${ex.baseSets ?? "?"}×${ex.baseDurationSecs ?? "?"}s`;
    case "distance":  return `${ex.baseDistanceValue ?? "?"}${ex.baseDistanceUnit || "km"}`;
    case "time":      return `${ex.baseTimeMinutes ?? "?"} min`;
    case "laps":      return `${ex.baseLaps ?? "?"} laps`;
    case "custom":    return ex.baseCustomMetric || "—";
    default:          return `${ex.baseSets ?? "?"}×${ex.baseReps ?? "?"}`;
  }
};


// ─── Accent colours per goal tag ─────────────────────────────────────────────
const GOAL_COLOUR = {
  "Weight Loss":     "#22c55e",
  "Muscle Gain":     "#f59e0b",
  "Cardio":          "#06b6d4",
  "Endurance":       "#8b5cf6",
  "Flexibility":     "#ec4899",
  "General Fitness": "#6366f1",
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * ExerciseEditorRow — One editable row inside a template form.
 * Supports flexible metric types: sets×reps, sets×time, distance, time, laps, custom.
 */
const ExerciseEditorRow = ({ ex, index, onChange, onRemove }) => (
  <div className="tm-ex-row" id={`tm-ex-row-${index}`}>
    {/* Exercise name */}
    <input
      type="text" placeholder="Exercise name" className="tm-ex-row__name"
      value={ex.exerciseName}
      onChange={(e) => onChange(index, "exerciseName", e.target.value)}
      aria-label={`Exercise ${index + 1} name`}
    />
    {/* Metric type selector */}
    <select className="tm-ex-row__metric-select" value={ex.metricType || "sets_reps"}
      onChange={(e) => onChange(index, "metricType", e.target.value)}
      aria-label={`Exercise ${index + 1} metric type`}>
      {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {/* Metric value fields — vary by type */}
    {(!ex.metricType || ex.metricType === "sets_reps") && (
      <>
        <div className="tm-ex-row__num-group">
          <label className="tm-ex-row__mini-label" htmlFor={`tm-sets-${index}`}>Sets</label>
          <input id={`tm-sets-${index}`} type="number" min="1" className="tm-ex-row__num"
            value={ex.baseSets ?? ""} onChange={(e) => onChange(index, "baseSets", e.target.value)} />
        </div>
        <div className="tm-ex-row__num-group">
          <label className="tm-ex-row__mini-label" htmlFor={`tm-reps-${index}`}>Reps</label>
          <input id={`tm-reps-${index}`} type="number" min="1" className="tm-ex-row__num"
            value={ex.baseReps ?? ""} onChange={(e) => onChange(index, "baseReps", e.target.value)} />
        </div>
      </>
    )}
    {ex.metricType === "sets_time" && (
      <>
        <div className="tm-ex-row__num-group">
          <label className="tm-ex-row__mini-label" htmlFor={`tm-sets-${index}`}>Sets</label>
          <input id={`tm-sets-${index}`} type="number" min="1" className="tm-ex-row__num"
            value={ex.baseSets ?? ""} onChange={(e) => onChange(index, "baseSets", e.target.value)} />
        </div>
        <div className="tm-ex-row__num-group">
          <label className="tm-ex-row__mini-label" htmlFor={`tm-dur-${index}`}>Secs</label>
          <input id={`tm-dur-${index}`} type="number" min="1" className="tm-ex-row__num"
            value={ex.baseDurationSecs ?? ""} onChange={(e) => onChange(index, "baseDurationSecs", e.target.value)} />
        </div>
      </>
    )}
    {ex.metricType === "distance" && (
      <>
        <div className="tm-ex-row__num-group">
          <label className="tm-ex-row__mini-label" htmlFor={`tm-dist-${index}`}>Dist</label>
          <input id={`tm-dist-${index}`} type="number" min="0" step="0.1" className="tm-ex-row__num"
            value={ex.baseDistanceValue ?? ""} onChange={(e) => onChange(index, "baseDistanceValue", e.target.value)} />
        </div>
        <div className="tm-ex-row__num-group">
          <label className="tm-ex-row__mini-label" htmlFor={`tm-unit-${index}`}>Unit</label>
          <select id={`tm-unit-${index}`} className="tm-ex-row__num" style={{ fontSize: "0.78rem" }}
            value={ex.baseDistanceUnit || "km"} onChange={(e) => onChange(index, "baseDistanceUnit", e.target.value)}>
            <option value="km">km</option>
            <option value="miles">mi</option>
            <option value="meters">m</option>
          </select>
        </div>
      </>
    )}
    {ex.metricType === "time" && (
      <div className="tm-ex-row__num-group">
        <label className="tm-ex-row__mini-label" htmlFor={`tm-time-${index}`}>Mins</label>
        <input id={`tm-time-${index}`} type="number" min="1" className="tm-ex-row__num"
          value={ex.baseTimeMinutes ?? ""} onChange={(e) => onChange(index, "baseTimeMinutes", e.target.value)} />
      </div>
    )}
    {ex.metricType === "laps" && (
      <div className="tm-ex-row__num-group">
        <label className="tm-ex-row__mini-label" htmlFor={`tm-laps-${index}`}>Laps</label>
        <input id={`tm-laps-${index}`} type="number" min="1" className="tm-ex-row__num"
          value={ex.baseLaps ?? ""} onChange={(e) => onChange(index, "baseLaps", e.target.value)} />
      </div>
    )}
    {ex.metricType === "custom" && (
      <div className="tm-ex-row__num-group" style={{ flex: 1 }}>
        <label className="tm-ex-row__mini-label" htmlFor={`tm-custom-${index}`}>Value</label>
        <input id={`tm-custom-${index}`} type="text" className="tm-ex-row__num"
          placeholder="e.g. 400m sprint"
          value={ex.baseCustomMetric ?? ""} onChange={(e) => onChange(index, "baseCustomMetric", e.target.value)} />
      </div>
    )}
    <button className="tm-ex-row__remove" onClick={() => onRemove(index)} aria-label={`Remove exercise ${index + 1}`}>✕</button>
  </div>
);


/**
 * TemplateForm — Shared create / edit form.
 * @param {object}   initial    — Initial field values (empty object for create)
 * @param {Function} onSave     — Called with { name, goal_tag, exercises } on submit
 * @param {Function} onCancel   — Called to dismiss the form
 * @param {boolean}  isEditing  — Changes button label & title
 */
const TemplateForm = ({ initial = {}, onSave, onCancel, isEditing }) => {
  const [name,      setName]      = useState(initial.name      ?? "");
  const [goalTag,   setGoalTag]   = useState(initial.goal_tag  ?? "");
  const [exercises, setExercises] = useState(
    initial.exercises?.map((ex) => ({
      exerciseName:      ex.exerciseName,
      metricType:        ex.metricType || "sets_reps",
      baseSets:          ex.baseSets          ?? null,
      baseReps:          ex.baseReps          ?? null,
      baseDurationSecs:  ex.baseDurationSecs  ?? null,
      baseDistanceValue: ex.baseDistanceValue ?? null,
      baseDistanceUnit:  ex.baseDistanceUnit  || "km",
      baseTimeMinutes:   ex.baseTimeMinutes   ?? null,
      baseLaps:          ex.baseLaps          ?? null,
      baseCustomMetric:  ex.baseCustomMetric  || "",
    })) ?? []
  );
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const addRow = () =>
    setExercises((prev) => [...prev, {
      exerciseName: "", metricType: "sets_reps",
      baseSets: 3, baseReps: 10,
      baseDurationSecs: 30, baseDistanceValue: 1, baseDistanceUnit: "km",
      baseTimeMinutes: 20, baseLaps: 4, baseCustomMetric: "",
    }]);


  const updateRow = (i, field, val) =>
    setExercises((prev) => prev.map((ex, idx) => idx === i ? { ...ex, [field]: val } : ex));

  const removeRow = (i) =>
    setExercises((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim())   { setError("Template name is required."); return; }
    if (!goalTag.trim()) { setError("Goal tag is required."); return; }
    if (exercises.length === 0) { setError("Add at least one exercise."); return; }

    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), goal_tag: goalTag.trim(), exercises });
    } catch (err) {
      setError(err.message || "Save failed.");
      setSaving(false);
    }
  };

  return (
    <div className="tm-form" id={isEditing ? "tm-edit-form" : "tm-create-form"}>
      <h3 className="tm-form__title">{isEditing ? "Edit Template" : "Create New Template"}</h3>

      {error && <div className="tm-error">{error}</div>}

      {/* Name */}
      <div className="tm-form__group">
        <label className="tm-form__label" htmlFor="tm-name">Template Name</label>
        <input id="tm-name" type="text" className="tm-form__input"
          placeholder="e.g. Full-Body Strength" value={name}
          onChange={(e) => setName(e.target.value)} maxLength={100} />
      </div>

      {/* Goal tag */}
      <div className="tm-form__group">
        <label className="tm-form__label" htmlFor="tm-goal">Goal Tag</label>
        <select id="tm-goal" className="tm-form__select"
          value={goalTag} onChange={(e) => setGoalTag(e.target.value)}>
          <option value="" disabled>— Select goal —</option>
          {GOAL_OPTIONS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </div>

      {/* Exercises */}
      <div className="tm-form__group">
        <label className="tm-form__label">Exercises</label>
        {exercises.length === 0 ? (
          <p className="tm-form__hint">No exercises yet. Add one below.</p>
        ) : (
          <div className="tm-ex-list">
            {exercises.map((ex, i) => (
              <ExerciseEditorRow key={i} ex={ex} index={i} onChange={updateRow} onRemove={removeRow} />
            ))}
          </div>
        )}
        <button className="tm-add-row-btn" onClick={addRow} id="tm-add-ex-btn" type="button">
          ＋ Add Exercise
        </button>
      </div>

      {/* Actions */}
      <div className="tm-form__actions">
        <button className="tm-btn tm-btn--ghost" onClick={onCancel} type="button">Cancel</button>
        <button className="tm-btn tm-btn--primary" onClick={handleSave} disabled={saving} type="button"
          id={isEditing ? "tm-save-edit-btn" : "tm-save-create-btn"}>
          {saving ? "Saving…" : isEditing ? "✔ Save Changes" : "✔ Create Template"}
        </button>
      </div>
    </div>
  );
};

/**
 * AssignModal — Lightweight modal to pick a client and assign a specific template.
 */
const AssignModal = ({ template, clients, onClose, onAssigned }) => {
  const [clientId,   setClientId]   = useState("");
  const [exercises,  setExercises]  = useState(
    template.exercises.map((ex) => ({
      exerciseName:  ex.exerciseName,
      metricType:    ex.metricType || "sets_reps",
      sets:          ex.baseSets,
      reps:          ex.baseReps,
      durationSecs:  ex.baseDurationSecs,
      distanceValue: ex.baseDistanceValue,
      distanceUnit:  ex.baseDistanceUnit || "km",
      timeMinutes:   ex.baseTimeMinutes,
      laps:          ex.baseLaps,
      customMetric:  ex.baseCustomMetric || "",
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [phase,      setPhase]      = useState("client"); // "client" | "customize"

  const changeEx = (i, field, val) =>
    setExercises((prev) => prev.map((ex, idx) => idx === i ? { ...ex, [field]: val } : ex));

  const handleAssign = async () => {
    if (!clientId) { setError("Please select a client."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await axios.post("/instructor/assign-workout", {
        clientId, templateId: template._id, exercises,
      });
      setSuccess(res.data.message || "Assigned! 🎉");
      onAssigned();
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to assign.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tm-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tm-modal">
        <div className="tm-modal__header">
          <h3 className="tm-modal__title">Assign: {template.name}</h3>
          <button className="tm-modal__close" onClick={onClose}>✕</button>
        </div>

        {error   && <div className="tm-error"   style={{ marginBottom: "0.75rem" }}>{error}</div>}
        {success  && <div className="tm-success" style={{ marginBottom: "0.75rem" }}>{success}</div>}

        {/* Phase 1 – pick client */}
        {phase === "client" && (
          <div>
            <label className="tm-form__label" htmlFor="assign-client-select" style={{ display: "block", marginBottom: "0.5rem" }}>
              Select client to assign this template to:
            </label>
            {clients.length === 0 ? (
              <p className="tm-form__hint">No linked clients yet.</p>
            ) : (
              <select id="assign-client-select" className="tm-form__select"
                value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="" disabled>— Select a client —</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.full_name} — {c.primary_goal || "No goal set"}
                  </option>
                ))}
              </select>
            )}
            <div className="tm-form__actions" style={{ marginTop: "1rem" }}>
              <button className="tm-btn tm-btn--ghost" onClick={onClose}>Cancel</button>
              <button className="tm-btn tm-btn--primary" disabled={!clientId}
                onClick={() => setPhase("customize")} id="assign-next-btn">
                Next → Customise
              </button>
            </div>
          </div>
        )}

        {/* Phase 2 – customise sets/reps */}
        {phase === "customize" && (
          <div>
            <p className="tm-form__label" style={{ marginBottom: "0.75rem" }}>
              Customise sets & reps for{" "}
              <strong>{clients.find((c) => c._id === clientId)?.full_name}</strong>:
            </p>
            <div className="tm-ex-list" style={{ marginBottom: "1rem" }}>
              {exercises.map((ex, i) => (
                <div key={i} className="tm-ex-row" id={`assign-ex-${i}`}
                  style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span className="tm-ex-row__name-ro" style={{ flex: "1 0 140px" }}>{ex.exerciseName}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--tm-muted)", background: "rgba(99,102,241,0.1)", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                    {ex.metricType?.replace("_", "×") || "sets×reps"}
                  </span>
                  {/* Show editable fields based on metricType */}
                  {(!ex.metricType || ex.metricType === "sets_reps") && (
                    <>
                      <div className="tm-ex-row__num-group">
                        <label className="tm-ex-row__mini-label" htmlFor={`aex-sets-${i}`}>Sets</label>
                        <input id={`aex-sets-${i}`} type="number" min="1" className="tm-ex-row__num"
                          value={ex.sets ?? ""} onChange={(e) => changeEx(i, "sets", e.target.value)} />
                      </div>
                      <div className="tm-ex-row__num-group">
                        <label className="tm-ex-row__mini-label" htmlFor={`aex-reps-${i}`}>Reps</label>
                        <input id={`aex-reps-${i}`} type="number" min="1" className="tm-ex-row__num"
                          value={ex.reps ?? ""} onChange={(e) => changeEx(i, "reps", e.target.value)} />
                      </div>
                    </>
                  )}
                  {ex.metricType === "sets_time" && (
                    <>
                      <div className="tm-ex-row__num-group">
                        <label className="tm-ex-row__mini-label">Sets</label>
                        <input type="number" min="1" className="tm-ex-row__num"
                          value={ex.sets ?? ""} onChange={(e) => changeEx(i, "sets", e.target.value)} />
                      </div>
                      <div className="tm-ex-row__num-group">
                        <label className="tm-ex-row__mini-label">Secs</label>
                        <input type="number" min="1" className="tm-ex-row__num"
                          value={ex.durationSecs ?? ""} onChange={(e) => changeEx(i, "durationSecs", e.target.value)} />
                      </div>
                    </>
                  )}
                  {ex.metricType === "distance" && (
                    <div className="tm-ex-row__num-group">
                      <label className="tm-ex-row__mini-label">Distance ({ex.distanceUnit || "km"})</label>
                      <input type="number" min="0" step="0.1" className="tm-ex-row__num"
                        value={ex.distanceValue ?? ""} onChange={(e) => changeEx(i, "distanceValue", e.target.value)} />
                    </div>
                  )}
                  {ex.metricType === "time" && (
                    <div className="tm-ex-row__num-group">
                      <label className="tm-ex-row__mini-label">Mins</label>
                      <input type="number" min="1" className="tm-ex-row__num"
                        value={ex.timeMinutes ?? ""} onChange={(e) => changeEx(i, "timeMinutes", e.target.value)} />
                    </div>
                  )}
                  {ex.metricType === "laps" && (
                    <div className="tm-ex-row__num-group">
                      <label className="tm-ex-row__mini-label">Laps</label>
                      <input type="number" min="1" className="tm-ex-row__num"
                        value={ex.laps ?? ""} onChange={(e) => changeEx(i, "laps", e.target.value)} />
                    </div>
                  )}
                  {ex.metricType === "custom" && (
                    <div className="tm-ex-row__num-group" style={{ flex: 1 }}>
                      <label className="tm-ex-row__mini-label">Value</label>
                      <input type="text" className="tm-ex-row__num"
                        value={ex.customMetric ?? ""} onChange={(e) => changeEx(i, "customMetric", e.target.value)} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="tm-form__actions">
              <button className="tm-btn tm-btn--ghost" onClick={() => setPhase("client")}>← Back</button>
              <button className="tm-btn tm-btn--primary" onClick={handleAssign}
                disabled={submitting} id="assign-submit-btn">
                {submitting ? "Assigning…" : "✔ Assign Routine"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const TemplateManager = ({ clients, onPlanCreated }) => {
  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  // UI mode flags
  const [showCreate,   setShowCreate]   = useState(false);
  const [editingId,    setEditingId]    = useState(null);   // Template _id being edited
  const [assigningTpl, setAssigningTpl] = useState(null);  // Template object for assign modal

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await axios.get("/instructor/templates");
      setTemplates(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = async (data) => {
    const res = await axios.post("/instructor/templates", data);
    setTemplates((prev) => [...prev, res.data]);
    setShowCreate(false);
  };

  const handleUpdate = async (id, data) => {
    const res = await axios.put(`/instructor/templates/${id}`, data);
    setTemplates((prev) => prev.map((t) => (t._id === id ? res.data : t)));
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this template? This cannot be undone.")) return;
    try {
      await axios.delete(`/instructor/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t._id !== id));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete template.");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="tm-panel" id="template-manager-panel" aria-label="Template Manager">

      {/* Header */}
      <div className="tm-panel__header">
        <div>
          <h2 className="tm-panel__title">Workout Templates</h2>
          <p className="tm-panel__sub">
            Build and maintain your reusable exercise blueprints. Assign any template
            directly to a client, customising sets & reps before confirming.
          </p>
        </div>
        {!showCreate && (
          <button className="tm-btn tm-btn--primary" onClick={() => { setShowCreate(true); setEditingId(null); }}
            id="create-template-btn">
            ＋ New Template
          </button>
        )}
      </div>

      {/* Global error */}
      {error && <div className="tm-error" role="alert">{error}</div>}

      {/* Create form */}
      {showCreate && (
        <TemplateForm
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          isEditing={false}
        />
      )}

      {/* Templates list */}
      {loading ? (
        <div className="tm-loading"><div className="tm-spinner" /><p>Loading templates…</p></div>
      ) : templates.length === 0 && !showCreate ? (
        <div className="tm-empty">
          <div className="tm-empty__icon">📐</div>
          <p className="tm-empty__text">No templates yet. Create your first one above!</p>
        </div>
      ) : (
        <div className="tm-grid">
          {templates.map((t) => {
            const accent = GOAL_COLOUR[t.goal_tag] || "#6366f1";
            return (
              <div
                key={t._id}
                id={`tm-card-${t._id}`}
                className={`tm-card${editingId === t._id ? " tm-card--editing" : ""}`}
                style={{ "--tm-accent": accent }}
              >

                {/* Edit form (expanded inline) */}
                {editingId === t._id ? (
                  <TemplateForm
                    initial={t}
                    onSave={(data) => handleUpdate(t._id, data)}
                    onCancel={() => setEditingId(null)}
                    isEditing
                  />
                ) : (
                  <>
                    {/* Card header */}
                    <div className="tm-card__top">
                      <span className="tm-card__badge" style={{ background: accent }}>{t.goal_tag}</span>
                      <div className="tm-card__actions">
                        <button className="tm-card__icon-btn" title="Edit template"
                          onClick={() => { setEditingId(t._id); setShowCreate(false); }}
                          id={`edit-tpl-${t._id}`}>✏️</button>
                        <button className="tm-card__icon-btn tm-card__icon-btn--danger"
                          title="Delete template" onClick={() => handleDelete(t._id)}
                          id={`del-tpl-${t._id}`}>🗑</button>
                      </div>
                    </div>

                    <h3 className="tm-card__name">{t.name}</h3>
                    <p className="tm-card__count">{t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}</p>

                    {/* Exercise preview list */}
                    <ul className="tm-card__ex-list">
                      {t.exercises.slice(0, 4).map((ex, i) => (
                        <li key={i} className="tm-card__ex-item">
                          <span className="tm-card__ex-dot">💪</span>
                          <span className="tm-card__ex-name">{ex.exerciseName}</span>
                          <span className="tm-card__ex-stat">{formatTemplateStat(ex)}</span>
                        </li>
                      ))}
                      {t.exercises.length > 4 && (
                        <li className="tm-card__ex-item tm-card__ex-item--more">
                          +{t.exercises.length - 4} more…
                        </li>
                      )}
                    </ul>


                    {/* Assign CTA */}
                    <button className="tm-card__assign-btn" id={`assign-tpl-${t._id}`}
                      onClick={() => setAssigningTpl(t)}
                      disabled={clients.length === 0}
                      title={clients.length === 0 ? "No linked clients" : "Assign to a client"}>
                      🏋️ Assign to Client
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign modal */}
      {assigningTpl && (
        <AssignModal
          template={assigningTpl}
          clients={clients}
          onClose={() => setAssigningTpl(null)}
          onAssigned={() => { onPlanCreated?.(); }}
        />
      )}
    </section>
  );
};

export default TemplateManager;
