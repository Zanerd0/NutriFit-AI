/**
 * @file pages/ProfessionalHub.jsx
 * @description Premium portal for NutriFit AI consumers.
 *
 * Vertically stacked single-column layout offering two professional paths:
 *
 *   Path A — Dietary Review
 *     POST /api/professionals/request-dietician
 *
 *   Path B — Custom Workout Plan
 *     POST /api/professionals/request-instructor
 *
 * Connection Status:
 *   On mount the component fetches GET /api/professionals/status to determine
 *   whether the consumer is already connected to a professional. The UI adapts:
 *     'none'      → standard Request / Submit buttons
 *     'pending'   → button disabled + "Request Pending…" badge
 *     'connected' → button hidden; green "Connected to [Name]" banner shown
 *
 * Props:
 *   consumer  {object}  — Consumer document from ConsumerDashboard state.
 *                         Must contain at least `_id`.
 *
 * BEM class prefix: ph-
 */

import { useState, useEffect } from "react";
import "./ProfessionalHub.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = "/api";

// ─── Shared Sub-Components ───────────────────────────────────────────────────

/** StatusMessage — success / error feedback banner. */
const StatusMessage = ({ status }) => {
  if (!status.text) return null;
  return (
    <div
      className={`ph-status ph-status--${status.type}`}
      role={status.type === "error" ? "alert" : "status"}
    >
      <span className="ph-status__icon">{status.type === "success" ? "✔" : "✕"}</span>
      {status.text}
    </div>
  );
};

/** FeatureBullet — a single feature highlight. */
const FeatureBullet = ({ icon, text }) => (
  <li className="ph-feature-item">
    <span className="ph-feature-item__icon" aria-hidden="true">{icon}</span>
    <span>{text}</span>
  </li>
);

/**
 * ConnectedBanner — shown when the consumer is already connected to a professional.
 * Replaces the CTA button entirely.
 */
const ConnectedBanner = ({ name }) => (
  <div className="ph-connected-banner" role="status">
    <span className="ph-connected-banner__dot" aria-hidden="true" />
    <p className="ph-connected-banner__text">
      Currently connected to{" "}
      <span className="ph-connected-banner__name">{name}</span>
    </p>
  </div>
);

/**
 * PendingBadge — shown next to a disabled button when a request is in-flight.
 */
const PendingBadge = () => (
  <div className="ph-pending-badge">
    <span className="ph-pending-badge__dot" aria-hidden="true" />
    Request Pending…
  </div>
);

/**
 * StatusLoadingRow — placeholder while the status fetch resolves.
 */
const StatusLoadingRow = () => (
  <div className="ph-status-loading">
    <span className="ph-status-loading__dot" aria-hidden="true" />
    Checking connection status…
  </div>
);

// ─── Path A — Dietary Review ─────────────────────────────────────────────────

const DietaryReviewPanel = ({ consumer, dietStatus, connectedName }) => {
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status,     setStatus]     = useState({ type: "", text: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!consumer?._id) {
      setStatus({ type: "error", text: "Your session is still loading. Please wait and try again." });
      return;
    }

    setSubmitting(true);
    setStatus({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE}/professionals/request-dietician`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId: consumer._id,
          dietPlanId: consumer.activeDietPlanId ?? null,
          notes:      notes.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || `Server error (${response.status})`);
      }

      setStatus({ type: "success", text: data.message });
      setNotes("");
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Failed to submit. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ph-panel ph-panel--diet" id="ph-panel-diet">
      {/* Panel header */}
      <div className="ph-panel__header">
        <div className="ph-panel__icon-wrap ph-panel__icon-wrap--diet">
          <span className="ph-panel__icon" aria-hidden="true">🥗</span>
        </div>
        <div>
          <h2 className="ph-panel__title">Dietary Review</h2>
          <p className="ph-panel__subtitle">By a Licensed Dietician</p>
        </div>
        <span className="ph-panel__badge ph-panel__badge--diet">Premium ✦</span>
      </div>

      {/* Description */}
      <p className="ph-panel__desc">
        Get personalised feedback on your AI-generated 7-day diet plan from a
        certified human dietician. They'll review your macros, flag any concerns,
        and refine the plan to better match your goals and medical history.
      </p>

      {/* Feature bullets */}
      <ul className="ph-feature-list" aria-label="What's included">
        <FeatureBullet icon="🔬" text="Macro & micro-nutrient analysis" />
        <FeatureBullet icon="💊" text="Allergy & medical condition cross-check" />
        <FeatureBullet icon="✏️" text="Personalised plan refinement notes" />
        <FeatureBullet icon="📞" text="Optional follow-up consultation" />
      </ul>

      {/* ── Connection-state-aware CTA ─────────────────────────────────────── */}

      {/* Status still loading */}
      {dietStatus === "loading" && <StatusLoadingRow />}

      {/* Already connected — hide form, show banner */}
      {dietStatus === "connected" && <ConnectedBanner name={connectedName} />}

      {/* Request pending — show disabled button + badge */}
      {dietStatus === "pending" && (
        <div>
          <PendingBadge />
          <button
            type="button"
            id="ph-submit-diet-btn"
            className="ph-btn ph-btn--diet"
            disabled
            style={{ marginTop: "0.75rem" }}
          >
            Submit AI Diet Plan for Professional Review
          </button>
        </div>
      )}

      {/* Default — show live form */}
      {(dietStatus === "none" || !dietStatus) && (
        <form
          className="ph-form"
          id="ph-form-diet"
          onSubmit={handleSubmit}
          aria-label="Submit diet plan for review"
        >
          <label className="ph-label" htmlFor="ph-diet-notes">
            Additional Notes{" "}
            <span className="ph-label__hint">(optional — share specific concerns)</span>
          </label>
          <textarea
            id="ph-diet-notes"
            className="ph-textarea"
            placeholder="e.g. I have a nut allergy, I struggle with the Tuesday dinner portion sizes…"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={600}
            disabled={submitting}
          />
          <span className="ph-char-count">{notes.length}/600</span>

          <StatusMessage status={status} />

          <button
            type="submit"
            id="ph-submit-diet-btn"
            className="ph-btn ph-btn--diet"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="ph-btn__spinner" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              <>
                <span aria-hidden="true">📤</span>
                Submit AI Diet Plan for Professional Review
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};

// ─── Path B — Fitness Plan ───────────────────────────────────────────────────

const FitnessPlanPanel = ({ consumer, instructorStatus, connectedName }) => {
  const [goal,       setGoal]       = useState("");
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status,     setStatus]     = useState({ type: "", text: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!consumer?._id) {
      setStatus({ type: "error", text: "Your session is still loading. Please wait and try again." });
      return;
    }

    setSubmitting(true);
    setStatus({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE}/professionals/request-instructor`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId:  consumer._id,
          fitnessGoal: goal.trim(),
          notes:       notes.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || `Server error (${response.status})`);
      }

      // data.message contains the instructor's name from the backend
      setStatus({ type: "success", text: data.message });
      setGoal("");
      setNotes("");
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Failed to send request. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ph-panel ph-panel--workout" id="ph-panel-workout">
      {/* Panel header */}
      <div className="ph-panel__header">
        <div className="ph-panel__icon-wrap ph-panel__icon-wrap--workout">
          <span className="ph-panel__icon" aria-hidden="true">🏋️</span>
        </div>
        <div>
          <h2 className="ph-panel__title">Custom Workout Plan</h2>
          <p className="ph-panel__subtitle">By a Certified Instructor</p>
        </div>
        <span className="ph-panel__badge ph-panel__badge--workout">Premium ✦</span>
      </div>

      {/* Human-built callout */}
      <div className="ph-callout ph-callout--human" role="note">
        <span className="ph-callout__icon" aria-hidden="true">👤</span>
        <div>
          <strong>100% Human-Designed</strong>
          <p>
            Unlike diet plans, every workout routine on NutriFit AI is built
            manually by a verified, certified fitness instructor — no AI generation.
            Your instructor will design a programme tailored precisely to your goals,
            equipment, and fitness level.
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="ph-panel__desc">
        Don't have a workout plan yet, or want a completely new programme?
        Submit a request and your linked instructor will create a custom routine
        for you and assign it directly to your dashboard.
      </p>

      {/* Feature bullets */}
      <ul className="ph-feature-list" aria-label="What's included">
        <FeatureBullet icon="🎯" text="Goal-specific programme design (bulk / cut / endurance)" />
        <FeatureBullet icon="🏠" text="Home or gym equipment options" />
        <FeatureBullet icon="📊" text="Progressive overload scheduling" />
        <FeatureBullet icon="💬" text="Direct feedback loop with your instructor" />
      </ul>

      {/* ── Connection-state-aware CTA ─────────────────────────────────────── */}

      {/* Status still loading */}
      {instructorStatus === "loading" && <StatusLoadingRow />}

      {/* Already connected — hide form, show banner */}
      {instructorStatus === "connected" && <ConnectedBanner name={connectedName} />}

      {/* Request pending — show disabled button + badge */}
      {instructorStatus === "pending" && (
        <div>
          <PendingBadge />
          <button
            type="button"
            id="ph-submit-workout-btn"
            className="ph-btn ph-btn--workout"
            disabled
            style={{ marginTop: "0.75rem" }}
          >
            Request Custom Workout Plan
          </button>
        </div>
      )}

      {/* Default — show live form */}
      {(instructorStatus === "none" || !instructorStatus) && (
        <form
          className="ph-form"
          id="ph-form-workout"
          onSubmit={handleSubmit}
          aria-label="Request custom workout plan"
        >
          <label className="ph-label" htmlFor="ph-workout-goal">
            Primary Fitness Goal
            <span className="ph-label__required" aria-hidden="true"> *</span>
          </label>
          <select
            id="ph-workout-goal"
            className="ph-select"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            required
            disabled={submitting}
          >
            <option value="">— Select your goal —</option>
            <option value="Lose Weight">Lose Weight</option>
            <option value="Gain Muscle">Gain Muscle (Bulk)</option>
            <option value="Improve Endurance">Improve Endurance</option>
            <option value="Improve Flexibility">Improve Flexibility</option>
            <option value="General Fitness">General Fitness</option>
            <option value="Athletic Performance">Athletic Performance</option>
            <option value="Rehabilitation">Rehabilitation / Injury Recovery</option>
          </select>

          <label className="ph-label" htmlFor="ph-workout-notes">
            Additional Details{" "}
            <span className="ph-label__hint">(equipment, injuries, experience level…)</span>
          </label>
          <textarea
            id="ph-workout-notes"
            className="ph-textarea"
            placeholder="e.g. I train at home with dumbbells and a pull-up bar, intermediate level, previous lower back injury…"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={600}
            disabled={submitting}
          />
          <span className="ph-char-count">{notes.length}/600</span>

          <StatusMessage status={status} />

          <button
            type="submit"
            id="ph-submit-workout-btn"
            className="ph-btn ph-btn--workout"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="ph-btn__spinner ph-btn__spinner--workout" aria-hidden="true" />
                Sending Request…
              </>
            ) : (
              <>
                <span aria-hidden="true">💪</span>
                Request Custom Workout Plan
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};

// ─── Main Page Component ─────────────────────────────────────────────────────

/**
 * ProfessionalHub — Premium portal landing page.
 *
 * @param {object} props
 * @param {object} props.consumer - Consumer document (from ConsumerDashboard state).
 */
const ProfessionalHub = ({ consumer }) => {
  /**
   * Connection status state.
   *   'loading'   — waiting for GET /api/professionals/status to resolve
   *   'none'      — no connection or request
   *   'pending'   — request sent, not yet confirmed
   *   'connected' — actively connected to a professional
   */
  const [dietStatus,       setDietStatus]       = useState("loading");
  const [instructorStatus, setInstructorStatus] = useState("loading");

  /** Names of connected professionals for the "Connected to [Name]" banner. */
  const [dietConnectedName,       setDietConnectedName]       = useState("");
  const [instructorConnectedName, setInstructorConnectedName] = useState("");

  // ── Fetch connection status on mount ────────────────────────────────────
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/professionals/status`, {
          method:      "GET",
          credentials: "include",
        });

        if (!response.ok) {
          // Non-2xx (e.g. endpoint not yet built) → fall back to "none" gracefully
          setDietStatus("none");
          setInstructorStatus("none");
          return;
        }

        const data = await response.json().catch(() => ({}));

        // Expected shape:
        //   { dietician: { status, name }, instructor: { status, name } }
        const d = data?.dietician  || {};
        const i = data?.instructor || {};

        setDietStatus(d.status || "none");
        setDietConnectedName(d.name || "");

        setInstructorStatus(i.status || "none");
        setInstructorConnectedName(i.name || "");
      } catch {
        // Network error or endpoint doesn't exist yet — fail silently
        setDietStatus("none");
        setInstructorStatus("none");
      }
    };

    fetchStatus();
  }, [consumer?._id]);

  return (
    <div className="ph-page" id="professional-hub-page">

      {/* ── Page intro banner ── */}
      <div className="ph-intro">
        <div className="ph-intro__text">
          <h1 className="ph-intro__title">
            <span className="ph-intro__crown" aria-hidden="true">✦</span>{" "}
            Professional Hub
          </h1>
          <p className="ph-intro__sub">
            Elevate your health journey with certified human expertise.
            Choose your path below to connect with a professional.
          </p>
        </div>
        <span className="ph-intro__badge">Premium Tier</span>
      </div>

      {/* ── Single-column stacked panels ── */}
      <div className="ph-split" role="main">
        <DietaryReviewPanel
          consumer={consumer}
          dietStatus={dietStatus}
          connectedName={dietConnectedName}
        />

        <FitnessPlanPanel
          consumer={consumer}
          instructorStatus={instructorStatus}
          connectedName={instructorConnectedName}
        />
      </div>

      {/* ── Info strip ── */}
      <p className="ph-footnote">
        ⚕ Professional reviews are conducted by verified NutriFit AI partners.
        Response times are typically within 24–48 hours. Premium subscription required.
      </p>

    </div>
  );
};

export default ProfessionalHub;
