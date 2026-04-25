/**
 * @file DieticianDashboard.jsx
 * @description The main Dietician Dashboard page for NutriFit AI.
 *
 * This component renders a full dietician control panel with:
 *   - A fixed sidebar for navigation between sections
 *   - A "Overview" section with quick-stat cards
 *   - A "Clients" section displaying all Consumer-role users
 *   - A "Diet Plans" section: create new plans + view existing ones
 *
 * Authentication & Authorization:
 *   Protected by <DieticianRoute> in App.jsx, which verifies the user's
 *   role is "Dietician" before this component can render.
 *
 * Data Fetching:
 *   Uses the shared Axios instance (withCredentials: true) so the
 *   HTTP-only JWT cookie is automatically attached to every API request.
 *
 * State Management:
 *   - clients:        Array of Consumer users from GET /api/dietician/clients
 *   - plans:          Array of diet plans from GET /api/dietician/plans
 *   - activeTab:      Controls which sidebar section is rendered
 *   - showModal:      Boolean to open/close the Create Plan modal
 *   - selectedClient: The Consumer that was clicked/selected for a new plan
 *   - formData:       Controlled form state for the new plan form
 *   - meals:          Dynamic array of meal entries being built in the form
 *   - submitting:     Boolean to show spinner during form submission
 *   - formError:      Inline error message from failed submission
 *   - formSuccess:    Success message after a plan is created
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import "./DieticianDashboard.css";
import ClientList from "../components/ClientList";

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * StatCard — A single metric tile in the overview strip.
 * @param {string}  label  - Human-readable label
 * @param {number}  value  - Numeric value to display
 * @param {string}  icon   - Emoji icon
 * @param {string}  accent - CSS color for the radial glow
 */
const StatCard = ({ label, value, icon, accent }) => (
  <div className="diet-stat-card" style={{ "--accent": accent }}>
    <div className="diet-stat-card__icon">{icon}</div>
    <div>
      <span className="diet-stat-card__value">{value ?? "—"}</span>
      <span className="diet-stat-card__label">{label}</span>
    </div>
  </div>
);

/**
 * ClientCard — A clickable card representing a single Consumer.
 * Clicking it opens the Create Plan modal with this client pre-selected.
 * @param {object}   client       - The user document
 * @param {boolean}  isSelected   - Whether this card is the selected client
 * @param {Function} onSelect     - Callback when clicked
 */
const ClientCard = ({ client, isSelected, onSelect }) => (
  <div
    className={`diet-client-card ${isSelected ? "diet-client-card--selected" : ""}`}
    onClick={() => onSelect(client)}
    role="button"
    tabIndex={0}
    aria-pressed={isSelected}
    onKeyDown={(e) => e.key === "Enter" && onSelect(client)}
    id={`client-card-${client._id}`}
  >
    {isSelected && <span className="diet-client-card__check">✔</span>}
    <div className="diet-avatar">
      {client.full_name?.charAt(0).toUpperCase()}
    </div>
    <div>
      <div className="diet-client-card__name">{client.full_name}</div>
      <div className="diet-client-card__email">{client.email}</div>
    </div>
  </div>
);

/**
 * PlanCard — Displays a single diet plan in the Active Plans grid.
 * @param {object} plan - A DietPlan document (with clientId populated)
 */
const PlanCard = ({ plan }) => (
  <div className="diet-plan-card" id={`plan-card-${plan._id}`}>
    {/* Top-bar accent is injected by CSS ::after */}
    <h3 className="diet-plan-card__title">{plan.title}</h3>

    {/* Description (truncated via CSS line-clamp) */}
    {plan.description && (
      <p className="diet-plan-card__desc">{plan.description}</p>
    )}

    {/* Assigned client chip */}
    <div className="diet-plan-card__client">
      <div className="diet-avatar diet-avatar--sm">
        {plan.clientId?.full_name?.charAt(0).toUpperCase() ?? "?"}
      </div>
      <div>
        <span className="diet-plan-card__client-label">Client</span>
        <span className="diet-plan-card__client-name">
          {plan.clientId?.full_name ?? "Unknown"}
        </span>
      </div>
    </div>

    {/* Meal time tags (first 3 only to avoid overflow) */}
    {plan.meals?.length > 0 && (
      <div className="diet-plan-card__meals">
        {plan.meals.slice(0, 3).map((m, i) => (
          <span key={i} className="diet-plan-card__meal-tag">
            🍽 {m.mealTime}
          </span>
        ))}
        {plan.meals.length > 3 && (
          <span className="diet-plan-card__meal-tag" style={{ opacity: 0.6 }}>
            +{plan.meals.length - 3} more
          </span>
        )}
      </div>
    )}

    {/* Footer: date + meal count */}
    <div className="diet-plan-card__footer">
      <span className="diet-plan-card__date">
        {new Date(plan.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
      <span className="diet-plan-card__meals-count">
        {plan.meals?.length ?? 0} meal{plan.meals?.length !== 1 ? "s" : ""}
      </span>
    </div>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const DieticianDashboard = () => {
  const navigate     = useNavigate();
  const dietician    = JSON.parse(localStorage.getItem("user"));

  // ── Navigation ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("overview");

  // ── Remote data ───────────────────────────────────────────────────────────
  const [clients,  setClients]  = useState([]);   // All Consumer users
  const [plans,    setPlans]    = useState([]);    // This dietician's plans
  const [loading,  setLoading]  = useState(true);  // Initial load spinner
  const [error,    setError]    = useState("");    // Fetch error message

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showModal,      setShowModal]      = useState(false);
  const [selectedClient, setSelectedClient] = useState(null); // Consumer chosen for new plan
  const [formData,       setFormData]       = useState({ title: "", description: "" });
  const [meals,          setMeals]          = useState([]);   // Dynamic meal rows
  const [submitting,     setSubmitting]     = useState(false);
  const [formError,      setFormError]      = useState("");
  const [formSuccess,    setFormSuccess]    = useState("");

  // ── Data Fetching ─────────────────────────────────────────────────────────

  /**
   * fetchAll — Calls both endpoints concurrently using Promise.all for efficiency.
   * Wrapped in useCallback so it can be called again after creating a plan.
   */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fire both requests simultaneously — avoids waterfall latency
      const [clientsRes, plansRes] = await Promise.all([
        axios.get("/dietician/clients"),
        axios.get("/dietician/plans"),
      ]);
      setClients(clientsRes.data);
      setPlans(plansRes.data);
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access denied. You do not have Dietician privileges.");
      } else {
        setError(err.response?.data?.error || "Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger fetch on first render
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Event Handlers ────────────────────────────────────────────────────────

  /**
   * handleLogout — Calls the backend logout endpoint, clears local storage,
   * and navigates the user back to the login page.
   */
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
   * openModalForClient — Pre-selects a client and opens the Create Plan modal.
   * Called when the user clicks a ClientCard.
   * @param {object} client - The Consumer user document
   */
  const openModalForClient = (client) => {
    setSelectedClient(client);
    setFormData({ title: "", description: "" });
    setMeals([]);
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  };

  /**
   * closeModal — Resets all modal state and hides the overlay.
   */
  const closeModal = () => {
    setShowModal(false);
    setSelectedClient(null);
    setFormData({ title: "", description: "" });
    setMeals([]);
    setFormError("");
    setFormSuccess("");
  };

  /**
   * addMealRow — Appends an empty meal entry to the dynamic meals list.
   */
  const addMealRow = () => {
    setMeals((prev) => [...prev, { mealTime: "", foodItems: "" }]);
  };

  /**
   * updateMeal — Updates a specific field of a meal at a given index.
   * @param {number} index - Index in the meals array
   * @param {string} field - "mealTime" or "foodItems"
   * @param {string} value - New value
   */
  const updateMeal = (index, field, value) => {
    setMeals((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  /**
   * removeMeal — Removes a meal row at the given index.
   * @param {number} index - Index to remove
   */
  const removeMeal = (index) => {
    setMeals((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * handleSubmitPlan — Validates and submits the new diet plan form.
   * On success, re-fetches the plans list and shows a success message.
   */
  const handleSubmitPlan = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    // Client-side guard: must have a client selected and a title
    if (!selectedClient) {
      return setFormError("Please select a client for this plan.");
    }
    if (!formData.title.trim()) {
      return setFormError("Plan title is required.");
    }

    setSubmitting(true);
    try {
      await axios.post("/dietician/plans", {
        clientId:    selectedClient._id,
        title:       formData.title.trim(),
        description: formData.description.trim(),
        meals,
      });

      setFormSuccess("Diet plan created successfully! 🎉");

      // Refresh the plans list to show the newly created plan
      const plansRes = await axios.get("/dietician/plans");
      setPlans(plansRes.data);

      // Close the modal after a short delay so the user can read the message
      setTimeout(closeModal, 1200);
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to create plan. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render Sections ───────────────────────────────────────────────────────

  /**
   * renderOverview — Quick stat cards at the top of the dashboard.
   */
  const renderOverview = () => (
    <section className="diet-section" id="section-overview">
      <div className="diet-section__header">
        <div>
          <h2 className="diet-section__title">Your Dashboard</h2>
          <p className="diet-section__sub">
            Welcome back, {dietician?.full_name?.split(" ")[0]}. Here's a quick summary.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="diet-loading">
          <div className="diet-spinner" />
          <p>Loading your data…</p>
        </div>
      ) : error ? (
        <div className="diet-error-banner" role="alert">{error}</div>
      ) : (
        <div className="diet-stats-row">
          <StatCard
            label="Total Clients"
            value={clients.length}
            icon="👤"
            accent="#22c55e"
          />
          <StatCard
            label="Diet Plans Created"
            value={plans.length}
            icon="📋"
            accent="#06b6d4"
          />
          <StatCard
            label="Total Meals Planned"
            value={plans.reduce((acc, p) => acc + (p.meals?.length ?? 0), 0)}
            icon="🍽️"
            accent="#f59e0b"
          />
        </div>
      )}

      {/* Quick actions */}
      {!loading && !error && (
        <div className="diet-card" style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--diet-text-muted)", fontSize: "0.85rem", flex: 1 }}>
            Ready to create a new nutrition plan? Select a client from the Clients tab.
          </span>
          <button
            id="goto-clients-btn"
            className="diet-btn diet-btn--primary"
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
   * The "Manage Plan" button in each row calls openModalForClient to
   * pre-select the client and open the Create Plan modal.
   */
  const renderClients = () => (
    <section className="diet-section" id="section-clients">
      <div className="diet-section__header">
        <div>
          <h2 className="diet-section__title">Client List</h2>
          <p className="diet-section__sub">
            Clients who have linked to you. Click "Manage Plan" to create a
            personalised diet plan for any client.
          </p>
        </div>
        <button
          id="create-plan-btn"
          className="diet-btn diet-btn--primary"
          onClick={() => setShowModal(true)}
        >
          ＋ New Plan
        </button>
      </div>

      {/* ClientList fetches /api/professional/clients independently */}
      <ClientList
        variant="dietician"
        onSelectClient={openModalForClient}
      />
    </section>
  );

  /**
   * renderPlans — Grid of this dietician's created diet plans.
   */
  const renderPlans = () => (
    <section className="diet-section" id="section-plans">
      <div className="diet-section__header">
        <div>
          <h2 className="diet-section__title">Active Diet Plans</h2>
          <p className="diet-section__sub">
            {plans.length} plan{plans.length !== 1 ? "s" : ""} created by you.
          </p>
        </div>
        <button
          id="create-plan-from-plans-btn"
          className="diet-btn diet-btn--primary"
          onClick={() => setShowModal(true)}
          disabled={clients.length === 0}
        >
          ＋ New Plan
        </button>
      </div>

      {loading ? (
        <div className="diet-loading">
          <div className="diet-spinner" />
          <p>Loading plans…</p>
        </div>
      ) : error ? (
        <div className="diet-error-banner" role="alert">{error}</div>
      ) : plans.length === 0 ? (
        <div className="diet-empty">
          <div className="diet-empty__icon">📋</div>
          <p className="diet-empty__text">
            No diet plans yet. Go to the Clients tab and click a client to create one.
          </p>
        </div>
      ) : (
        <div className="diet-plans-grid">
          {plans.map((plan) => (
            <PlanCard key={plan._id} plan={plan} />
          ))}
        </div>
      )}
    </section>
  );

  // ── Sidebar nav config ────────────────────────────────────────────────────
  const navItems = [
    { id: "overview", label: "Overview",    icon: "📊" },
    { id: "clients",  label: "Clients",     icon: "👥" },
    { id: "plans",    label: "Diet Plans",  icon: "📋" },
  ];

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="diet-layout">

      {/* ── Sidebar ── */}
      <aside className="diet-sidebar" aria-label="Dietician navigation">

        {/* Brand */}
        <div className="diet-sidebar__brand">
          <span className="diet-brand__name">NutriFit AI</span>
          <span className="diet-brand__sub">Dietician Portal</span>
        </div>

        {/* Navigation links */}
        <nav className="diet-sidebar__nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`diet-nav-link ${activeTab === item.id ? "diet-nav-link--active" : ""}`}
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? "page" : undefined}
            >
              <span className="diet-nav-link__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer: user info + logout */}
        <div className="diet-sidebar__footer">
          <div className="diet-sidebar__user">
            <div className="diet-sidebar__avatar">
              {dietician?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="diet-sidebar__user-name">{dietician?.full_name}</span>
              <span className="diet-sidebar__user-role">Dietician</span>
            </div>
          </div>
          <button
            id="dietician-logout-btn"
            className="diet-btn-logout"
            onClick={handleLogout}
            aria-label="Log out of dietician panel"
          >
            ⏻ Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="diet-main" aria-label="Dietician content">

        {/* Top bar */}
        <header className="diet-topbar">
          <div>
            <h1 className="diet-topbar__title">
              {navItems.find((n) => n.id === activeTab)?.icon}{" "}
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
            <p className="diet-topbar__date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div className="diet-topbar__badge">🥗 Dietician</div>
        </header>

        {/* Dynamic section based on activeTab */}
        <div className="diet-content">
          {activeTab === "overview" && renderOverview()}
          {activeTab === "clients"  && renderClients()}
          {activeTab === "plans"    && renderPlans()}
        </div>
      </main>

      {/* ── Create Plan Modal ── */}
      {showModal && (
        <div
          className="diet-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="diet-modal">

            {/* Modal header */}
            <div className="diet-modal__header">
              <h2 className="diet-modal__title" id="modal-title">
                ＋ Create New Diet Plan
              </h2>
              <button
                className="diet-modal__close"
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form className="diet-form" onSubmit={handleSubmitPlan}>

              {/* Client selector */}
              <div className="diet-form__group">
                <label className="diet-form__label" htmlFor="plan-client-select">
                  Assign to Client *
                </label>
                {selectedClient ? (
                  /* Show chosen client + allow changing */
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div className="diet-selected-client">
                      <div className="diet-avatar diet-avatar--sm">
                        {selectedClient.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="diet-selected-client__info">
                        <div className="diet-selected-client__name">
                          {selectedClient.full_name}
                        </div>
                        <div className="diet-selected-client__email">
                          {selectedClient.email}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="diet-btn diet-btn--ghost"
                      style={{ fontSize: "0.78rem", padding: "0.4rem 0.75rem", width: "max-content" }}
                      onClick={() => setSelectedClient(null)}
                    >
                      ↩ Change client
                    </button>
                  </div>
                ) : (
                  /* Dropdown to pick client */
                  <select
                    id="plan-client-select"
                    className="diet-form__select"
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
              <div className="diet-form__group">
                <label className="diet-form__label" htmlFor="plan-title">
                  Plan Title *
                </label>
                <input
                  id="plan-title"
                  type="text"
                  className="diet-form__input"
                  placeholder="e.g., Weight-Loss Week 1"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  maxLength={120}
                  required
                />
              </div>

              {/* Description */}
              <div className="diet-form__group">
                <label className="diet-form__label" htmlFor="plan-desc">
                  Description (optional)
                </label>
                <textarea
                  id="plan-desc"
                  className="diet-form__textarea"
                  placeholder="Goals, notes, or instructions for the client…"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  maxLength={1000}
                />
              </div>

              {/* Meals */}
              <div className="diet-form__group">
                <label className="diet-form__label">
                  Meals (optional)
                </label>

                {meals.length > 0 && (
                  <div className="diet-meals-list">
                    {meals.map((meal, index) => (
                      <div key={index} className="diet-meal-row">
                        <input
                          type="text"
                          className="diet-form__input"
                          placeholder="Meal time (e.g. Breakfast)"
                          value={meal.mealTime}
                          onChange={(e) => updateMeal(index, "mealTime", e.target.value)}
                          aria-label={`Meal ${index + 1} time`}
                        />
                        <input
                          type="text"
                          className="diet-form__input"
                          placeholder="Food items"
                          value={meal.foodItems}
                          onChange={(e) => updateMeal(index, "foodItems", e.target.value)}
                          aria-label={`Meal ${index + 1} food items`}
                        />
                        <button
                          type="button"
                          className="diet-meal-row__remove"
                          onClick={() => removeMeal(index)}
                          aria-label={`Remove meal ${index + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="diet-btn-add-meal"
                  onClick={addMealRow}
                  id="add-meal-btn"
                >
                  ＋ Add Meal
                </button>
              </div>

              {/* Inline messages */}
              {formError   && <div className="diet-error-banner"   role="alert">{formError}</div>}
              {formSuccess  && <div className="diet-success-banner" role="status">{formSuccess}</div>}

              {/* Actions */}
              <div className="diet-form__actions">
                <button
                  type="button"
                  className="diet-btn diet-btn--ghost"
                  onClick={closeModal}
                  id="cancel-plan-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="diet-btn diet-btn--primary"
                  disabled={submitting}
                  id="submit-plan-btn"
                >
                  {submitting ? (
                    <><span className="diet-spinner-sm" /> Saving…</>
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

export default DieticianDashboard;
