/**
 * @file ConsumerDashboard.jsx
 * @description The main Consumer Dashboard page for NutriFit AI.
 *
 * Sections:
 *   1. Welcome & Health Stats — greeting card with editable weight/height/goal
 *   2. My Diet Plans          — cards from GET /api/consumer/diet-plans
 *   3. My Workout             — active plan from GET /api/consumer/my-workout
 *   4. NutriFit AI Advisor    — live AI chat widget (free tier)
 *
 * Authentication & Authorization:
 *   Protected by <ConsumerRoute> in App.jsx (role === "Consumer").
 *
 * Data Fetching:
 *   Uses shared Axios instance (withCredentials: true) — the HTTP-only JWT
 *   cookie is automatically sent with every request.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation }          from "react-router-dom";
import axios                                 from "../api/axios";
import ProfessionalHub                       from "./ProfessionalHub";
import MyWorkout                             from "../components/MyWorkout";
import DailyLogForm                          from "../components/DailyLogForm";
import ProgressCharts                        from "../components/ProgressCharts";
import DietPlanDisplay                       from "../components/DietPlanDisplay";
import AIChat                                from "../components/AIChat";
import "./ConsumerDashboard.css";

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * DietPlanCard — Displays one diet plan card with meal breakdown.
 * @param {object} plan - A DietPlan document (with dieticianId populated)
 */
const DietPlanCard = ({ plan }) => (
  <div className="con-plan-card con-plan-card--diet" id={`diet-plan-${plan._id}`}>
    <h3 className="con-plan-card__title">{plan.title}</h3>

    {plan.description && (
      <p className="con-plan-card__desc">{plan.description}</p>
    )}

    {/* Assigned by (Dietician) */}
    <div className="con-plan-card__author">
      <div>
        <span className="con-plan-card__author-label con-plan-card__author-label--diet">
          Assigned by Dietician
        </span>
        <span className="con-plan-card__author-name">
          {plan.dieticianId?.full_name ?? "Unknown"}
        </span>
      </div>
    </div>

    {/* Meals list */}
    {plan.meals?.length > 0 && (
      <div className="con-plan-card__items">
        {plan.meals.map((meal, i) => (
          <div key={i} className="con-plan-card__item">
            <span className="con-plan-card__item-dot">🍽</span>
            <div className="con-plan-card__item-body">
              <span className="con-plan-card__item-title">{meal.mealTime}</span>
              <span className="con-plan-card__item-sub">{meal.foodItems}</span>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="con-plan-card__footer">
      <span className="con-plan-card__date">
        {new Date(plan.createdAt).toLocaleDateString("en-US", {
          year: "numeric", month: "short", day: "numeric",
        })}
      </span>
      <span className="con-plan-card__badge con-plan-card__badge--diet">
        {plan.meals?.length ?? 0} meals
      </span>
    </div>
  </div>
);


// =============================================================================
// MAIN COMPONENT
// =============================================================================

const ConsumerDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Read the consumer object saved to localStorage on login.
  // We keep a local copy in state so profile edits update the UI immediately.
  const [consumer, setConsumer] = useState(
    () => JSON.parse(localStorage.getItem("user")) ?? {}
  );

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("home");

  // ── Remote data ────────────────────────────────────────────────────────────
  const [dietPlans,    setDietPlans]    = useState([]);
  /**
   * activeWorkout — the single instructor-assigned WorkoutPlan for this consumer.
   *   undefined = fetch still in-flight (shows loading spinner in MyWorkout)
   *   null      = fetch complete, no plan assigned
   *   object    = the active WorkoutPlan document
   */
  const [activeWorkout, setActiveWorkout] = useState(undefined);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");

  /**
   * aiPlan — The latest AI-generated diet plan for this consumer.
   * Starts as null (not generated). Updated either from the initial
   * fetch of /consumer/diet-plans (if the API returns it) or from
   * the DietPlanDisplay generate form callback.
   */
  const [aiPlan, setAiPlan] = useState(null);

  /**
   * dieticianName — Display name of the consumer's connected dietician.
   */
  const [dieticianName,   setDieticianName]   = useState("");

  /**
   * instructorName — Display name of the consumer's connected instructor.
   */
  const [instructorName,  setInstructorName]  = useState("");

  // ── Profile edit state ─────────────────────────────────────────────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm,    setProfileForm]    = useState({
    weight:       consumer.weight       ?? "",
    height:       consumer.height       ?? "",
    primary_goal: consumer.primary_goal ?? consumer.goal ?? "",
  });
  const [saving,        setSaving]        = useState(false);
  const [profileMsg,    setProfileMsg]    = useState({ type: "", text: "" });

  /**
   * upgradeSuccess — true when the user just returned from a successful Stripe
   * payment. Triggers the "Welcome to Premium!" toast banner.
   */
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [upgradeError,   setUpgradeError]   = useState("");

  /**
   * handleUpgradeClick — Called by the locked 🔒 PDF buttons in DietPlanDisplay
   * and MyWorkout. Navigates the consumer to the Professional Hub tab where the
   * Stripe upgrade paywall is displayed.
   */
  const handleUpgradeClick = () => setActiveTab("hub");

  /**
   * refreshTrigger — an incrementing counter passed to ProgressCharts.
   * Incrementing this value causes ProgressCharts to re-fetch progress
   * history from the server after DailyLogForm saves a new entry.
   */
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  /** showPremiumPopup — toggles the avatar premium info popup card. */
  const [showPremiumPopup, setShowPremiumPopup] = useState(false);

  /**
   * handleProgressSaved — callback passed to DailyLogForm.onSuccess.
   * Bumps refreshTrigger by 1, which triggers the ProgressCharts useEffect.
   */
  const handleProgressSaved = () => setRefreshTrigger((n) => n + 1);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  /**
   * fetchPlans — Loads diet plans, the active workout plan, and the
   * AI-generated diet plan concurrently on mount.
   */
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const consumerId = consumer?._id;
      const [dietRes, workoutRes, aiPlanRes] = await Promise.all([
        axios.get("/consumer/diet-plans"),
        axios.get("/consumer/my-workout"),
        // Restore the persisted AI plan — null response is fine (no plan yet)
        consumerId
          ? fetch(`/api/diet-plan/active/${consumerId}`, {
              credentials: "include",
            }).then((r) => r.json()).catch(() => ({ success: false, data: null }))
          : Promise.resolve({ success: false, data: null }),
      ]);
      setDietPlans(dietRes.data);
      // Backend returns { plan: WorkoutPlan | null }
      setActiveWorkout(workoutRes.data.plan ?? null);
      // Restore AI plan if one was previously generated
      if (aiPlanRes?.success && aiPlanRes?.data) {
        setAiPlan(aiPlanRes.data);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access denied. You do not have Consumer privileges.");
      } else {
        setError(err.response?.data?.error || "Failed to load your plans.");
      }
      // Set to null so MyWorkout shows its empty state rather than staying in loading
      setActiveWorkout(null);
    } finally {
      setLoading(false);
    }
  }, [consumer?._id]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  /**
   * upgradeEffect — After Stripe redirect (?upgrade=success&session_id=…):
   * confirms payment with the backend, then syncs consumer state so isPremium
   * updates immediately (no full page reload).
   */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("upgrade") !== "success") return;

    const sessionId = params.get("session_id");
    window.history.replaceState({}, "", "/consumer");

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const applyUser = (user) => {
      setConsumer(user);
      localStorage.setItem("user", JSON.stringify(user));
    };

    const finalizeUpgrade = async () => {
      setUpgradeError("");
      const maxAttempts = sessionId ? 6 : 3;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          if (sessionId) {
            const confirmRes = await axios.post("/stripe/confirm-checkout", { sessionId });
            if (confirmRes.data?.user) {
              applyUser(confirmRes.data.user);
              if (confirmRes.data.user.isPremium) {
                setUpgradeSuccess(true);
                setTimeout(() => setUpgradeSuccess(false), 6000);
                return;
              }
            }
          }

          const res = await axios.get("/consumer/me");
          const fresh = res.data.user;
          applyUser(fresh);
          if (fresh?.isPremium) {
            setUpgradeSuccess(true);
            setTimeout(() => setUpgradeSuccess(false), 6000);
            return;
          }
        } catch (err) {
          console.warn("Premium activation attempt failed:", err.message);
        }

        if (attempt < maxAttempts - 1) {
          await sleep(1200);
        }
      }

      setUpgradeError(
        "Payment received, but Premium could not be activated yet. Please refresh in a moment or contact support."
      );
    };

    finalizeUpgrade();
  }, [location.search]);

  /**
   * refreshConsumer — Fetches the full consumer document from the server so
   * that fields like dieticianId / instructorId are always current. Called once
   * on mount AND exposed as a callback to ProfessionalHub so it can trigger a
   * sync after connect / disconnect without a full page reload.
   */
  const refreshConsumer = useCallback(async () => {
    try {
      const res = await axios.get("/consumer/me");
      const fresh = res.data.user;
      setConsumer(fresh);
      localStorage.setItem("user", JSON.stringify(fresh));
    } catch (err) {
      // Non-critical: fall back gracefully to whatever is in localStorage
      console.warn("Could not refresh consumer from server:", err.message);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("upgrade") === "success") return;
    refreshConsumer();
  }, [refreshConsumer, location.search]);

  /**
   * dieticianNameEffect — Fetches the connected dietician's display name
   * whenever consumer.dieticianId changes (e.g., after connecting in the Hub).
   * This name is passed to DietPlanDisplay so the action bar shows it.
   */
  useEffect(() => {
    const fetchProfessionalNames = async () => {
      if (!consumer?.dieticianId && !consumer?.instructorId) {
        setDieticianName("");
        setInstructorName("");
        return;
      }
      try {
        const res = await fetch("/api/professionals/status", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (data?.dietician?.name)   setDieticianName(data.dietician.name);
        if (data?.instructor?.name)  setInstructorName(data.instructor.name);
      } catch {
        // Non-critical — display names are cosmetic
      }
    };
    fetchProfessionalNames();
  }, [consumer?.dieticianId, consumer?.instructorId]);

  // ── Event Handlers ─────────────────────────────────────────────────────────

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
   * handleSaveProfile — PATCHes health metrics to /api/consumer/profile.
   * On success, updates both localStorage and local state so the UI reflects
   * the new values immediately without a full page reload.
   */
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg({ type: "", text: "" });

    try {
      // Only send fields that have actual values
      const payload = {};
      if (profileForm.weight       !== "") payload.weight       = Number(profileForm.weight);
      if (profileForm.height       !== "") payload.height       = Number(profileForm.height);
      if (profileForm.primary_goal !== "") payload.primary_goal = profileForm.primary_goal;

      const res = await axios.patch("/consumer/profile", payload);

      // Update local state and localStorage with the server-returned user object
      setConsumer(res.data.user);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      setProfileMsg({ type: "success", text: "Profile updated successfully!" });
      setEditingProfile(false);
    } catch (err) {
      setProfileMsg({
        type: "error",
        text: err.response?.data?.error || "Failed to save profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Render Helpers ─────────────────────────────────────────────────────────

  /**
   * renderWelcomeCard — Greeting + health stats + optional edit form.
   * Stat pills now show Diet Plans count only (workout count removed).
   */
  const renderWelcomeCard = () => (
    <div className="con-welcome-card">
      <div className="con-welcome-card__top">
        <div>
          <h2 className="con-welcome-greeting">
            Welcome back, <span>{consumer.full_name?.split(" ")[0]}!</span>
          </h2>
          <p className="con-welcome-subtitle">
            Track your assigned nutrition and workout plans below.
          </p>
        </div>
        <button
          className="con-edit-profile-btn"
          id="edit-profile-btn"
          onClick={() => {
            setEditingProfile((v) => !v);
            setProfileMsg({ type: "", text: "" });
          }}
        >
          {editingProfile ? "✕ Cancel" : "✏ Edit Profile"}
        </button>
      </div>

      {/* Health stat pills */}
      <div className="con-health-stats">
        <div className="con-health-stat">
          <span className="con-health-stat__label">Weight</span>
          <span className="con-health-stat__value">
            {consumer.weight ?? "—"}
            {consumer.weight && <span className="con-health-stat__unit"> kg</span>}
          </span>
        </div>
        <div className="con-health-stat">
          <span className="con-health-stat__label">Height</span>
          <span className="con-health-stat__value">
            {consumer.height ?? "—"}
            {consumer.height && <span className="con-health-stat__unit"> cm</span>}
          </span>
        </div>
        <div className="con-health-stat">
          <span className="con-health-stat__label">Goal</span>
          <span className="con-health-stat__value" style={{ fontSize: "0.9rem" }}>
            {consumer.primary_goal ?? consumer.goal ?? "Not set"}
          </span>
        </div>
        <div className="con-health-stat">
          <span className="con-health-stat__label">Diet Plans</span>
          <span className="con-health-stat__value">{dietPlans.length}</span>
        </div>
        <div className="con-health-stat">
          <span className="con-health-stat__label">Workout</span>
          <span className="con-health-stat__value">
            {activeWorkout ? "Active" : "None"}
          </span>
        </div>
      </div>

      {/* Inline profile edit form */}
      {editingProfile && (
        <form className="con-profile-form" onSubmit={handleSaveProfile}>
          <div className="con-form-group">
            <label className="con-form-label" htmlFor="profile-weight">Weight (kg)</label>
            <input
              id="profile-weight"
              type="number"
              step="0.1"
              min="1"
              className="con-form-input"
              placeholder="e.g. 72.5"
              value={profileForm.weight}
              onChange={(e) =>
                setProfileForm((p) => ({ ...p, weight: e.target.value }))
              }
            />
          </div>
          <div className="con-form-group">
            <label className="con-form-label" htmlFor="profile-height">Height (cm)</label>
            <input
              id="profile-height"
              type="number"
              step="0.1"
              min="1"
              className="con-form-input"
              placeholder="e.g. 175"
              value={profileForm.height}
              onChange={(e) =>
                setProfileForm((p) => ({ ...p, height: e.target.value }))
              }
            />
          </div>
          <div className="con-form-group">
            <label className="con-form-label" htmlFor="profile-goal">Fitness Goal</label>
            <select
              id="profile-goal"
              className="con-form-select"
              value={profileForm.primary_goal}
              onChange={(e) =>
                setProfileForm((p) => ({ ...p, primary_goal: e.target.value }))
              }
            >
              <option value="">— Select goal —</option>
              <option>Lose Weight</option>
              <option>Gain Muscle</option>
              <option>Maintain Weight</option>
              <option>Improve Endurance</option>
              <option>General Fitness</option>
            </select>
          </div>
          <div className="con-form-group" style={{ justifyContent: "flex-end" }}>
            <button
              type="submit"
              id="save-profile-btn"
              className="con-btn con-btn--primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {profileMsg.text && (
            <div
              className={profileMsg.type === "success" ? "con-success-banner" : "con-error-banner"}
              style={{ gridColumn: "1 / -1" }}
            >
              {profileMsg.text}
            </div>
          )}
        </form>
      )}
    </div>
  );

  /**
   * handleAiPlanGenerated — Callback from DietPlanDisplay when the user
   * successfully generates a new AI diet plan. Updates local state so the
   * 7-day grid renders immediately without a full page reload.
   */
  const handleAiPlanGenerated = (newPlan) => {
    setAiPlan(newPlan);
  };

  /**
   * renderDietPlans — Two-section diet view:
   *   1. AI-generated plan (DietPlanDisplay with inline generate form)
   *   2. Dietician-assigned plan cards grid
   */
  const renderDietPlans = () => (
    <div className="con-section" id="section-diet">
      <div className="con-section__header">
        <span className="con-section__icon">🥗</span>
        <h2 className="con-section__title">My Diet Plans</h2>
        <span className="con-section__count">{dietPlans.length} assigned plan{dietPlans.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── AI-Generated Plan ───────────────────────────────────────────── */}
      <DietPlanDisplay
        weekSchedule={aiPlan?.weekSchedule}
        generatedAt={aiPlan?.createdAt}
        planData={aiPlan ?? undefined}
        consumer={consumer}
        isPremium={consumer?.isPremium ?? false}
        onUpgradeClick={handleUpgradeClick}
        onPlanGenerated={handleAiPlanGenerated}
        onPlanDeleted={() => setAiPlan(null)}
        dieticianId={consumer?.dieticianId ?? null}
        connectedDieticianName={dieticianName}
      />

      {/* ── Dietician-Assigned Plans ─────────────────────────────────── */}
      {loading ? (
        <div className="con-loading"><div className="con-spinner" /><p>Loading…</p></div>
      ) : error ? (
        <div className="con-error-banner" role="alert">{error}</div>
      ) : dietPlans.length === 0 ? (
        <div className="con-empty">
          <div className="con-empty__icon">🥗</div>
          <p className="con-empty__text">No dietician-assigned plans yet. Your dietician will create one for you soon.</p>
        </div>
      ) : (
        <div className="con-plans-grid">
          {dietPlans.map((plan) => <DietPlanCard key={plan._id} plan={plan} />)}
        </div>
      )}
    </div>
  );

  /**
   * renderAIAdvisor — Live AI Chat widget (free tier).
   */
  const renderAIAdvisor = () => (
    <div className="con-section" id="section-ai">
      <div className="con-section__header">
        <span className="con-section__icon">🤖</span>
        <h2 className="con-section__title">NutriFit AI Advisor</h2>
        <span className="con-section__count">Free Tier</span>
      </div>
      <AIChat />
    </div>
  );

  // ── Sidebar nav config ────────────────────────────────────────────────────

  const navItems = [
    { id: "home",       label: "Home",               icon: "🏠" },
    { id: "ai",         label: "AI Advisor",         icon: "🤖" },
    { id: "diet",       label: "Diet Plans",         icon: "🥗" },
    { id: "my-workout", label: "My Workout",         icon: "💪" },
    { id: "progress",   label: "My Progress",        icon: "📈" },
    { id: "hub",        label: "Professional Hub",   icon: "✦"  },
  ];


  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="con-layout">

      {/* ── Premium Upgrade Toast ── */}
      {upgradeError && (
        <div className="con-upgrade-toast con-upgrade-toast--error" role="alert">
          <span className="con-upgrade-toast__icon" aria-hidden="true">⚠</span>
          <div>
            <strong>Premium activation pending</strong>
            <p>{upgradeError}</p>
          </div>
          <button
            className="con-upgrade-toast__close"
            aria-label="Dismiss"
            onClick={() => setUpgradeError("")}
          >
            ✕
          </button>
        </div>
      )}

      {upgradeSuccess && (
        <div className="con-upgrade-toast" role="status" aria-live="polite">
          <span className="con-upgrade-toast__icon" aria-hidden="true">⭐</span>
          <div>
            <strong>Welcome to NutriFit Premium!</strong>
            <p>You now have full access to the Professional Hub and PDF downloads.</p>
          </div>
          <button
            className="con-upgrade-toast__close"
            aria-label="Dismiss"
            onClick={() => setUpgradeSuccess(false)}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside className="con-sidebar" aria-label="Consumer navigation">
        <div className="con-sidebar__brand">
          <span className="con-brand__name">NutriFit AI</span>
          <span className="con-brand__sub">My Dashboard</span>
        </div>

        <nav className="con-sidebar__nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`con-nav-link ${activeTab === item.id ? "con-nav-link--active" : ""}`}
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? "page" : undefined}
            >
              <span className="con-nav-link__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="con-sidebar__footer">
          <div className="con-sidebar__user">

            {/* ── Avatar — clickable for premium popup ── */}
            <div style={{ position: "relative" }}>
              <button
                className="con-sidebar__avatar"
                id="consumer-avatar-btn"
                aria-label="View account info"
                onClick={() => setShowPremiumPopup((v) => !v)}
                style={{ cursor: consumer?.isPremium ? "pointer" : "default", border: "none" }}
              >
                {consumer.full_name?.charAt(0).toUpperCase()}
              </button>

              {/* Premium popup card */}
              {consumer?.isPremium && showPremiumPopup && (() => {
                const expiry   = consumer?.subscriptionExpiry ? new Date(consumer.subscriptionExpiry) : null;
                const now      = new Date();
                const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))) : null;
                return (
                  <div className="con-premium-popup" id="consumer-premium-popup" role="dialog" aria-label="Premium subscription info">
                    <div className="con-premium-popup__crown" aria-hidden="true">✦</div>
                    <p className="con-premium-popup__title">NutriFit Premium</p>
                    <p className="con-premium-popup__status">Active subscription</p>
                    {daysLeft !== null ? (
                      <div className="con-premium-popup__renew">
                        <span className="con-premium-popup__days">{daysLeft}</span>
                        <span className="con-premium-popup__days-label">day{daysLeft !== 1 ? "s" : ""} until renewal</span>
                      </div>
                    ) : (
                      <p className="con-premium-popup__no-expiry">Renewal date not set</p>
                    )}
                    {expiry && (
                      <p className="con-premium-popup__date">
                        Renews {expiry.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <span className="con-sidebar__user-name">{consumer.full_name}</span>
              <span className="con-sidebar__user-role">Consumer</span>
            </div>
          </div>
          <button
            id="consumer-logout-btn"
            className="con-btn-logout"
            onClick={handleLogout}
            aria-label="Log out"
          >
            ⏻ Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="con-main" aria-label="Consumer content">
        <header className="con-topbar">
          <div>
            <h1 className="con-topbar__title">
              {navItems.find((n) => n.id === activeTab)?.icon}{" "}
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
            <p className="con-topbar__date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {consumer?.isPremium && (
              <span className="con-premium-badge" aria-label="Premium member">
                ⭐ Premium
              </span>
            )}
            <div className="con-topbar__badge">🍊 Consumer</div>
          </div>
        </header>

        <div className="con-content">
          {/* Home tab — clean overview: greeting + progress chart only */}
          {activeTab === "home" && (
            <>
              {renderWelcomeCard()}

              {/* Progress chart inline on home */}
              <div className="con-section" id="section-home-progress">
                <div className="con-section__header">
                  <span className="con-section__icon">📈</span>
                  <h2 className="con-section__title">My Progress</h2>
                  <span className="con-section__count">Weight Tracking</span>
                </div>
                <ProgressCharts refreshTrigger={refreshTrigger} />
              </div>
            </>
          )}

          {/* Individual focused tabs */}
          {activeTab === "ai"       && renderAIAdvisor()}
          {activeTab === "diet"     && renderDietPlans()}

          {/* My Workout — prop-driven; receives the active plan from fetchPlans */}
          {activeTab === "my-workout" && (
            <MyWorkout
              workoutPlan={activeWorkout}
              isPremium={consumer?.isPremium ?? false}
              onUpgradeClick={handleUpgradeClick}
              instructorId={consumer?.instructorId ?? null}
              connectedInstructorName={instructorName}
              consumer={consumer}
            />
          )}

          {/*
           * Progress Tracking tab
           * ────────────────────────────────────────────────────────────────────
           * Layout: CSS Grid — on wide screens the form sits on the left
           * (approx 1/3 width) and the chart occupies the remaining 2/3.
           * On narrow screens both panels collapse to a single column.
           */}
          {activeTab === "progress" && (
            <div className="con-progress-layout" id="section-progress">
              {/* Section heading */}
              <div className="con-section__header con-progress-layout__heading">
                <span className="con-section__icon">📈</span>
                <h2 className="con-section__title">My Progress</h2>
                <span className="con-section__count">Weight Tracking</span>
              </div>

              {/* Form panel */}
              <div className="con-progress-layout__form">
                <DailyLogForm onSuccess={handleProgressSaved} />
              </div>

              {/* Chart panel */}
              <div className="con-progress-layout__chart">
                <ProgressCharts refreshTrigger={refreshTrigger} />
              </div>
            </div>
          )}

          {/* Professional Hub — sole premium connection portal */}
          {activeTab === "hub" && (
            <ProfessionalHub
            consumer={consumer}
            isPremium={consumer?.isPremium ?? false}
            onConsumerChange={refreshConsumer}
          />
          )}
        </div>
      </main>
    </div>
  );
};

export default ConsumerDashboard;
