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

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import "./InstructorDashboard.css";

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * StatCard — A single metric tile in the overview strip.
 */
const StatCard = ({ label, value, icon, accent }) => (
  <div className="inst-stat-card" style={{ "--accent": accent }}>
    <div className="inst-stat-card__icon">{icon}</div>
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
const PlanCard = ({ plan }) => (
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
            💪 {ex.exerciseName} — {ex.sets}×{ex.reps}
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

  // ── Remote data ───────────────────────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [plans,   setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showModal,      setShowModal]      = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [formData,       setFormData]       = useState({ title: "", description: "" });
  const [exercises,      setExercises]      = useState([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [formError,      setFormError]      = useState("");
  const [formSuccess,    setFormSuccess]    = useState("");

  // ── Data Fetching ─────────────────────────────────────────────────────────

  /**
   * fetchAll — Fetches clients and plans concurrently using Promise.all.
   * Wrapped in useCallback so it can be called again after creating a plan.
   */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fire both requests simultaneously — avoids waterfall latency
      const [clientsRes, plansRes] = await Promise.all([
        axios.get("/instructor/clients"),
        axios.get("/instructor/plans"),
      ]);
      setClients(clientsRes.data);
      setPlans(plansRes.data);
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access denied. You do not have Instructor privileges.");
      } else {
        setError(err.response?.data?.error || "Failed to load dashboard data.");
      }
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

  /** openModalForClient — Pre-selects a client and opens the modal. */
  const openModalForClient = (client) => {
    setSelectedClient(client);
    setFormData({ title: "", description: "" });
    setExercises([]);
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedClient(null);
    setFormData({ title: "", description: "" });
    setExercises([]);
    setFormError("");
    setFormSuccess("");
  };

  /** addExerciseRow — Appends an empty exercise entry. */
  const addExerciseRow = () => {
    setExercises((prev) => [
      ...prev,
      { exerciseName: "", sets: "", reps: "", duration: "" },
    ]);
  };

  /** updateExercise — Updates a field on one exercise row by index. */
  const updateExercise = (index, field, value) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  /** removeExercise — Removes an exercise row by index. */
  const removeExercise = (index) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * handleSubmitPlan — Validates and POSTs the new workout plan.
   * On success, refreshes the plans list and shows a brief success message.
   */
  const handleSubmitPlan = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!selectedClient) {
      return setFormError("Please select a client for this plan.");
    }
    if (!formData.title.trim()) {
      return setFormError("Plan title is required.");
    }

    // Map form strings to proper number types; drop empty duration fields
    const processedExercises = exercises.map((ex) => ({
      exerciseName: ex.exerciseName,
      sets:         parseInt(ex.sets,     10) || 1,
      reps:         parseInt(ex.reps,     10) || 1,
      ...(ex.duration ? { duration: parseInt(ex.duration, 10) } : {}),
    }));

    setSubmitting(true);
    try {
      await axios.post("/instructor/plans", {
        clientId:    selectedClient._id,
        title:       formData.title.trim(),
        description: formData.description.trim(),
        exercises:   processedExercises,
      });

      setFormSuccess("Workout plan created successfully! 🎉");

      // Refresh plans list to include the newly created entry
      const plansRes = await axios.get("/instructor/plans");
      setPlans(plansRes.data);

      setTimeout(closeModal, 1200);
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to create plan. Try again.");
    } finally {
      setSubmitting(false);
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
            icon="👤"
            accent="#6366f1"
          />
          <StatCard
            label="Workout Plans Created"
            value={plans.length}
            icon="📋"
            accent="#8b5cf6"
          />
          <StatCard
            label="Total Exercises"
            value={plans.reduce((acc, p) => acc + (p.exercises?.length ?? 0), 0)}
            icon="💪"
            accent="#06b6d4"
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

  const renderClients = () => (
    <section className="inst-section" id="section-clients">
      <div className="inst-section__header">
        <div>
          <h2 className="inst-section__title">Client List</h2>
          <p className="inst-section__sub">
            {clients.length} consumer{clients.length !== 1 ? "s" : ""} registered.
            Click a client to create a workout plan for them.
          </p>
        </div>
        <button
          id="create-plan-btn"
          className="inst-btn inst-btn--primary"
          onClick={() => setShowModal(true)}
          disabled={clients.length === 0}
        >
          ＋ New Plan
        </button>
      </div>

      {loading ? (
        <div className="inst-loading">
          <div className="inst-spinner" />
          <p>Loading clients…</p>
        </div>
      ) : error ? (
        <div className="inst-error-banner" role="alert">{error}</div>
      ) : clients.length === 0 ? (
        <div className="inst-empty">
          <div className="inst-empty__icon">👥</div>
          <p className="inst-empty__text">No consumers have registered yet.</p>
        </div>
      ) : (
        <div className="inst-client-grid">
          {clients.map((client) => (
            <ClientCard
              key={client._id}
              client={client}
              isSelected={selectedClient?._id === client._id}
              onSelect={openModalForClient}
            />
          ))}
        </div>
      )}
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
          onClick={() => setShowModal(true)}
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
          <div className="inst-empty__icon">📋</div>
          <p className="inst-empty__text">
            No workout plans yet. Go to the Clients tab and click a client to create one.
          </p>
        </div>
      ) : (
        <div className="inst-plans-grid">
          {plans.map((plan) => (
            <PlanCard key={plan._id} plan={plan} />
          ))}
        </div>
      )}
    </section>
  );

  // ── Sidebar nav config ────────────────────────────────────────────────────
  const navItems = [
    { id: "overview", label: "Overview",       icon: "📊" },
    { id: "clients",  label: "Clients",        icon: "👥" },
    { id: "plans",    label: "Workout Plans",  icon: "📋" },
  ];

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="inst-layout">

      {/* ── Sidebar ── */}
      <aside className="inst-sidebar" aria-label="Instructor navigation">
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
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? "page" : undefined}
            >
              <span className="inst-nav-link__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="inst-sidebar__footer">
          <div className="inst-sidebar__user">
            <div className="inst-sidebar__avatar">
              {instructor?.full_name?.charAt(0).toUpperCase()}
            </div>
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
            ⏻ Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="inst-main" aria-label="Instructor content">
        <header className="inst-topbar">
          <div>
            <h1 className="inst-topbar__title">
              {navItems.find((n) => n.id === activeTab)?.icon}{" "}
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
            <p className="inst-topbar__date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div className="inst-topbar__badge">🏋️ Instructor</div>
        </header>

        <div className="inst-content">
          {activeTab === "overview" && renderOverview()}
          {activeTab === "clients"  && renderClients()}
          {activeTab === "plans"    && renderPlans()}
        </div>
      </main>

      {/* ── Create Plan Modal ── */}
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
                ＋ Create New Workout Plan
              </h2>
              <button
                className="inst-modal__close"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form className="inst-form" onSubmit={handleSubmitPlan}>

              {/* Client selector */}
              <div className="inst-form__group">
                <label className="inst-form__label" htmlFor="plan-client-select">
                  Assign to Client *
                </label>
                {selectedClient ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div className="inst-selected-client">
                      <div className="inst-avatar inst-avatar--sm">
                        {selectedClient.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="inst-selected-client__name">
                          {selectedClient.full_name}
                        </div>
                        <div className="inst-selected-client__email">
                          {selectedClient.email}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inst-btn inst-btn--ghost"
                      style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem", width: "max-content" }}
                      onClick={() => setSelectedClient(null)}
                    >
                      ↩ Change client
                    </button>
                  </div>
                ) : (
                  <select
                    id="plan-client-select"
                    className="inst-form__select"
                    value=""
                    onChange={(e) => {
                      const found = clients.find((c) => c._id === e.target.value);
                      if (found) setSelectedClient(found);
                    }}
                  >
                    <option value="" disabled>— Select a consumer —</option>
                    {clients.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.full_name} ({c.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Title */}
              <div className="inst-form__group">
                <label className="inst-form__label" htmlFor="plan-title">
                  Plan Title *
                </label>
                <input
                  id="plan-title"
                  type="text"
                  className="inst-form__input"
                  placeholder="e.g., Beginner Full-Body Week 1"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  maxLength={120}
                  required
                />
              </div>

              {/* Description */}
              <div className="inst-form__group">
                <label className="inst-form__label" htmlFor="plan-desc">
                  Description (optional)
                </label>
                <textarea
                  id="plan-desc"
                  className="inst-form__textarea"
                  placeholder="Coaching notes, goals, or instructions for the client…"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  maxLength={1000}
                />
              </div>

              {/* Exercises */}
              <div className="inst-form__group">
                <label className="inst-form__label">Exercises (optional)</label>

                {exercises.length > 0 && (
                  <>
                    {/* Column headers */}
                    <div className="inst-exercise-col-headers">
                      <span className="inst-exercise-col-header">Exercise Name</span>
                      <span className="inst-exercise-col-header">Sets</span>
                      <span className="inst-exercise-col-header">Reps</span>
                      <span className="inst-exercise-col-header">Duration (s)</span>
                      <span />
                    </div>

                    <div className="inst-exercises-list">
                      {exercises.map((ex, index) => (
                        <div key={index} className="inst-exercise-row">
                          <input
                            type="text"
                            className="inst-form__input"
                            placeholder="e.g., Push-Up"
                            value={ex.exerciseName}
                            onChange={(e) => updateExercise(index, "exerciseName", e.target.value)}
                            aria-label={`Exercise ${index + 1} name`}
                          />
                          <input
                            type="number"
                            className="inst-form__input"
                            placeholder="3"
                            min="1"
                            value={ex.sets}
                            onChange={(e) => updateExercise(index, "sets", e.target.value)}
                            aria-label={`Exercise ${index + 1} sets`}
                          />
                          <input
                            type="number"
                            className="inst-form__input"
                            placeholder="10"
                            min="1"
                            value={ex.reps}
                            onChange={(e) => updateExercise(index, "reps", e.target.value)}
                            aria-label={`Exercise ${index + 1} reps`}
                          />
                          <input
                            type="number"
                            className="inst-form__input"
                            placeholder="—"
                            min="0"
                            value={ex.duration}
                            onChange={(e) => updateExercise(index, "duration", e.target.value)}
                            aria-label={`Exercise ${index + 1} duration`}
                          />
                          <button
                            type="button"
                            className="inst-exercise-row__remove"
                            onClick={() => removeExercise(index)}
                            aria-label={`Remove exercise ${index + 1}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  className="inst-btn-add-exercise"
                  onClick={addExerciseRow}
                  id="add-exercise-btn"
                >
                  ＋ Add Exercise
                </button>
              </div>

              {/* Inline messages */}
              {formError   && <div className="inst-error-banner"   role="alert">{formError}</div>}
              {formSuccess  && <div className="inst-success-banner" role="status">{formSuccess}</div>}

              {/* Actions */}
              <div className="inst-form__actions">
                <button
                  type="button"
                  className="inst-btn inst-btn--ghost"
                  onClick={closeModal}
                  id="cancel-plan-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inst-btn inst-btn--primary"
                  disabled={submitting}
                  id="submit-plan-btn"
                >
                  {submitting ? (
                    <><span className="inst-spinner-sm" /> Saving…</>
                  ) : (
                    "Create Plan"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstructorDashboard;
