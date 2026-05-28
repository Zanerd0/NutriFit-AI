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
import "./InstructorDashboard.css";
import ClientList       from "../components/ClientList";
import TemplateManager  from "../components/TemplateManager";

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
  const [clients, setClients] = useState([]);
  const [plans,   setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showModal,           setShowModal]           = useState(false);
  const [selectedClient,      setSelectedClient]      = useState(null);
  // Template-based assignment flow
  const [modalPhase,          setModalPhase]          = useState("template"); // "client" | "template" | "customize"
  const [modalTemplates,      setModalTemplates]      = useState([]);
  const [modalSelectedTpl,    setModalSelectedTpl]    = useState(null);
  const [modalExercises,      setModalExercises]      = useState([]);
  const [modalLoadingTpl,     setModalLoadingTpl]     = useState(false);
  const [submitting,          setSubmitting]          = useState(false);
  const [formError,           setFormError]           = useState("");
  const [formSuccess,         setFormSuccess]         = useState("");

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
    setModalPhase(client ? "template" : "client");
    setShowModal(true);

    // Pre-fetch templates so the picker is ready immediately
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
  };

  /** handleModalTemplateSelect — Load template exercises into editable state. */
  const handleModalTemplateSelect = (template) => {
    setModalSelectedTpl(template);
    setModalExercises(
      template.exercises.map((ex) => ({
        exerciseName: ex.exerciseName,
        sets:         ex.baseSets,
        reps:         ex.baseReps,
      }))
    );
    setModalPhase("customize");
    setFormError("");
  };

  /** handleModalExerciseChange — Inline edit of sets/reps in the customise phase. */
  const handleModalExerciseChange = (index, field, value) => {
    setModalExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  /**
   * handleSubmitPlan — POSTs the template-based assignment to the backend.
   * Refreshes the plans list and auto-closes the modal after success.
   */
  const handleSubmitPlan = async () => {
    setFormError("");
    setFormSuccess("");
    if (!selectedClient || !modalSelectedTpl) return;

    setSubmitting(true);
    try {
      const res = await axios.post("/instructor/assign-workout", {
        clientId:   selectedClient._id,
        templateId: modalSelectedTpl._id,
        exercises:  modalExercises,
      });

      setFormSuccess(res.data.message || "Workout assigned successfully! 🎉");

      // Refresh plans list
      const plansRes = await axios.get("/instructor/plans");
      setPlans(plansRes.data);

      setTimeout(closeModal, 1500);
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to assign plan. Try again.");
    } finally {
      setSubmitting(false);
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
            icon="👤"
            accent="#6366f1"
          />
          <StatCard
            label="Workout Plans Created"
            value={plans.length}
            icon="📋"
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
          onClick={() => setShowModal(true)}
        >
          ＋ New Plan
        </button>
      </div>

      {/* ClientList fetches /api/professional/clients independently */}
      <ClientList
        variant="instructor"
        onSelectClient={openModalForClient}
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
            <PlanCard key={plan._id} plan={plan} onDelete={handleDeletePlan} />
          ))}
        </div>
      )}
    </section>
  );

  // ── Sidebar nav config ────────────────────────────────────────────────────
  const navItems = [
    { id: "overview",   label: "Overview",       icon: "📊" },
    { id: "clients",    label: "Clients",        icon: "👥" },
    { id: "plans",      label: "Workout Plans",  icon: "📋" },
    { id: "templates",  label: "Templates",      icon: "📐" },
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

            {/* ── Avatar — clickable for connection code popup ── */}
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

            {/* Connection code popup — rendered fixed to escape sidebar overflow */}
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
                <div className="inst-code-popup__icon" aria-hidden="true">🔗</div>
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
          {activeTab === "overview"  && renderOverview()}
          {activeTab === "clients"   && renderClients()}
          {activeTab === "plans"     && renderPlans()}
          {/* Templates tab — full CRUD for templates + assign to client */}
          {activeTab === "templates" && (
            <TemplateManager clients={clients} onPlanCreated={fetchAll} />
          )}
        </div>
      </main>

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
                {modalPhase === "template"  && "Choose a Template"}
                {modalPhase === "customize" && "Customise & Assign"}
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

            {/* ── Phase 2: template picker ── */}
            {modalPhase === "template" && (
              <div style={{ paddingTop: "0.75rem" }}>
                {selectedClient && (
                  <div className="inst-context-chip">
                    Assigning to: <strong>{selectedClient.full_name}</strong>
                    {selectedClient.primary_goal && <span style={{ color: "var(--inst-text-muted)" }}>&nbsp;· {selectedClient.primary_goal}</span>}
                    <button className="inst-btn inst-btn--ghost" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", marginLeft: "0.5rem" }}
                      onClick={() => setModalPhase("client")}>↩ Change</button>
                  </div>
                )}
                <p className="inst-form__label" style={{ marginTop: "1rem" }}>Select a template:</p>
                {modalLoadingTpl ? (
                  <div className="inst-loading"><div className="inst-spinner" /><p>Loading templates…</p></div>
                ) : modalTemplates.length === 0 ? (
                  <p style={{ color: "var(--inst-text-muted)", fontSize: "0.88rem" }}>No templates found. Create one in the Templates tab.</p>
                ) : (
                  <div className="inst-tpl-picker-grid">
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
                  </div>
                )}
              </div>
            )}

            {/* ── Phase 3: customise + assign ── */}
            {modalPhase === "customize" && (
              <div style={{ paddingTop: "0.75rem" }}>
                <div className="inst-context-chip" style={{ marginBottom: "1rem" }}>
                  <strong>{modalSelectedTpl?.name}</strong>
                  <span style={{ color: "var(--inst-text-muted)" }}> → {selectedClient?.full_name}</span>
                  <button className="inst-btn inst-btn--ghost" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", marginLeft: "0.5rem" }}
                    onClick={() => { setModalPhase("template"); setModalSelectedTpl(null); }}>↩ Back</button>
                </div>
                <p className="inst-form__label">Customise sets & reps:</p>
                <div className="inst-exercises-list" style={{ marginBottom: "1.25rem" }}>
                  {modalExercises.map((ex, i) => (
                    <div key={i} id={`modal-ex-${i}`} className="inst-exercise-row inst-exercise-row--compact">
                      <span className="inst-exercise-row__name-label">{ex.exerciseName}</span>
                      <div className="inst-exercise-row__field">
                        <label className="inst-exercise-row__mini-label" htmlFor={`mex-sets-${i}`}>Sets</label>
                        <input id={`mex-sets-${i}`} type="number" min="1"
                          className="inst-form__input inst-form__input--sm"
                          value={ex.sets} onChange={(e) => handleModalExerciseChange(i, "sets", e.target.value)} />
                      </div>
                      <div className="inst-exercise-row__field">
                        <label className="inst-exercise-row__mini-label" htmlFor={`mex-reps-${i}`}>Reps</label>
                        <input id={`mex-reps-${i}`} type="number" min="1"
                          className="inst-form__input inst-form__input--sm"
                          value={ex.reps} onChange={(e) => handleModalExerciseChange(i, "reps", e.target.value)} />
                      </div>
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

          </div>
        </div>
      )}
    </div>
  );
};

export default InstructorDashboard;
