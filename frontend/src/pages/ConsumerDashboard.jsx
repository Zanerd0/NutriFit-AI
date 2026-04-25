/**
 * @file ConsumerDashboard.jsx
 * @description The main Consumer Dashboard page for NutriFit AI.
 *
 * Sections:
 *   1. Welcome & Health Stats — greeting card with editable weight/height/goal
 *   2. My Diet Plans          — cards from GET /api/consumer/diet-plans
 *   3. My Workout Plans       — cards from GET /api/consumer/workout-plans
 *   4. NutriFit AI Advisor    — prominent placeholder for the core FYP AI feature
 *
 * Authentication & Authorization:
 *   Protected by <ConsumerRoute> in App.jsx (role === "Consumer").
 *
 * Data Fetching:
 *   Uses shared Axios instance (withCredentials: true) — the HTTP-only JWT
 *   cookie is automatically sent with every request.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate }                       from "react-router-dom";
import axios                                 from "../api/axios";
import FindProfessionals                     from "./FindProfessionals";
import MyWorkout                             from "../components/MyWorkout";
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

/**
 * WorkoutPlanCard — Displays one workout plan card with exercise breakdown.
 * @param {object} plan - A WorkoutPlan document (with instructorId populated)
 */
const WorkoutPlanCard = ({ plan }) => (
  <div className="con-plan-card con-plan-card--workout" id={`workout-plan-${plan._id}`}>
    <h3 className="con-plan-card__title">{plan.title}</h3>

    {plan.description && (
      <p className="con-plan-card__desc">{plan.description}</p>
    )}

    {/* Assigned by (Instructor) */}
    <div className="con-plan-card__author">
      <div>
        <span className="con-plan-card__author-label con-plan-card__author-label--workout">
          Assigned by Instructor
        </span>
        <span className="con-plan-card__author-name">
          {plan.instructorId?.full_name ?? "Unknown"}
        </span>
      </div>
    </div>

    {/* Exercises list */}
    {plan.exercises?.length > 0 && (
      <div className="con-plan-card__items">
        {plan.exercises.map((ex, i) => (
          <div key={i} className="con-plan-card__item">
            <span className="con-plan-card__item-dot">💪</span>
            <div className="con-plan-card__item-body">
              <span className="con-plan-card__item-title">{ex.exerciseName}</span>
              <span className="con-plan-card__item-sub">
                {ex.sets} sets × {ex.reps} reps
                {ex.duration ? ` · ${ex.duration}s` : ""}
              </span>
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
      <span className="con-plan-card__badge con-plan-card__badge--workout">
        {plan.exercises?.length ?? 0} exercises
      </span>
    </div>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const ConsumerDashboard = () => {
  const navigate = useNavigate();

  // Read the consumer object saved to localStorage on login.
  // We keep a local copy in state so profile edits update the UI immediately.
  const [consumer, setConsumer] = useState(
    () => JSON.parse(localStorage.getItem("user")) ?? {}
  );

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("home");

  // ── Remote data ────────────────────────────────────────────────────────────
  const [dietPlans,    setDietPlans]    = useState([]);
  const [workoutPlans, setWorkoutPlans] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  // ── Profile edit state ─────────────────────────────────────────────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm,    setProfileForm]    = useState({
    weight:       consumer.weight       ?? "",
    height:       consumer.height       ?? "",
    primary_goal: consumer.primary_goal ?? consumer.goal ?? "",
  });
  const [saving,        setSaving]        = useState(false);
  const [profileMsg,    setProfileMsg]    = useState({ type: "", text: "" });

  // ── Data Fetching ──────────────────────────────────────────────────────────

  /**
   * fetchPlans — Loads both plan types concurrently.
   */
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dietRes, workoutRes] = await Promise.all([
        axios.get("/consumer/diet-plans"),
        axios.get("/consumer/workout-plans"),
      ]);
      setDietPlans(dietRes.data);
      setWorkoutPlans(workoutRes.data);
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access denied. You do not have Consumer privileges.");
      } else {
        setError(err.response?.data?.error || "Failed to load your plans.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

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
          <span className="con-health-stat__label">Workout Plans</span>
          <span className="con-health-stat__value">{workoutPlans.length}</span>
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
   * renderDietPlans — Grid of diet plan cards for the consumer.
   */
  const renderDietPlans = () => (
    <div className="con-section" id="section-diet">
      <div className="con-section__header">
        <span className="con-section__icon">🥗</span>
        <h2 className="con-section__title">My Diet Plans</h2>
        <span className="con-section__count">{dietPlans.length} plan{dietPlans.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="con-loading"><div className="con-spinner" /><p>Loading…</p></div>
      ) : error ? (
        <div className="con-error-banner" role="alert">{error}</div>
      ) : dietPlans.length === 0 ? (
        <div className="con-empty">
          <div className="con-empty__icon">🥗</div>
          <p className="con-empty__text">No diet plans assigned yet. Your dietician will create one for you soon.</p>
        </div>
      ) : (
        <div className="con-plans-grid">
          {dietPlans.map((plan) => <DietPlanCard key={plan._id} plan={plan} />)}
        </div>
      )}
    </div>
  );

  /**
   * renderWorkoutPlans — Grid of workout plan cards for the consumer.
   */
  const renderWorkoutPlans = () => (
    <div className="con-section" id="section-workout">
      <div className="con-section__header">
        <span className="con-section__icon">🏋️</span>
        <h2 className="con-section__title">My Workout Plans</h2>
        <span className="con-section__count">{workoutPlans.length} plan{workoutPlans.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="con-loading"><div className="con-spinner" /><p>Loading…</p></div>
      ) : error ? (
        <div className="con-error-banner" role="alert">{error}</div>
      ) : workoutPlans.length === 0 ? (
        <div className="con-empty">
          <div className="con-empty__icon">🏋️</div>
          <p className="con-empty__text">No workout plans assigned yet. Your instructor will create one for you soon.</p>
        </div>
      ) : (
        <div className="con-plans-grid">
          {workoutPlans.map((plan) => <WorkoutPlanCard key={plan._id} plan={plan} />)}
        </div>
      )}
    </div>
  );

  /**
   * renderAIAdvisor — Prominent placeholder for the core FYP AI chat feature.
   * The input and send button are intentionally disabled with clear visual cues.
   */
  const renderAIAdvisor = () => (
    <div className="con-ai-card" id="section-ai">
      <div className="con-ai-card__header">
        <div className="con-ai-card__icon-wrap">🤖</div>
        <div>
          <h2 className="con-ai-card__title">NutriFit AI Advisor</h2>
          <p className="con-ai-card__subtitle">Powered by Generative AI · FYP Core Feature</p>
        </div>
      </div>

      <div className="con-ai-card__coming-soon">
        <span style={{ fontSize: "1.5rem" }}>🚀</span>
        <div className="con-ai-card__coming-soon-text">
          <strong>AI Integration Coming Soon</strong>
          Get personalised nutrition advice, meal suggestions, and workout
          tips from your AI-powered health advisor. This feature is under
          active development as part of the NutriFit AI Final Year Project.
        </div>
      </div>

      {/* Disabled chat area — visual placeholder only */}
      <div className="con-ai-chat-area">
        <input
          className="con-ai-chat-input"
          type="text"
          placeholder="Ask NutriFit AI anything… (coming soon)"
          disabled
          aria-disabled="true"
          id="ai-chat-input"
        />
        <button
          className="con-ai-chat-btn"
          disabled
          aria-disabled="true"
          id="ai-chat-send-btn"
        >
          ✦ Ask
        </button>
      </div>
    </div>
  );

  // ── Sidebar nav config ────────────────────────────────────────────────────
  const navItems = [
    { id: "home",       label: "Home",              icon: "🏠" },
    { id: "diet",       label: "Diet Plans",        icon: "🥗" },
    { id: "workout",    label: "Workout Plans",     icon: "🏋️" },
    { id: "my-workout", label: "My Workout",        icon: "💪" },
    { id: "find",       label: "Find Professionals", icon: "🔗" },
    { id: "ai",         label: "AI Advisor",        icon: "🤖" },
  ];

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="con-layout">

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
            <div className="con-sidebar__avatar">
              {consumer.full_name?.charAt(0).toUpperCase()}
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
          <div className="con-topbar__badge">🍊 Consumer</div>
        </header>

        <div className="con-content">
          {/* Home tab shows everything stacked */}
          {activeTab === "home" && (
            <>
              {renderWelcomeCard()}
              {renderDietPlans()}
              {renderWorkoutPlans()}
              {renderAIAdvisor()}
            </>
          )}

          {/* Individual tabs for focused views — NO welcome card here */}
          {activeTab === "diet"    && renderDietPlans()}
          {activeTab === "workout" && renderWorkoutPlans()}
          {activeTab === "ai"      && renderAIAdvisor()}

          {/* My Workout — dedicated view of the instructor-assigned routine */}
          {activeTab === "my-workout" && <MyWorkout />}

          {/* Find Professionals tab — browse and connect with Dieticians/Instructors */}
          {activeTab === "find" && (
            <FindProfessionals
              consumer={consumer}
              onConsumerUpdate={(updatedUser) => {
                // Sync the parent's consumer state and localStorage so that
                // the dashboard reflects the new dieticianId/instructorId
                // immediately without a page reload.
                setConsumer(updatedUser);
                localStorage.setItem("user", JSON.stringify(updatedUser));
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default ConsumerDashboard;
