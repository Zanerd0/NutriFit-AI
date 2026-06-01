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

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import "./DieticianDashboard.css";
import ClientList from "../components/ClientList";

const DAYS_ORDER = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];
const DAY_LABELS = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};
const MEAL_KEYS = ["breakfast", "lunch", "dinner"];
const MEAL_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const isAiPlan = (plan) =>
  !!plan?.weekSchedule &&
  typeof plan.weekSchedule === "object" &&
  Object.keys(plan.weekSchedule).length > 0;

const emptyWeekSchedule = () =>
  Object.fromEntries(
    DAYS_ORDER.map((day) => [
      day,
      { breakfast: "", lunch: "", dinner: "" },
    ])
  );

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

  /** showCodePopup — toggles the sidebar avatar code popup */
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
    if (!dietician?._id) return;
    navigator.clipboard.writeText(dietician._id).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // ── Remote data ───────────────────────────────────────────────────────────
  const [clients,          setClients]          = useState([]);
  const [plans,            setPlans]            = useState([]);
  const [pendingRequests,  setPendingRequests]  = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState("");
  const [dataRefreshKey,   setDataRefreshKey]   = useState(0);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showModal,      setShowModal]      = useState(false);
  const [selectedClient, setSelectedClient] = useState(null); // Consumer chosen for new plan
  const [formData,       setFormData]       = useState({ title: "", description: "" });
  const [meals,          setMeals]          = useState([]);   // Dynamic meal rows
  const [submitting,     setSubmitting]     = useState(false);
  const [formError,      setFormError]      = useState("");
  const [formSuccess,    setFormSuccess]    = useState("");
  const [modalPhase,     setModalPhase]     = useState("client");
  const [clientAiPlan,   setClientAiPlan]   = useState(null);
  const [clientCustomPlans, setClientCustomPlans] = useState([]);
  const [managingPlan,   setManagingPlan]   = useState(null);
  const [weekScheduleEdit, setWeekScheduleEdit] = useState(emptyWeekSchedule());
  const [activeEditDay, setActiveEditDay] = useState("monday");
  const [loadingClientPlans, setLoadingClientPlans] = useState(false);

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
      const [clientsRes, plansRes, pendingRes] = await Promise.all([
        axios.get("/dietician/clients"),
        axios.get("/dietician/plans"),
        axios.get("/dietician/pending-requests"),
      ]);
      setClients(clientsRes.data);
      setPlans(plansRes.data);
      setPendingRequests(pendingRes.data);
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
  const loadClientPlans = useCallback(async (clientId) => {
    setLoadingClientPlans(true);
    try {
      const res = await axios.get(`/dietician/clients/${clientId}/plans`);
      const { aiPlan, customPlans } = res.data;
      setClientAiPlan(aiPlan || null);
      setClientCustomPlans(customPlans || []);
      const primary = aiPlan || (customPlans?.length ? customPlans[0] : null);
      setManagingPlan(primary);
      setModalPhase(primary ? "manage" : "create");
      return { aiPlan, customPlans, primary };
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to load client plans.");
      setClientAiPlan(null);
      setClientCustomPlans([]);
      setManagingPlan(null);
      setModalPhase("create");
      return null;
    } finally {
      setLoadingClientPlans(false);
    }
  }, []);

  const openModalForClient = async (client) => {
    setSelectedClient(client);
    setFormData({ title: "", description: "" });
    setMeals([]);
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
    await loadClientPlans(client._id);
  };

  const openNewPlanModal = () => {
    setSelectedClient(null);
    setFormData({ title: "", description: "" });
    setMeals([]);
    setFormError("");
    setFormSuccess("");
    setClientAiPlan(null);
    setClientCustomPlans([]);
    setManagingPlan(null);
    setModalPhase("client");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedClient(null);
    setFormData({ title: "", description: "" });
    setMeals([]);
    setFormError("");
    setFormSuccess("");
    setModalPhase("client");
    setClientAiPlan(null);
    setClientCustomPlans([]);
    setManagingPlan(null);
    setWeekScheduleEdit(emptyWeekSchedule());
  };

  const syncAfterPlanChange = (clientId) => {
    if (clientId) {
      setPendingRequests((prev) => prev.filter((r) => r._id !== clientId));
      setDataRefreshKey((k) => k + 1);
    }
  };

  const selectManagingPlanById = (planId) => {
    if (clientAiPlan?._id === planId) {
      setManagingPlan(clientAiPlan);
      return;
    }
    const found = clientCustomPlans.find((p) => p._id === planId);
    if (found) setManagingPlan(found);
  };

  const startEditAi = () => {
    if (!managingPlan || !isAiPlan(managingPlan)) return;
    setWeekScheduleEdit(
      DAYS_ORDER.reduce((acc, day) => {
        const src = managingPlan.weekSchedule?.[day] || {};
        acc[day] = {
          breakfast: src.breakfast || "",
          lunch: src.lunch || "",
          dinner: src.dinner || "",
        };
        return acc;
      }, {})
    );
    setActiveEditDay("monday");
    setModalPhase("edit-ai");
    setFormError("");
    setFormSuccess("");
  };

  const startEditCustom = () => {
    if (!managingPlan || isAiPlan(managingPlan)) return;
    setFormData({
      title: managingPlan.title || "",
      description: managingPlan.description || "",
    });
    setMeals(managingPlan.meals?.length ? [...managingPlan.meals] : []);
    setModalPhase("edit-custom");
    setFormError("");
    setFormSuccess("");
  };

  const startCreateCustom = () => {
    setFormData({ title: "", description: "" });
    setMeals([]);
    setModalPhase("create");
    setFormError("");
    setFormSuccess("");
  };

  const updateWeekMeal = (day, meal, value) => {
    setWeekScheduleEdit((prev) => ({
      ...prev,
      [day]: { ...prev[day], [meal]: value },
    }));
  };

  const handleUpdateAiPlan = async (e) => {
    e.preventDefault();
    if (!managingPlan?._id) return;
    setSubmitting(true);
    setFormError("");
    setFormSuccess("");
    try {
      const res = await axios.put(`/dietician/plans/${managingPlan._id}`, {
        weekSchedule: weekScheduleEdit,
      });
      setClientAiPlan(res.data.plan);
      setManagingPlan(res.data.plan);
      syncAfterPlanChange(selectedClient?._id);
      setModalPhase("manage");
      setFormSuccess("AI diet plan updated successfully!");
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to update plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCustomPlan = async (e) => {
    e.preventDefault();
    if (!managingPlan?._id || !formData.title.trim()) {
      setFormError("Plan title is required.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    setFormSuccess("");
    try {
      const res = await axios.put(`/dietician/plans/${managingPlan._id}`, {
        title: formData.title.trim(),
        description: formData.description.trim(),
        meals,
      });
      const updated = res.data.plan;
      setClientCustomPlans((prev) =>
        prev.map((p) => (p._id === updated._id ? updated : p))
      );
      setManagingPlan(updated);
      syncAfterPlanChange(selectedClient?._id);
      setModalPhase("manage");
      setFormSuccess("Custom plan updated successfully!");
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to update plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePlan = async (plan) => {
    if (!plan?._id) return;
    const label = isAiPlan(plan) ? "AI diet plan" : `"${plan.title}"`;
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    setFormError("");
    try {
      await axios.delete(`/dietician/plans/${plan._id}`);
      if (isAiPlan(plan)) {
        setClientAiPlan(null);
      } else {
        setClientCustomPlans((prev) => prev.filter((p) => p._id !== plan._id));
      }
      const remaining = isAiPlan(plan)
        ? clientCustomPlans[0] || null
        : clientAiPlan || clientCustomPlans.find((p) => p._id !== plan._id) || null;
      setManagingPlan(remaining);
      setModalPhase(remaining ? "manage" : "create");
      syncAfterPlanChange(selectedClient?._id);
      const plansRes = await axios.get("/dietician/plans");
      setPlans(plansRes.data);
      setFormSuccess("Plan deleted.");
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to delete plan.");
    }
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

      const plansRes = await axios.get("/dietician/plans");
      setPlans(plansRes.data);

      if (selectedClient?._id) {
        syncAfterPlanChange(selectedClient._id);
        const loaded = await loadClientPlans(selectedClient._id);
        if (loaded?.customPlans?.length) {
          const newest = loaded.customPlans[0];
          setManagingPlan(newest);
          setModalPhase("manage");
        }
      }
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
          onClick={openNewPlanModal}
        >
          ＋ New Plan
        </button>
      </div>

      {/* ClientList fetches /api/professional/clients independently */}
      <ClientList
        variant="dietician"
        onSelectClient={openModalForClient}
        refreshTrigger={dataRefreshKey}
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
          onClick={openNewPlanModal}
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
    { id: "clients",  label: "Clients",     icon: "👥", badge: pendingRequests.length },
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
              {item.badge > 0 && (
                <span className="diet-nav-badge" aria-label={`${item.badge} pending requests`}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer: user info + logout */}
        <div className="diet-sidebar__footer">
          <div className="diet-sidebar__user">

            {/* ── Avatar — clickable for connection code popup ── */}
            <button
              ref={avatarBtnRef}
              className="diet-sidebar__avatar"
              id="dietician-avatar-btn"
              aria-label="View your connection code"
              onClick={handleAvatarClick}
              style={{ cursor: "pointer", border: "none" }}
            >
              {dietician?.full_name?.charAt(0).toUpperCase()}
            </button>

            {/* Connection code popup — rendered fixed to escape sidebar overflow */}
            {showCodePopup && (
              <div
                className="diet-code-popup"
                id="dietician-code-popup"
                role="dialog"
                aria-label="Your connection code"
                style={{ bottom: popupPos.bottom, left: popupPos.left }}
              >
                <button
                  className="diet-code-popup__close"
                  onClick={() => setShowCodePopup(false)}
                  aria-label="Close"
                >✕</button>
                <div className="diet-code-popup__icon" aria-hidden="true">🔗</div>
                <p className="diet-code-popup__title">Your Connection Code</p>
                <p className="diet-code-popup__hint">
                  Share this code with your consumers so they can connect with you in the Professional Hub.
                </p>
                <div className="diet-code-popup__code-wrap">
                  <code className="diet-code-popup__code">{dietician?._id}</code>
                  <button
                    className={`diet-code-popup__copy ${codeCopied ? "diet-code-popup__copy--done" : ""}`}
                    id="copy-dietician-code-btn"
                    onClick={handleCopyCode}
                    aria-label="Copy code"
                  >
                    {codeCopied ? "✔ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

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

      {/* ── Plan management modal ── */}
      {showModal && (
        <div
          className="diet-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="diet-modal diet-modal--wide">

            <div className="diet-modal__header">
              <h2 className="diet-modal__title" id="modal-title">
                {modalPhase === "manage" && "Manage Client Diet Plan"}
                {modalPhase === "create" && "Create Custom Diet Plan"}
                {modalPhase === "edit-ai" && "Edit AI Diet Plan"}
                {modalPhase === "edit-custom" && "Edit Custom Diet Plan"}
                {modalPhase === "client" && "Select Client"}
              </h2>
              <button className="diet-modal__close" onClick={closeModal} aria-label="Close modal">✕</button>
            </div>

            {formError && <div className="diet-error-banner" role="alert">{formError}</div>}
            {formSuccess && <div className="diet-success-banner" role="status">{formSuccess}</div>}

            {selectedClient && (() => {
              const req = pendingRequests.find((r) => r._id === selectedClient._id);
              if (!req) return null;
              return (
                <div className="diet-request-banner">
                  <span className="diet-request-banner__icon">📋</span>
                  <div>
                    <span className="diet-request-banner__title">
                      {req.aiPlanSentForReview
                        ? "Client Sent AI Diet Plan for Review"
                        : "Client Requested a Diet Plan"}
                    </span>
                    {req.dietPlanRequestNotes && (
                      <p className="diet-request-banner__notes">&ldquo;{req.dietPlanRequestNotes}&rdquo;</p>
                    )}
                    {req.dietPlanRequestedAt && (
                      <span className="diet-request-banner__date">
                        {new Date(req.dietPlanRequestedAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {modalPhase === "client" && (
              <div className="diet-form__group" style={{ paddingTop: "0.5rem" }}>
                <label className="diet-form__label" htmlFor="plan-client-select">Select client *</label>
                <select
                  id="plan-client-select"
                  className="diet-form__select"
                  value={selectedClient?._id || ""}
                  onChange={async (e) => {
                    const found = clients.find((c) => c._id === e.target.value);
                    if (found) {
                      setSelectedClient(found);
                      await loadClientPlans(found._id);
                    }
                  }}
                >
                  <option value="" disabled>— Select a consumer —</option>
                  {clients.map((c) => (
                    <option key={c._id} value={c._id}>{c.full_name} ({c.email})</option>
                  ))}
                </select>
              </div>
            )}

            {loadingClientPlans && (
              <div className="diet-loading" style={{ padding: "1.5rem" }}>
                <div className="diet-spinner" />
                <p>Loading plans…</p>
              </div>
            )}

            {!loadingClientPlans && modalPhase === "manage" && selectedClient && (
              <div className="diet-manage">
                <div className="diet-context-chip">
                  Plans for <strong>{selectedClient.full_name}</strong>
                </div>

                {(clientAiPlan || clientCustomPlans.length > 0) && (
                  <div className="diet-form__group">
                    <label className="diet-form__label" htmlFor="diet-plan-picker">View plan</label>
                    <select
                      id="diet-plan-picker"
                      className="diet-form__select"
                      value={managingPlan?._id || ""}
                      onChange={(e) => selectManagingPlanById(e.target.value)}
                    >
                      {clientAiPlan && (
                        <option value={clientAiPlan._id}>
                          AI Plan (Active){clientAiPlan.sentToDietician ? " — sent for review" : ""}
                        </option>
                      )}
                      {clientCustomPlans.map((p) => (
                        <option key={p._id} value={p._id}>Custom: {p.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                {managingPlan && isAiPlan(managingPlan) && (
                  <div className="diet-manage__preview">
                    <h3 className="diet-manage__heading">AI 7-Day Plan</h3>
                    {managingPlan.sentToDietician && (
                      <p className="diet-manage__badge">Awaiting your review</p>
                    )}
                    <div className="diet-ai-week">
                      {DAYS_ORDER.map((day) => (
                        <div key={day} className="diet-ai-day">
                          <strong>{DAY_LABELS[day]}</strong>
                          {MEAL_KEYS.map((meal) => (
                            <p key={meal} className="diet-ai-meal">
                              <span>{meal}:</span>{" "}
                              {managingPlan.weekSchedule?.[day]?.[meal] || "—"}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {managingPlan && !isAiPlan(managingPlan) && (
                  <div className="diet-manage__preview">
                    <h3 className="diet-manage__heading">{managingPlan.title}</h3>
                    {managingPlan.description && (
                      <p className="diet-manage__desc">{managingPlan.description}</p>
                    )}
                    <ul className="diet-manage__meals">
                      {(managingPlan.meals || []).map((m, i) => (
                        <li key={i}>
                          <strong>{m.mealTime || "Meal"}</strong> — {m.foodItems || "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!managingPlan && !clientAiPlan && clientCustomPlans.length === 0 && (
                  <p className="diet-manage__empty">No plans yet for this client.</p>
                )}

                <div className="diet-manage__actions">
                  {managingPlan && (
                    <>
                      <button
                        type="button"
                        className="diet-btn diet-btn--primary"
                        onClick={isAiPlan(managingPlan) ? startEditAi : startEditCustom}
                      >
                        ✏️ Edit Plan
                      </button>
                      <button
                        type="button"
                        className="diet-btn diet-btn--danger"
                        onClick={() => handleDeletePlan(managingPlan)}
                      >
                        🗑 Delete Plan
                      </button>
                    </>
                  )}
                  <button type="button" className="diet-btn diet-btn--ghost" onClick={startCreateCustom}>
                    ＋ New Custom Plan
                  </button>
                </div>
              </div>
            )}

            {!loadingClientPlans && modalPhase === "edit-ai" && (
              <form className="diet-form" onSubmit={handleUpdateAiPlan}>
                <p className="diet-form__hint">
                  Select a day below to edit meals. Only one day is open at a time.
                </p>
                <div className="diet-day-tabs" role="tablist" aria-label="Days of the week">
                  {DAYS_ORDER.map((day) => (
                    <button
                      key={day}
                      type="button"
                      role="tab"
                      aria-selected={activeEditDay === day}
                      className={`diet-day-tabs__btn${activeEditDay === day ? " diet-day-tabs__btn--active" : ""}`}
                      onClick={() => setActiveEditDay(day)}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
                <div
                  className="diet-ai-edit-panel"
                  role="tabpanel"
                  aria-label={`${DAY_LABELS[activeEditDay]} meals`}
                >
                  <h4 className="diet-ai-edit-panel__title">{DAY_LABELS[activeEditDay]}</h4>
                  {MEAL_KEYS.map((meal) => (
                    <label key={meal} className="diet-ai-edit-meal">
                      <span>{MEAL_LABELS[meal]}</span>
                      <textarea
                        className="diet-form__textarea diet-form__textarea--sm"
                        rows={3}
                        value={weekScheduleEdit[activeEditDay]?.[meal] || ""}
                        onChange={(e) => updateWeekMeal(activeEditDay, meal, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <div className="diet-form__actions">
                  <button type="button" className="diet-btn diet-btn--ghost" onClick={() => setModalPhase("manage")}>
                    Cancel
                  </button>
                  <button type="submit" className="diet-btn diet-btn--primary" disabled={submitting}>
                    {submitting ? "Saving…" : "Save AI Plan"}
                  </button>
                </div>
              </form>
            )}

            {!loadingClientPlans && (modalPhase === "create" || modalPhase === "edit-custom") && (
              <form
                className="diet-form"
                onSubmit={modalPhase === "edit-custom" ? handleUpdateCustomPlan : handleSubmitPlan}
              >
                {!selectedClient && modalPhase === "create" && (
                  <div className="diet-form__group">
                    <label className="diet-form__label" htmlFor="plan-client-select-create">Client *</label>
                    <select
                      id="plan-client-select-create"
                      className="diet-form__select"
                      value=""
                      onChange={async (e) => {
                        const found = clients.find((c) => c._id === e.target.value);
                        if (found) setSelectedClient(found);
                      }}
                    >
                      <option value="" disabled>— Select a consumer —</option>
                      {clients.map((c) => (
                        <option key={c._id} value={c._id}>{c.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="diet-form__group">
                  <label className="diet-form__label" htmlFor="plan-title">Plan Title *</label>
                  <input
                    id="plan-title"
                    type="text"
                    className="diet-form__input"
                    value={formData.title}
                    onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                    maxLength={120}
                    required
                  />
                </div>

                <div className="diet-form__group">
                  <label className="diet-form__label" htmlFor="plan-desc">Description</label>
                  <textarea
                    id="plan-desc"
                    className="diet-form__textarea"
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    maxLength={1000}
                  />
                </div>

                <div className="diet-form__group">
                  <label className="diet-form__label">Meals</label>
                  {meals.map((meal, index) => (
                    <div key={index} className="diet-meal-row">
                      <input
                        type="text"
                        className="diet-form__input"
                        placeholder="Meal time"
                        value={meal.mealTime}
                        onChange={(e) => updateMeal(index, "mealTime", e.target.value)}
                      />
                      <input
                        type="text"
                        className="diet-form__input"
                        placeholder="Food items"
                        value={meal.foodItems}
                        onChange={(e) => updateMeal(index, "foodItems", e.target.value)}
                      />
                      <button type="button" className="diet-meal-row__remove" onClick={() => removeMeal(index)}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="diet-btn-add-meal" onClick={addMealRow}>＋ Add Meal</button>
                </div>

                <div className="diet-form__actions">
                  <button
                    type="button"
                    className="diet-btn diet-btn--ghost"
                    onClick={() => setModalPhase(managingPlan || clientAiPlan || clientCustomPlans.length ? "manage" : "client")}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="diet-btn diet-btn--primary" disabled={submitting}>
                    {submitting ? "Saving…" : modalPhase === "edit-custom" ? "Save Changes" : "Create Plan"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DieticianDashboard;
