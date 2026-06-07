/**
 * @file InstructorDashboard.jsx
 * @description The main Instructor Dashboard page for NutriFit AI.
 *
 * This component renders a full instructor control panel with:
 *   - A fixed sidebar for navigation between sections
 *   - An "Overview" section with quick-stat cards
 *   - A "Clients" section displaying all Consumer-role users
 *   - A "Workout Plans" section: create new plans + view existing ones
 *
 * Authentication & Authorization:
 *   Protected by <InstructorRoute> in App.jsx, which verifies the user's
 *   role is "Instructor" before this component can render.
 *
 * Data Fetching:
 *   Uses the shared Axios instance (withCredentials: true) so the
 *   HTTP-only JWT cookie is automatically attached to every API request.
 *
 * State Management:
 *   - clients:        Array of Consumer users from GET /api/instructor/clients
 *   - plans:          Array of workout plans from GET /api/instructor/plans
 *   - activeTab:      Controls which sidebar section is rendered
 *   - showModal:      Boolean to open/close the Create Plan modal
 *   - selectedClient: The Consumer selected for a new plan
 *   - formData:       Controlled form state { title, description }
 *   - exercises:      Dynamic array of exercise entries built in the form
 *   - submitting:     Boolean showing spinner during form submission
 *   - formError:      Inline error message from a failed submission
 *   - formSuccess:    Success message after a plan is created
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import { validateWorkoutExercises } from "../utils/workoutExerciseValidation";
import "./InstructorDashboard.css";
import ClientList       from "../components/ClientList";
import TemplateManager     from "../components/TemplateManager";
import GlobalLayout        from "../components/GlobalLayout";
import WorkoutSuggestions  from "../components/WorkoutSuggestions";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * formatExerciseStat — Turns the flexible exercise metric into a human label.
 * e.g. { metricType: "sets_reps", sets:3, reps:10 } → "3×10"
 */
const formatExerciseStat = (ex) => {
  switch (ex.metricType) {
    case "sets_time": return `${ex.sets}×${ex.durationSecs}s`;
    case "distance":  return `${ex.distanceValue} ${ex.distanceUnit}`;
    case "time":      return `${ex.timeMinutes} min`;
    case "laps":      return `${ex.laps} laps`;
    case "custom":    return ex.customMetric || "—";
    default:          return `${ex.sets ?? "?"}×${ex.reps ?? "?"}`;
  }
};

/** getClientId — Normalises populated or raw clientId on a plan. */
const getClientId = (planOrClient) => {
  if (!planOrClient) return null;
  const id = planOrClient.clientId ?? planOrClient._id;
  return typeof id === "object" ? id._id : id;
};

/** planExercisesToForm — Maps a saved plan's exercises into builder form state. */
const planExercisesToForm = (plan) =>
  (plan?.exercises || []).map((ex) => ({
    exerciseName:  ex.exerciseName,
    metricType:    ex.metricType || "sets_reps",
    sets:          ex.sets,
    reps:          ex.reps,
    durationSecs:  ex.durationSecs,
    distanceValue: ex.distanceValue,
    distanceUnit:  ex.distanceUnit || "km",
    timeMinutes:   ex.timeMinutes,
    laps:          ex.laps,
    customMetric:  ex.customMetric || "",
    notes:         ex.notes || "",
  }));

const BLANK_EXERCISE = {
  exerciseName: "", metricType: "sets_reps", sets: 3, reps: 10,
  durationSecs: 30, distanceValue: 1, distanceUnit: "km",
  timeMinutes: 20, laps: 4, customMetric: "", notes: "",
};


// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * StatCard — A single metric tile in the overview strip.
 */
const StatCard = ({ label, value, accent }) => (
  <div className="inst-stat-card" style={{ "--accent": accent }}>
    <div>
      <span className="inst-stat-card__value">{value ?? "—"}</span>
      <span className="inst-stat-card__label">{label}</span>
    </div>
  </div>
);

/**
 * ClientCard — A clickable card representing a single Consumer.
 * Clicking opens the Create Plan modal with this client pre-selected.
 */
const ClientCard = ({ client, isSelected, onSelect }) => (
  <div
    className={`inst-client-card ${isSelected ? "inst-client-card--selected" : ""}`}
    onClick={() => onSelect(client)}
    role="button"
    tabIndex={0}
    aria-pressed={isSelected}
    onKeyDown={(e) => e.key === "Enter" && onSelect(client)}
    id={`client-card-${client._id}`}
  >
    {isSelected && <span className="inst-client-card__check">✔</span>}
    <div className="inst-avatar">
      {client.full_name?.charAt(0).toUpperCase()}
    </div>
    <div>
      <div className="inst-client-card__name">{client.full_name}</div>
      <div className="inst-client-card__email">{client.email}</div>
    </div>
  </div>
);

/**
 * PlanCard — Displays a single workout plan in the Active Plans grid.
 */
const PlanCard = ({ plan, onDelete }) => (
  <div className="inst-plan-card" id={`plan-card-${plan._id}`}>
    <h3 className="inst-plan-card__title">{plan.title}</h3>

    {plan.description && (
      <p className="inst-plan-card__desc">{plan.description}</p>
    )}

    {/* Assigned client chip */}
    <div className="inst-plan-card__client">
      <div className="inst-avatar inst-avatar--sm">
        {plan.clientId?.full_name?.charAt(0).toUpperCase() ?? "?"}
      </div>
      <div>
        <span className="inst-plan-card__client-label">Client</span>
        <span className="inst-plan-card__client-name">
          {plan.clientId?.full_name ?? "Unknown"}
        </span>
      </div>
    </div>

    {/* Exercise name tags (first 3 to prevent overflow) */}
    {plan.exercises?.length > 0 && (
      <div className="inst-plan-card__exercises">
        {plan.exercises.slice(0, 3).map((ex, i) => (
          <span key={i} className="inst-plan-card__exercise-tag">
            {ex.exerciseName} — {formatExerciseStat(ex)}
          </span>
        ))}
        {plan.exercises.length > 3 && (
          <span className="inst-plan-card__exercise-tag" style={{ opacity: 0.6 }}>
            +{plan.exercises.length - 3} more
          </span>
        )}
      </div>
    )}

    <div className="inst-plan-card__footer">
      <span className="inst-plan-card__date">
        {new Date(plan.createdAt).toLocaleDateString("en-US", {
          year: "numeric", month: "short", day: "numeric",
        })}
      </span>
      <span className="inst-plan-card__count">
        {plan.exercises?.length ?? 0} exercise{plan.exercises?.length !== 1 ? "s" : ""}
      </span>
    </div>

    {/* Delete button */}
    <button
      className="inst-plan-card__delete-btn"
      id={`delete-plan-${plan._id}`}
      onClick={() => onDelete(plan._id)}
      aria-label={`Delete plan: ${plan.title}`}
      title="Delete this plan"
    >
      🗑 Delete
    </button>
  </div>
);


/**
 * ModalExerciseMetricFields — Renders the right input fields based on metricType.
 * Used in both the template-customize phase and the custom plan builder.
 */
const ModalExerciseMetricFields = ({ ex, index, onChange }) => {
  const id = (field) => `mex-${index}-${field}`;
  switch (ex.metricType) {
    case "sets_reps":
    default:
      return (
        <>
          <div className="inst-exercise-row__field">
            <label className="inst-exercise-row__mini-label" htmlFor={id("sets")}>Sets</label>
            <input id={id("sets")} type="number" min="0" className="inst-form__input inst-form__input--sm"
              value={ex.sets ?? ""} onChange={(e) => onChange(index, "sets", e.target.value)} />
          </div>
          <div className="inst-exercise-row__field">
            <label className="inst-exercise-row__mini-label" htmlFor={id("reps")}>Reps</label>
            <input id={id("reps")} type="number" min="0" className="inst-form__input inst-form__input--sm"
              value={ex.reps ?? ""} onChange={(e) => onChange(index, "reps", e.target.value)} />
          </div>
        </>
      );
    case "sets_time":
      return (
        <>
          <div className="inst-exercise-row__field">
            <label className="inst-exercise-row__mini-label" htmlFor={id("sets")}>Sets</label>
            <input id={id("sets")} type="number" min="0" className="inst-form__input inst-form__input--sm"
              value={ex.sets ?? ""} onChange={(e) => onChange(index, "sets", e.target.value)} />
          </div>
          <div className="inst-exercise-row__field">
            <label className="inst-exercise-row__mini-label" htmlFor={id("dur")}>Secs/set</label>
            <input id={id("dur")} type="number" min="0" className="inst-form__input inst-form__input--sm"
              value={ex.durationSecs ?? ""} onChange={(e) => onChange(index, "durationSecs", e.target.value)} />
          </div>
        </>
      );
    case "distance":
      return (
        <>
          <div className="inst-exercise-row__field">
            <label className="inst-exercise-row__mini-label" htmlFor={id("dist")}>Distance</label>
            <input id={id("dist")} type="number" min="0" step="0.1" className="inst-form__input inst-form__input--sm"
              value={ex.distanceValue ?? ""} onChange={(e) => onChange(index, "distanceValue", e.target.value)} />
          </div>
          <div className="inst-exercise-row__field">
            <label className="inst-exercise-row__mini-label" htmlFor={id("unit")}>Unit</label>
            <select id={id("unit")} className="inst-form__select" style={{ padding: "0.2rem 0.4rem", fontSize: "0.82rem" }}
              value={ex.distanceUnit || "km"} onChange={(e) => onChange(index, "distanceUnit", e.target.value)}>
              <option value="km">km</option>
              <option value="miles">miles</option>
              <option value="meters">meters</option>
            </select>
          </div>
        </>
      );
    case "time":
      return (
        <div className="inst-exercise-row__field">
          <label className="inst-exercise-row__mini-label" htmlFor={id("mins")}>Minutes</label>
          <input id={id("mins")} type="number" min="0" className="inst-form__input inst-form__input--sm"
            value={ex.timeMinutes ?? ""} onChange={(e) => onChange(index, "timeMinutes", e.target.value)} />
        </div>
      );
    case "laps":
      return (
        <div className="inst-exercise-row__field">
          <label className="inst-exercise-row__mini-label" htmlFor={id("laps")}>Laps</label>
          <input id={id("laps")} type="number" min="0" className="inst-form__input inst-form__input--sm"
            value={ex.laps ?? ""} onChange={(e) => onChange(index, "laps", e.target.value)} />
        </div>
      );
    case "custom":
      return (
        <div className="inst-exercise-row__field" style={{ gridColumn: "span 2" }}>
          <label className="inst-exercise-row__mini-label" htmlFor={id("custom")}>Metric</label>
          <input id={id("custom")} type="text" className="inst-form__input inst-form__input--sm"
            placeholder="e.g. 3 rounds of 400m sprint"
            value={ex.customMetric ?? ""} onChange={(e) => onChange(index, "customMetric", e.target.value)} />
        </div>
      );
  }
};

/**
 * ExerciseNotesField — Optional per-exercise notes (cues, warnings, links).
 */
const ExerciseNotesField = ({ ex, index, onChange }) => (
  <div className="inst-exercise-row__notes">
    <label className="inst-exercise-row__mini-label" htmlFor={`mex-${index}-notes`}>
      Notes (optional)
    </label>
    <textarea
      id={`mex-${index}-notes`}
      className="inst-form__textarea inst-form__textarea--sm"
      placeholder="Form cues, injury warnings, video links…"
      rows={2}
      maxLength={500}
      value={ex.notes ?? ""}
      onChange={(e) => onChange(index, "notes", e.target.value)}
    />
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const InstructorDashboard = () => {
  const navigate    = useNavigate();
  const instructor  = JSON.parse(localStorage.getItem("user"));

  // ── Navigation ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("overview");

  /** showCodePopup — toggles the sidebar avatar connection code popup */
  const [showCodePopup, setShowCodePopup] = useState(false);
  const [codeCopied,   setCodeCopied]    = useState(false);
  const [popupPos,     setPopupPos]      = useState({ bottom: 0, left: 0 });
  const avatarBtnRef = useRef(null);

  const handleAvatarClick = () => {
    if (!showCodePopup && avatarBtnRef.current) {
      const rect = avatarBtnRef.current.getBoundingClientRect();
      setPopupPos({
        bottom: window.innerHeight - rect.top + 8,
        left:   rect.left,
      });
    }
    setShowCodePopup((v) => !v);
  };

  const handleCopyCode = () => {
    if (!instructor?._id) return;
    navigator.clipboard.writeText(instructor._id).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // ── Remote data ───────────────────────────────────────────────────────────
  const [clients,          setClients]          = useState([]);
  const [plans,            setPlans]            = useState([]);
  const [pendingRequests,  setPendingRequests]  = useState([]); // clients who requested a plan
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState("");

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showModal,           setShowModal]           = useState(false);
  const [selectedClient,      setSelectedClient]      = useState(null);
  // Template-based assignment flow
  const [modalPhase,          setModalPhase]          = useState("template"); // "client" | "template" | "customize" | "custom"
  const [modalTemplates,      setModalTemplates]      = useState([]);
  const [modalSelectedTpl,    setModalSelectedTpl]    = useState(null);
  const [modalExercises,      setModalExercises]      = useState([]);
  const [modalLoadingTpl,     setModalLoadingTpl]     = useState(false);
  const [submitting,          setSubmitting]          = useState(false);
  const [formError,           setFormError]           = useState("");
  const [formSuccess,         setFormSuccess]         = useState("");
  // Custom plan form state
  const [customTitle,         setCustomTitle]         = useState("");
  const [customDescription,   setCustomDescription]   = useState("");
  const [editingPlanId,       setEditingPlanId]       = useState(null);
  const [activeManagePlan,    setActiveManagePlan]    = useState(null);
  const [dataRefreshKey,      setDataRefreshKey]      = useState(0);

  /** getActivePlanForClient — Most recent plan assigned to a client by this instructor. */
  const getActivePlanForClient = useCallback((clientId) => {
    if (!clientId) return null;
    const matches = plans.filter((p) => getClientId(p) === clientId);
    if (matches.length === 0) return null;
    return matches.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }, [plans]);

  /** syncAfterPlanChange — Clears pending-request badges and refreshes client list. */
  const syncAfterPlanChange = useCallback((clientId, planUpdate = null) => {
    if (clientId) {
      setPendingRequests((prev) => prev.filter((r) => r._id !== clientId));
      setDataRefreshKey((k) => k + 1);
    }
    if (planUpdate) {
      setPlans((prev) => {
        const others = prev.filter((p) => p._id !== planUpdate._id);
        return [planUpdate, ...others];
      });
      setActiveManagePlan(planUpdate);
    }
  }, []);


  // ── Data Fetching ─────────────────────────────────────────────────────────

  /**
   * fetchAll — Fetches clients and plans concurrently using Promise.all.
   * Wrapped in useCallback so it can be called again after creating a plan.
   */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clientsRes, plansRes, pendingRes] = await Promise.allSettled([
        axios.get("/instructor/clients"),
        axios.get("/instructor/plans"),
        axios.get("/instructor/pending-requests"),
      ]);

      const firstError = [clientsRes, plansRes, pendingRes].find(
        (r) => r.status === "rejected"
      );
      if (firstError?.reason?.response?.status === 403) {
        setError("Access denied. You do not have Instructor privileges.");
        return;
      }

      if (clientsRes.status === "fulfilled") {
        setClients(clientsRes.value.data);
      }
      if (plansRes.status === "fulfilled") {
        setPlans(plansRes.value.data);
      }
      if (pendingRes.status === "fulfilled") {
        setPendingRequests(pendingRes.value.data);
      }

      if (
        clientsRes.status === "rejected" &&
        plansRes.status === "rejected" &&
        pendingRes.status === "rejected"
      ) {
        setError(
          firstError.reason?.response?.data?.error ||
            "Failed to load dashboard data."
        );
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Event Handlers ────────────────────────────────────────────────────────

  const handleLogout = async () => {
    try {
      await axios.post("/auth/logout");
      localStorage.removeItem("user");
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  /**
   * openModalForClient — Opens the assign-workout modal pre-loaded with
   * the selected client and fetches available templates.
   * When called without a client (e.g. from "New Plan" button) shows a
   * client-picker phase first.
   */
  const openModalForClient = async (client = null) => {
    setSelectedClient(client);
    setModalSelectedTpl(null);
    setModalExercises([]);
    setFormError("");
    setFormSuccess("");
    setEditingPlanId(null);
    setCustomTitle("");
    setCustomDescription("");

    const existingPlan = client ? getActivePlanForClient(client._id) : null;
    if (client && existingPlan) {
      setActiveManagePlan(existingPlan);
      setModalPhase("manage");
    } else {
      setActiveManagePlan(null);
      setModalPhase(client ? "template" : "client");
    }
    setShowModal(true);

    setModalLoadingTpl(true);
    try {
      const res = await axios.get("/instructor/templates");
      setModalTemplates(res.data);
    } catch (err) {
      setFormError("Failed to load templates.");
    } finally {
      setModalLoadingTpl(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedClient(null);
    setModalSelectedTpl(null);
    setModalExercises([]);
    setModalPhase("template");
    setFormError("");
    setFormSuccess("");
    setCustomTitle("");
    setCustomDescription("");
    setEditingPlanId(null);
    setActiveManagePlan(null);
  };


  /** handleModalTemplateSelect — Load template exercises into editable state. */
  const handleModalTemplateSelect = (template) => {
    setModalSelectedTpl(template);
    setModalExercises(
      template.exercises.map((ex) => ({
        exerciseName: ex.exerciseName,
        metricType:   ex.metricType || "sets_reps",
        sets:          ex.baseSets,
        reps:          ex.baseReps,
        durationSecs:  ex.baseDurationSecs,
        distanceValue: ex.baseDistanceValue,
        distanceUnit:  ex.baseDistanceUnit || "km",
        timeMinutes:   ex.baseTimeMinutes,
        laps:          ex.baseLaps,
        customMetric:  ex.baseCustomMetric || "",
        notes:         "",
      }))
    );
    setModalPhase("customize");
    setFormError("");
  };


  /** handleModalExerciseChange — Inline edit of any metric field in the customise phase. */
  const handleModalExerciseChange = (index, field, value) => {
    setModalExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  /** addCustomExercise — Add a blank exercise row in custom plan mode */
  const addCustomExercise = () => {
    setModalExercises((prev) => [...prev, { ...BLANK_EXERCISE }]);
  };

  /** startEditPlan — Loads the active plan into the builder for editing. */
  const startEditPlan = (plan) => {
    setEditingPlanId(plan._id);
    setCustomTitle(plan.title || "");
    setCustomDescription(plan.description || "");
    setModalExercises(planExercisesToForm(plan));
    setModalPhase("edit");
    setFormError("");
    setFormSuccess("");
  };

  /** switchToNewPlan — From manage view, open template/custom picker. */
  const switchToNewPlan = () => {
    setActiveManagePlan(null);
    setEditingPlanId(null);
    setModalExercises([]);
    setModalSelectedTpl(null);
    setCustomTitle("");
    setCustomDescription("");
    setModalPhase("template");
    setFormError("");
    setFormSuccess("");
  };

  /** removeCustomExercise — Remove an exercise row */
  const removeCustomExercise = (index) => {
    setModalExercises((prev) => prev.filter((_, i) => i !== index));
  };

  /**

   * handleSubmitPlan — POSTs the template-based assignment to the backend.
   * Refreshes the plans list and auto-closes the modal after success.
   */
  const handleSubmitPlan = async () => {
    setFormError("");
    setFormSuccess("");
    if (!selectedClient || !modalSelectedTpl) return;

    const validation = validateWorkoutExercises(modalExercises, { requireNames: false });
    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post("/instructor/assign-workout", {
        clientId:   selectedClient._id,
        templateId: modalSelectedTpl._id,
        exercises:  modalExercises,
      });

      syncAfterPlanChange(selectedClient._id, res.data.plan);
      await fetchAll();
      setActiveManagePlan(res.data.plan);
      setModalPhase("manage");
      setFormSuccess(res.data.message || "Workout assigned successfully! 🎉");
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to assign plan. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * handleSubmitCustomPlan — POSTs a fully custom workout plan (no template).
   */
  const handleSubmitCustomPlan = async () => {
    setFormError("");
    setFormSuccess("");
    if (!selectedClient) return;
    if (!customTitle.trim()) { setFormError("Plan title is required."); return; }

    const validation = validateWorkoutExercises(modalExercises);
    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post("/instructor/plans", {
        clientId:    selectedClient._id,
        title:       customTitle.trim(),
        description: customDescription.trim(),
        exercises:   modalExercises,
      });

      syncAfterPlanChange(selectedClient._id, res.data.plan);
      await fetchAll();
      setActiveManagePlan(res.data.plan);
      setEditingPlanId(null);
      setModalPhase("manage");
      setFormSuccess(res.data.message || "Custom plan created! 🎉");
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to create plan. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * handleUpdatePlan — PUTs changes to an existing custom plan.
   */
  const handleUpdatePlan = async () => {
    setFormError("");
    setFormSuccess("");
    if (!editingPlanId) return;
    if (!customTitle.trim()) { setFormError("Plan title is required."); return; }

    const validation = validateWorkoutExercises(modalExercises);
    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.put(`/instructor/plans/${editingPlanId}`, {
        title:       customTitle.trim(),
        description: customDescription.trim(),
        exercises:   modalExercises,
      });

      syncAfterPlanChange(getClientId(res.data.plan), res.data.plan);
      await fetchAll();
      setEditingPlanId(null);
      setModalPhase("manage");
      setFormSuccess(res.data.message || "Plan updated successfully! 🎉");
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to update plan. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * handleDeleteActivePlan — Deletes the client's active plan from manage view.
   */
  const handleDeleteActivePlan = async (planId) => {
    if (!window.confirm("Delete this workout plan? This cannot be undone.")) return;
    setFormError("");
    try {
      await axios.delete(`/instructor/plans/${planId}`);
      setPlans((prev) => prev.filter((p) => p._id !== planId));
      setActiveManagePlan(null);
      setEditingPlanId(null);
      switchToNewPlan();
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to delete plan.");
    }
  };


  /**
   * handleDeletePlan — Sends DELETE request then removes the plan from local state.
   * Uses window.confirm as a lightweight guard.
   */
  const handleDeletePlan = async (planId) => {
    if (!window.confirm("Delete this workout plan? This cannot be undone.")) return;
    try {
      await axios.delete(`/instructor/plans/${planId}`);
      setPlans((prev) => prev.filter((p) => p._id !== planId));
      if (activeManagePlan?._id === planId) {
        setActiveManagePlan(null);
      }
    } catch (err) {
      console.error("Delete plan failed:", err.response?.data?.error || err.message);
    }
  };

  // ── Render Sections ───────────────────────────────────────────────────────

  const renderOverview = () => (
    <section className="inst-section" id="section-overview">
      <div className="inst-section__header">
        <div>
          <h2 className="inst-section__title">Your Dashboard</h2>
          <p className="inst-section__sub">
            Welcome back, {instructor?.full_name?.split(" ")[0]}. Here's your quick summary.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="inst-loading">
          <div className="inst-spinner" />
          <p>Loading your data…</p>
        </div>
      ) : error ? (
        <div className="inst-error-banner" role="alert">{error}</div>
      ) : (
        <div className="inst-stats-row">
          <StatCard
            label="Total Clients"
            value={clients.length}
            accent="#6366f1"
          />
          <StatCard
            label="Workout Plans Created"
            value={plans.length}
            accent="#8b5cf6"
          />
        </div>
      )}

      {!loading && !error && (
        <div
          className="inst-card"
          style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}
        >
          <span style={{ color: "var(--inst-text-muted)", fontSize: "0.85rem", flex: 1 }}>
            Ready to build a new workout plan? Select a client from the Clients tab.
          </span>
          <button
            id="goto-clients-btn"
            className="inst-btn inst-btn--primary"
            onClick={() => setActiveTab("clients")}
          >
            View Clients →
          </button>
        </div>
      )}
    </section>
  );

  /**
   * renderClients — Renders the shared <ClientList /> data table.
   * The "Manage Plan" button in each row calls openModalForClient so the
   * existing Create Workout Plan modal is pre-populated with the client.
   */
  const renderClients = () => (
    <section className="inst-section" id="section-clients">
      <div className="inst-section__header">
        <div>
          <h2 className="inst-section__title">Client List</h2>
          <p className="inst-section__sub">
            Clients who have linked to you. Click "Manage Plan" to create a
            personalised workout plan for any client.
          </p>
        </div>
        <button
          id="create-plan-btn"
          className="inst-btn inst-btn--primary"
          onClick={() => openModalForClient()}
        >
          ＋ New Plan
        </button>
      </div>

      {/* ClientList fetches /api/professional/clients independently */}
      <ClientList
        variant="instructor"
        onSelectClient={openModalForClient}
        refreshTrigger={dataRefreshKey}
      />
    </section>
  );

  const renderPlans = () => (
    <section className="inst-section" id="section-plans">
      <div className="inst-section__header">
        <div>
          <h2 className="inst-section__title">Active Workout Plans</h2>
          <p className="inst-section__sub">
            {plans.length} plan{plans.length !== 1 ? "s" : ""} created by you.
          </p>
        </div>
        <button
          id="create-plan-from-plans-btn"
          className="inst-btn inst-btn--primary"
          onClick={() => openModalForClient()}
          disabled={clients.length === 0}
        >
          ＋ New Plan
        </button>
      </div>

      {loading ? (
        <div className="inst-loading">
          <div className="inst-spinner" />
          <p>Loading plans…</p>
        </div>
      ) : error ? (
        <div className="inst-error-banner" role="alert">{error}</div>
      ) : plans.length === 0 ? (
        <div className="inst-empty">
          <p className="inst-empty__text">
            No workout plans yet. Go to the Clients tab and click a client to create one.
          </p>
        </div>
      ) : (
        <div className="inst-plans-grid">
          {plans.map((plan) => (
            <PlanCard key={plan._id} plan={plan} onDelete={handleDeletePlan} />
          ))}
        </div>
      )}
    </section>
  );

  // ── Sidebar nav config ────────────────────────────────────────────────────
  const navItems = [
    { id: "overview",   label: "Overview" },
    { id: "clients",    label: "Clients", badge: pendingRequests.length },
    { id: "plans",      label: "Workout Plans" },
    { id: "templates",  label: "Templates" },
  ];


  const activeNav = navItems.find((n) => n.id === activeTab);

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <GlobalLayout
      layoutClassName="inst-layout"
      mainClassName="inst-main"
      contentClassName="inst-content"
      mainAriaLabel="Instructor content"
      sidebarClassName="inst-sidebar"
      sidebarAriaLabel="Instructor navigation"
      topbarClassName="inst-topbar"
      topbarLeading={(
        <div>
          <h1 className="inst-topbar__title">{activeNav?.label}</h1>
          <p className="inst-topbar__date">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        </div>
      )}
      topbarTrailing={<div className="inst-topbar__badge">Instructor</div>}
      sidebar={({ closeSidebar }) => (
        <>
          <div className="inst-sidebar__brand">
            <span className="inst-brand__name">NutriFit AI</span>
            <span className="inst-brand__sub">Instructor Portal</span>
          </div>

          <nav className="inst-sidebar__nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                className={`inst-nav-link ${activeTab === item.id ? "inst-nav-link--active" : ""}`}
                onClick={() => {
                  setActiveTab(item.id);
                  closeSidebar();
                }}
                aria-current={activeTab === item.id ? "page" : undefined}
              >
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span className="inst-nav-badge" aria-label={`${item.badge} pending requests`}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="inst-sidebar__footer">
            <div className="inst-sidebar__user">
              <button
                ref={avatarBtnRef}
                className="inst-sidebar__avatar"
                id="instructor-avatar-btn"
                aria-label="View your connection code"
                onClick={handleAvatarClick}
                style={{ cursor: "pointer", border: "none" }}
              >
                {instructor?.full_name?.charAt(0).toUpperCase()}
              </button>

              {showCodePopup && (
                <div
                  className="inst-code-popup"
                  id="instructor-code-popup"
                  role="dialog"
                  aria-label="Your connection code"
                  style={{ bottom: popupPos.bottom, left: popupPos.left }}
                >
                  <button
                    className="inst-code-popup__close"
                    onClick={() => setShowCodePopup(false)}
                    aria-label="Close"
                  >✕</button>
                  <p className="inst-code-popup__title">Your Connection Code</p>
                  <p className="inst-code-popup__hint">
                    Share this code with your consumers so they can connect with you in the Professional Hub.
                  </p>
                  <div className="inst-code-popup__code-wrap">
                    <code className="inst-code-popup__code">{instructor?._id}</code>
                    <button
                      className={`inst-code-popup__copy ${codeCopied ? "inst-code-popup__copy--done" : ""}`}
                      id="copy-instructor-code-btn"
                      onClick={handleCopyCode}
                      aria-label="Copy code"
                    >
                      {codeCopied ? "✔ Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <span className="inst-sidebar__user-name">{instructor?.full_name}</span>
                <span className="inst-sidebar__user-role">Instructor</span>
              </div>
            </div>
            <button
              id="instructor-logout-btn"
              className="inst-btn-logout"
              onClick={handleLogout}
              aria-label="Log out of instructor panel"
            >
              Logout
            </button>
          </div>
        </>
      )}
    >
          {activeTab === "overview"  && renderOverview()}
          {activeTab === "clients"   && renderClients()}
          {activeTab === "plans"     && renderPlans()}
          {/* Templates tab — full CRUD for templates + assign to client */}
          {activeTab === "templates" && (
            <TemplateManager
              clients={clients}
              onPlanCreated={() => {
                fetchAll();
                setDataRefreshKey((k) => k + 1);
              }}
            />
          )}

      {/* ── Assign Plan Modal ── */}
      {showModal && (
        <div
          className="inst-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inst-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="inst-modal">
            <div className="inst-modal__header">
              <h2 className="inst-modal__title" id="inst-modal-title">
                {modalPhase === "client"    && "Select a Client"}
                {modalPhase === "manage"    && "Manage Client Plan"}
                {modalPhase === "template"  && "Choose a Template or Custom Plan"}
                {modalPhase === "customize" && "Customise & Assign"}
                {modalPhase === "custom"    && "Build a Custom Plan"}
                {modalPhase === "edit"      && "Edit Workout Plan"}
              </h2>
              <button className="inst-modal__close" onClick={closeModal} aria-label="Close modal">✕</button>
            </div>

            {formError   && <div className="inst-error-banner"   role="alert"  style={{ margin: "0 0 0.75rem" }}>{formError}</div>}
            {formSuccess  && <div className="inst-success-banner" role="status" style={{ margin: "0 0 0.75rem" }}>{formSuccess}</div>}

            {/* ── Phase 1: client picker ── */}
            {modalPhase === "client" && (
              <div className="inst-form__group" style={{ paddingTop: "1rem" }}>
                <label className="inst-form__label" htmlFor="modal-client-select">
                  Which client are you assigning a workout to?
                </label>
                {clients.length === 0 ? (
                  <p style={{ color: "var(--inst-text-muted)", fontSize: "0.88rem" }}>
                    No linked clients yet. Clients appear once they connect with you.
                  </p>
                ) : (
                  <select id="modal-client-select" className="inst-form__select" value=""
                    onChange={(e) => {
                      const found = clients.find((c) => c._id === e.target.value);
                      if (found) { setSelectedClient(found); setModalPhase("template"); }
                    }}
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

            {/* ── Manage active plan ── */}
            {modalPhase === "manage" && activeManagePlan && (
              <div className="inst-manage-plan" style={{ paddingTop: "0.75rem" }}>
                <div className="inst-context-chip" style={{ marginBottom: "1rem" }}>
                  Active plan for <strong>{selectedClient?.full_name}</strong>
                  <button
                    className="inst-btn inst-btn--ghost"
                    style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", marginLeft: "0.5rem" }}
                    onClick={() => setModalPhase("client")}
                  >
                    ↩ Change client
                  </button>
                </div>

                <div className="inst-manage-plan__header">
                  <h3 className="inst-manage-plan__title">{activeManagePlan.title}</h3>
                  {activeManagePlan.description && (
                    <p className="inst-manage-plan__desc">{activeManagePlan.description}</p>
                  )}
                  <p className="inst-manage-plan__meta">
                    Created{" "}
                    {new Date(activeManagePlan.createdAt).toLocaleDateString("en-US", {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                    {" · "}
                    {activeManagePlan.exercises?.length ?? 0} exercise
                    {(activeManagePlan.exercises?.length ?? 0) !== 1 ? "s" : ""}
                  </p>
                </div>

                <ul className="inst-manage-plan__exercises">
                  {activeManagePlan.exercises?.map((ex, i) => (
                    <li key={ex._id || i} className="inst-manage-plan__exercise">
                      <span className="inst-manage-plan__exercise-num">{i + 1}</span>
                      <div className="inst-manage-plan__exercise-body">
                        <strong>{ex.exerciseName}</strong>
                        <span className="inst-manage-plan__exercise-stat">
                          {formatExerciseStat(ex)}
                        </span>
                        {ex.notes && (
                          <p className="inst-manage-plan__exercise-notes">{ex.notes}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="inst-manage-plan__actions">
                  <button
                    type="button"
                    className="inst-btn inst-btn--danger"
                    id="delete-active-plan-btn"
                    onClick={() => handleDeleteActivePlan(activeManagePlan._id)}
                  >
                    🗑 Delete Plan
                  </button>
                  <button
                    type="button"
                    className="inst-btn inst-btn--primary"
                    id="edit-active-plan-btn"
                    onClick={() => startEditPlan(activeManagePlan)}
                  >
                    ✏️ Edit Plan
                  </button>
                  <button
                    type="button"
                    className="inst-btn inst-btn--ghost"
                    onClick={switchToNewPlan}
                  >
                    ＋ Replace with New Plan
                  </button>
                </div>
              </div>
            )}

            {/* ── Phase 2: template picker ── */}
            {modalPhase === "template" && (
              <div style={{ paddingTop: "0.75rem" }}>
                {selectedClient && (() => {
                  // Check if this client has a pending workout request
                  const req = pendingRequests.find((r) => r._id === selectedClient._id);
                  return (
                    <>
                      <div className="inst-context-chip">
                        Assigning to: <strong>{selectedClient.full_name}</strong>
                        {selectedClient.primary_goal && <span style={{ color: "var(--inst-text-muted)" }}>&nbsp;· {selectedClient.primary_goal}</span>}
                        <button className="inst-btn inst-btn--ghost" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", marginLeft: "0.5rem" }}
                          onClick={() => setModalPhase("client")}>↩ Change</button>
                      </div>
                      {req && (
                        <div className="inst-request-banner" style={{ marginTop: "0.75rem" }}>
                          <div>
                            <span className="inst-request-banner__title">Client Requested a Workout Plan</span>
                            {req.workoutRequestNotes && (
                              <p className="inst-request-banner__notes">&ldquo;{req.workoutRequestNotes}&rdquo;</p>
                            )}
                            <span className="inst-request-banner__date">
                              Requested {new Date(req.workoutRequestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
                {selectedClient && <WorkoutSuggestions client={selectedClient} />}
                <p className="inst-form__label" style={{ marginTop: "1rem" }}>Pick a template to start from:</p>
                {modalLoadingTpl ? (
                  <div className="inst-loading"><div className="inst-spinner" /><p>Loading templates…</p></div>
                ) : (
                  <div className="inst-tpl-picker-grid">
                    {/* Custom plan option */}
                    <div id="modal-tpl-custom" className="inst-tpl-picker-card inst-tpl-picker-card--custom"
                      role="button" tabIndex={0}
                      onClick={() => { setModalPhase("custom"); setModalSelectedTpl(null); setModalExercises([]); }}
                      onKeyDown={(e) => e.key === "Enter" && (setModalPhase("custom"), setModalSelectedTpl(null), setModalExercises([]))}>
                      <span className="inst-tpl-picker-card__badge" style={{ background: "rgba(6,182,212,0.2)", color: "#67e8f9" }}>Custom</span>
                      <strong className="inst-tpl-picker-card__name">✏️ Build from Scratch</strong>
                      <span className="inst-tpl-picker-card__count">Create a fully custom plan</span>
                    </div>
                    {modalTemplates.map((t) => (
                      <div key={t._id} id={`modal-tpl-${t._id}`} className="inst-tpl-picker-card"
                        role="button" tabIndex={0}
                        onClick={() => handleModalTemplateSelect(t)}
                        onKeyDown={(e) => e.key === "Enter" && handleModalTemplateSelect(t)}>
                        <span className="inst-tpl-picker-card__badge">{t.goal_tag}</span>
                        <strong className="inst-tpl-picker-card__name">{t.name}</strong>
                        <span className="inst-tpl-picker-card__count">{t.exercises.length} exercises</span>
                      </div>
                    ))}
                    {modalTemplates.length === 0 && (
                      <p style={{ color: "var(--inst-text-muted)", fontSize: "0.88rem", gridColumn: "1/-1" }}>No templates yet. You can still build a custom plan above!</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Phase 3: customise template ── */}
            {modalPhase === "customize" && (
              <div style={{ paddingTop: "0.75rem" }}>
                <div className="inst-context-chip" style={{ marginBottom: "1rem" }}>
                  <strong>{modalSelectedTpl?.name}</strong>
                  <span style={{ color: "var(--inst-text-muted)" }}> → {selectedClient?.full_name}</span>
                  <button className="inst-btn inst-btn--ghost" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", marginLeft: "0.5rem" }}
                    onClick={() => { setModalPhase("template"); setModalSelectedTpl(null); }}>↩ Back</button>
                </div>
                {selectedClient && <WorkoutSuggestions client={selectedClient} />}
                <p className="inst-form__label">Customise exercises:</p>
                <div className="inst-exercises-list" style={{ marginBottom: "1.25rem" }}>
                  {modalExercises.map((ex, i) => (
                    <div key={i} id={`modal-ex-${i}`} className="inst-exercise-row inst-exercise-row--stacked">
                      <span className="inst-exercise-row__name-label">{ex.exerciseName}</span>
                      <ModalExerciseMetricFields ex={ex} index={i} onChange={handleModalExerciseChange} />
                      <ExerciseNotesField ex={ex} index={i} onChange={handleModalExerciseChange} />
                    </div>
                  ))}
                </div>
                <div className="inst-form__actions">
                  <button className="inst-btn inst-btn--ghost" onClick={closeModal} id="cancel-assign-btn">Cancel</button>
                  <button className="inst-btn inst-btn--primary" onClick={handleSubmitPlan}
                    disabled={submitting} id="submit-assign-btn">
                    {submitting ? <><span className="inst-spinner-sm" /> Assigning…</> : "✔ Assign Routine"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Phase 4: custom plan builder / edit ── */}
            {(modalPhase === "custom" || modalPhase === "edit") && (
              <div style={{ paddingTop: "0.75rem" }}>
                <div className="inst-context-chip" style={{ marginBottom: "1rem" }}>
                  <span>
                    {modalPhase === "edit" ? "Editing plan for" : "Custom plan for"}{" "}
                    <strong>{selectedClient?.full_name}</strong>
                  </span>
                  <button className="inst-btn inst-btn--ghost" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", marginLeft: "0.5rem" }}
                    onClick={() => {
                      if (modalPhase === "edit" && activeManagePlan) {
                        setEditingPlanId(null);
                        setModalPhase("manage");
                      } else {
                        setModalPhase("template");
                      }
                    }}>
                    ↩ Back
                  </button>
                </div>

                {selectedClient && <WorkoutSuggestions client={selectedClient} />}

                {/* Plan title + description */}
                <div className="inst-form__group" style={{ marginBottom: "0.85rem" }}>
                  <label className="inst-form__label" htmlFor="custom-plan-title">Plan Title *</label>
                  <input id="custom-plan-title" type="text" className="inst-form__input"
                    placeholder="e.g. 4-Week Cardio Progression"
                    value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} maxLength={120} />
                </div>
                <div className="inst-form__group" style={{ marginBottom: "1rem" }}>
                  <label className="inst-form__label" htmlFor="custom-plan-desc">Description / Notes (optional)</label>
                  <textarea id="custom-plan-desc" className="inst-form__textarea"
                    placeholder="Goals, focus areas, coaching cues…"
                    rows={2} value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)} maxLength={1000} />
                </div>

                {/* Exercise list */}
                <p className="inst-form__label" style={{ marginBottom: "0.5rem" }}>Exercises</p>
                <div className="inst-exercises-list" style={{ marginBottom: "0.85rem" }}>
                  {modalExercises.map((ex, i) => (
                    <div key={i} id={`custom-ex-${i}`} className="inst-exercise-row inst-exercise-row--custom">
                      <div className="inst-exercise-row__top-row">
                        <input type="text" placeholder="Exercise name" className="inst-form__input"
                          style={{ flex: 1 }}
                          value={ex.exerciseName}
                          onChange={(e) => handleModalExerciseChange(i, "exerciseName", e.target.value)} />
                        <select className="inst-form__select" style={{ width: "140px" }}
                          value={ex.metricType}
                          onChange={(e) => handleModalExerciseChange(i, "metricType", e.target.value)}>
                          <option value="sets_reps">Sets × Reps</option>
                          <option value="sets_time">Sets × Duration</option>
                          <option value="distance">Distance</option>
                          <option value="time">Time (mins)</option>
                          <option value="laps">Laps</option>
                          <option value="custom">Custom</option>
                        </select>
                        <button className="inst-exercise-row__remove"
                          onClick={() => removeCustomExercise(i)} aria-label="Remove">✕</button>
                      </div>
                      <ModalExerciseMetricFields ex={ex} index={i} onChange={handleModalExerciseChange} />
                      <ExerciseNotesField ex={ex} index={i} onChange={handleModalExerciseChange} />
                    </div>
                  ))}
                </div>
                <button className="inst-btn inst-btn--ghost" style={{ marginBottom: "1.25rem", width: "100%" }}
                  onClick={addCustomExercise} type="button" id="add-custom-ex-btn">
                  ＋ Add Exercise
                </button>

                <div className="inst-form__actions">
                  <button className="inst-btn inst-btn--ghost" onClick={closeModal} id="cancel-custom-btn">Cancel</button>
                  <button
                    className="inst-btn inst-btn--primary"
                    onClick={modalPhase === "edit" ? handleUpdatePlan : handleSubmitCustomPlan}
                    disabled={submitting}
                    id={modalPhase === "edit" ? "submit-edit-btn" : "submit-custom-btn"}
                  >
                    {submitting ? (
                      <><span className="inst-spinner-sm" /> {modalPhase === "edit" ? "Saving…" : "Creating…"}</>
                    ) : (
                      modalPhase === "edit" ? "✔ Save Changes" : "✔ Create Plan"
                    )}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </GlobalLayout>
  );
};

export default InstructorDashboard;

