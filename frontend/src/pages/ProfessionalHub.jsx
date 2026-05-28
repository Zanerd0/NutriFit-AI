/**
 * @file pages/ProfessionalHub.jsx
 * @description Premium portal for NutriFit AI consumers.
 *
 * Premium users can CONNECT to a Dietician or Gym Instructor using their
 * unique professional code. Once connected, the consumer can send / request
 * diet plans directly from the AI-Generated tab.
 *
 *   Path A — Dietary Review (Dietician)
 *     POST /api/professionals/connect-by-code  { code, type: "Dietician" }
 *
 *   Path B — Fitness Plan (Instructor)
 *     POST /api/professionals/connect-by-code  { code, type: "Instructor" }
 *
 * Connection Status:
 *   On mount the component fetches GET /api/professionals/status to determine
 *   whether the consumer is already connected to a professional. The UI adapts:
 *     'loading'   → skeleton row
 *     'none'      → code-entry form
 *     'connected' → green "Connected to [Name]" banner + disconnect button
 *
 * Props:
 *   consumer  {object}  — Consumer document from ConsumerDashboard state.
 *   isPremium {boolean} — Whether the consumer holds an active premium subscription.
 *
 * BEM class prefix: ph-
 */

import { useState, useEffect } from "react";
import "./ProfessionalHub.css";

// ─── Constants ────────────────────────────────────────────────────────────────

// All requests go through the Vite dev-server proxy → backend:5000
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
 */
const ConnectedBanner = ({ name, onDisconnect, disconnecting }) => (
  <div className="ph-connected-banner" role="status">
    <span className="ph-connected-banner__dot" aria-hidden="true" />
    <div className="ph-connected-banner__body">
      <p className="ph-connected-banner__text">
        Connected to{" "}
        <span className="ph-connected-banner__name">{name}</span>
      </p>
      <button
        type="button"
        className="ph-disconnect-btn"
        onClick={onDisconnect}
        disabled={disconnecting}
        aria-label={`Disconnect from ${name}`}
      >
        {disconnecting ? "Disconnecting…" : "✕ Disconnect"}
      </button>
    </div>
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

// ─── Dual Connect Options ─────────────────────────────────────────────────────

/**
 * ConnectOptions — shows BOTH connection paths:
 *   Left  — Enter a known professional's unique code
 *   Right — Get matched with a random verified professional
 *
 * Props:
 *   type        {string}   — "Dietician" | "Instructor"
 *   consumer    {object}   — Consumer document
 *   onConnected {function} — called with { name } on any successful connection
 */
const ConnectOptions = ({ type, consumer, onConnected }) => {
  const colorMod       = type === "Dietician" ? "diet" : "workout";
  const randomEndpoint = type === "Dietician"
    ? `${API_BASE}/professionals/request-dietician`
    : `${API_BASE}/professionals/request-instructor`;

  // ── Code-entry state
  const [code,        setCode]        = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeStatus,  setCodeStatus]  = useState({ type: "", text: "" });

  // ── Random-match state
  const [randLoading, setRandLoading] = useState(false);
  const [randStatus,  setRandStatus]  = useState({ type: "", text: "" });

  const isWorking = codeLoading || randLoading;

  const handleCodeConnect = async (e) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setCodeStatus({ type: "error", text: "Please enter a professional code." });
      return;
    }
    setCodeLoading(true);
    setCodeStatus({ type: "", text: "" });
    try {
      const res = await fetch(`${API_BASE}/professionals/connect-by-code`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmedCode, type, consumerId: consumer?._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `Error (${res.status})`);
      setCodeStatus({ type: "success", text: data.message });
      setCode("");
      onConnected({ name: data.professional?.full_name || "Professional" });
    } catch (err) {
      setCodeStatus({ type: "error", text: err.message || "Failed to connect." });
    } finally {
      setCodeLoading(false);
    }
  };

  const handleRandomConnect = async () => {
    setRandLoading(true);
    setRandStatus({ type: "", text: "" });
    try {
      const res = await fetch(randomEndpoint, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerId: consumer?._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `Error (${res.status})`);
      setRandStatus({ type: "success", text: data.message });
      const name = data.dietician?.full_name || data.instructor?.full_name || "Professional";
      onConnected({ name });
    } catch (err) {
      setRandStatus({ type: "error", text: err.message || "Failed to find a match. Please try again." });
    } finally {
      setRandLoading(false);
    }
  };

  const inputId = `ph-code-${type.toLowerCase()}`;

  return (
    <div className="ph-connect-options">

      {/* ── Card A: Connect by Code ── */}
      <div className="ph-connect-card ph-connect-card--code">
        <div className="ph-connect-card__header">
          <span className="ph-connect-card__icon" aria-hidden="true">🔗</span>
          <div>
            <p className="ph-connect-card__title">Connect with a Code</p>
            <p className="ph-connect-card__sub">Use your {type.toLowerCase()}&apos;s unique code</p>
          </div>
        </div>

        <form onSubmit={handleCodeConnect} id={`ph-form-connect-${type.toLowerCase()}`}>
          <label className="ph-label" htmlFor={inputId}>
            Professional Code
          </label>
          <div className="ph-connect-form__row">
            <input
              id={inputId}
              type="text"
              className="ph-code-input"
              placeholder="e.g. 6837f2a1c4b9e84d2f0a1b2c"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={100}
              autoComplete="off"
              spellCheck="false"
              disabled={isWorking}
            />
            <button
              type="submit"
              id={`ph-connect-btn-${type.toLowerCase()}`}
              className={`ph-btn ph-btn--${colorMod} ph-btn--connect`}
              disabled={isWorking || !code.trim()}
            >
              {codeLoading ? (
                <>
                  <span className="ph-btn__spinner" aria-hidden="true" />
                  Connecting…
                </>
              ) : (
                <>
                  <span aria-hidden="true">🔗</span>
                  Connect
                </>
              )}
            </button>
          </div>
          <p className="ph-code-hint">
            💡 Ask your {type.toLowerCase()} to share their code from their dashboard.
          </p>
          {codeStatus.text && <StatusMessage status={codeStatus} />}
        </form>
      </div>

      {/* ── "or" Divider ── */}
      <div className="ph-connect-divider" aria-hidden="true">
        <span className="ph-connect-divider__line" />
        <span className="ph-connect-divider__label">or</span>
        <span className="ph-connect-divider__line" />
      </div>

      {/* ── Card B: Random Match ── */}
      <div className="ph-connect-card ph-connect-card--random">
        <div className="ph-connect-card__header">
          <span className="ph-connect-card__icon" aria-hidden="true">🎲</span>
          <div>
            <p className="ph-connect-card__title">Match me Randomly</p>
            <p className="ph-connect-card__sub">We&apos;ll find a verified {type.toLowerCase()} for you</p>
          </div>
        </div>
        <p className="ph-connect-card__desc">
          Don&apos;t have a specific {type.toLowerCase()} in mind? Let NutriFit AI instantly
          connect you with a verified professional from our network.
        </p>
        <button
          type="button"
          id={`ph-random-btn-${type.toLowerCase()}`}
          className={`ph-btn ph-btn--${colorMod}`}
          onClick={handleRandomConnect}
          disabled={isWorking}
        >
          {randLoading ? (
            <>
              <span className="ph-btn__spinner" aria-hidden="true" />
              Finding a match…
            </>
          ) : (
            <>
              <span aria-hidden="true">🎲</span>
              Find me a {type}
            </>
          )}
        </button>
        {randStatus.text && <StatusMessage status={randStatus} />}
      </div>

    </div>
  );
};

// ─── Path A — Dietary Review ─────────────────────────────────────────────────

const DietaryReviewPanel = ({
  consumer,
  dietStatus,
  connectedName,
  onDisconnected,
  onConsumerChange,
}) => {
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectErr, setDisconnectErr] = useState("");
  const [localStatus, setLocalStatus]     = useState(dietStatus);
  const [localName,   setLocalName]       = useState(connectedName);

  // Sync props → local state when parent re-fetches
  useEffect(() => { setLocalStatus(dietStatus); }, [dietStatus]);
  useEffect(() => { setLocalName(connectedName); }, [connectedName]);

  const handleConnected = ({ name }) => {
    setLocalStatus("connected");
    setLocalName(name);
    onDisconnected?.();   // trigger parent re-fetch
    onConsumerChange?.(); // re-sync parent consumer object
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectErr("");
    try {
      const res = await fetch(`${API_BASE}/consumer/disconnect-professional`, {
        method:      "PUT",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalRole: "Dietician" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to disconnect.");
      setLocalStatus("none");
      setLocalName("");
      onDisconnected?.();   // trigger parent re-fetch
      onConsumerChange?.(); // re-sync parent consumer object
    } catch (err) {
      setDisconnectErr(err.message);
    } finally {
      setDisconnecting(false);
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
        Connect with a certified human dietician using their code or get matched
        randomly. Once connected, you can send your AI-generated diet plan for
        personalised review, and request custom diet plans directly from them.
      </p>

      {/* Feature bullets */}
      <ul className="ph-feature-list" aria-label="What's included">
        <FeatureBullet icon="🔬" text="Macro & micro-nutrient analysis" />
        <FeatureBullet icon="💊" text="Allergy & medical condition cross-check" />
        <FeatureBullet icon="✏️" text="Personalised plan refinement notes" />
        <FeatureBullet icon="📤" text="Send your AI plan for review (from Diet Plans tab)" />
      </ul>

      {/* ── Connection-state-aware CTA ─────────────────────────────────────── */}

      {/* Status still loading */}
      {localStatus === "loading" && <StatusLoadingRow />}

      {/* Already connected — show banner + disconnect */}
      {localStatus === "connected" && (
        <>
          <ConnectedBanner
            name={localName}
            onDisconnect={handleDisconnect}
            disconnecting={disconnecting}
          />
          {disconnectErr && (
            <p className="ph-status ph-status--error" role="alert">
              <span className="ph-status__icon">✕</span>
              {disconnectErr}
            </p>
          )}
        </>
      )}

      {/* Default — show both connect options */}
      {(localStatus === "none" || !localStatus) && (
        <ConnectOptions
          type="Dietician"
          consumer={consumer}
          onConnected={handleConnected}
        />
      )}
    </div>
  );
};

// ─── Path B — Fitness Plan ───────────────────────────────────────────────────

const FitnessPlanPanel = ({
  consumer,
  instructorStatus,
  connectedName,
  onDisconnected,
  onConsumerChange,
}) => {
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectErr, setDisconnectErr] = useState("");
  const [localStatus, setLocalStatus]     = useState(instructorStatus);
  const [localName,   setLocalName]       = useState(connectedName);

  useEffect(() => { setLocalStatus(instructorStatus); }, [instructorStatus]);
  useEffect(() => { setLocalName(connectedName); }, [connectedName]);

  const handleConnected = ({ name }) => {
    setLocalStatus("connected");
    setLocalName(name);
    onDisconnected?.();
    onConsumerChange?.();
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectErr("");
    try {
      const res = await fetch(`${API_BASE}/consumer/disconnect-professional`, {
        method:      "PUT",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalRole: "Instructor" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to disconnect.");
      setLocalStatus("none");
      setLocalName("");
      onDisconnected?.();
      onConsumerChange?.();
    } catch (err) {
      setDisconnectErr(err.message);
    } finally {
      setDisconnecting(false);
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
        Connect with a certified gym instructor using their code or get matched
        randomly. Once connected, they'll be able to create custom workout routines
        assigned directly to your dashboard.
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
      {localStatus === "loading" && <StatusLoadingRow />}

      {/* Already connected — show banner + disconnect */}
      {localStatus === "connected" && (
        <>
          <ConnectedBanner
            name={localName}
            onDisconnect={handleDisconnect}
            disconnecting={disconnecting}
          />
          {disconnectErr && (
            <p className="ph-status ph-status--error" role="alert">
              <span className="ph-status__icon">✕</span>
              {disconnectErr}
            </p>
          )}
        </>
      )}

      {/* Default — show both connect options */}
      {(localStatus === "none" || !localStatus) && (
        <ConnectOptions
          type="Instructor"
          consumer={consumer}
          onConnected={handleConnected}
        />
      )}
    </div>
  );
};

// ─── Main Page Component ─────────────────────────────────────────────────────

/**
 * ProfessionalHub — Premium portal landing page.
 *
 * @param {object}  props
 * @param {object}  props.consumer  - Consumer document (from ConsumerDashboard state).
 * @param {boolean} props.isPremium - Whether the consumer holds an active premium subscription.
 */
const ProfessionalHub = ({ consumer, isPremium, onConsumerChange }) => {
  const [upgradingStripe, setUpgradingStripe] = useState(false);
  const [upgradeError,    setUpgradeError]    = useState("");

  /**
   * handleUpgrade — POSTs to the backend to create a Stripe Checkout Session.
   */
  const handleUpgrade = async () => {
    if (!consumer?._id) {
      setUpgradeError("Your session is still loading. Please try again in a moment.");
      return;
    }
    setUpgradingStripe(true);
    setUpgradeError("");
    try {
      const response = await fetch(`${API_BASE}/stripe/create-checkout-session`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ consumerId: consumer._id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Server error (${response.status})`);
      }
      window.location.href = data.url;
    } catch (err) {
      setUpgradeError(err.message || "Failed to start checkout. Please try again.");
      setUpgradingStripe(false);
    }
  };

  /**
   * Connection status state.
   *   'loading'   — waiting for GET /api/professionals/status to resolve
   *   'none'      — no connection
   *   'connected' — actively connected to a professional
   */
  const [dietStatus,       setDietStatus]       = useState("loading");
  const [instructorStatus, setInstructorStatus] = useState("loading");

  /** Names of connected professionals. */
  const [dietConnectedName,       setDietConnectedName]       = useState("");
  const [instructorConnectedName, setInstructorConnectedName] = useState("");

  // ── Fetch connection status on mount ────────────────────────────────────
  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/professionals/status`, {
        method:      "GET",
        credentials: "include",
      });

      if (!response.ok) {
        setDietStatus("none");
        setInstructorStatus("none");
        return;
      }

      const data = await response.json().catch(() => ({}));

      const d = data?.dietician  || {};
      const i = data?.instructor || {};

      setDietStatus(d.status || "none");
      setDietConnectedName(d.name || "");

      setInstructorStatus(i.status || "none");
      setInstructorConnectedName(i.name || "");
    } catch {
      setDietStatus("none");
      setInstructorStatus("none");
    }
  };

  useEffect(() => {
    fetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
            {isPremium
              ? " Connect with a professional using their code, or get matched randomly."
              : " Upgrade to Premium to unlock professional connections."}
          </p>
        </div>
        <span className="ph-intro__badge">Premium Tier</span>
      </div>

      {/* ── PAYWALL — shown to free-tier users ── */}
      {!isPremium && (
        <div className="ph-paywall" id="ph-paywall-gate">
          <div className="ph-paywall__icon-wrap" aria-hidden="true">🔒</div>

          <h2 className="ph-paywall__title">Professional Hub is a Premium Feature</h2>
          <p className="ph-paywall__desc">
            Upgrade to <strong>NutriFit Premium</strong> to connect with a licensed
            dietician for personalised nutrition reviews, or connect with a certified
            fitness instructor for custom workout programmes.
          </p>

          {/* What's included */}
          <ul className="ph-paywall__features" aria-label="Premium features included">
            <li><span aria-hidden="true">🥗</span> Connect with a Licensed Dietician</li>
            <li><span aria-hidden="true">🏋️</span> Connect with a Certified Instructor</li>
            <li><span aria-hidden="true">📤</span> Send AI diet plans directly to your dietician</li>
            <li><span aria-hidden="true">⚡</span> Priority response within 24–48 hours</li>
          </ul>

          {upgradeError && (
            <p className="ph-status ph-status--error" role="alert">
              <span className="ph-status__icon">✕</span>
              {upgradeError}
            </p>
          )}

          <button
            id="ph-upgrade-btn"
            className="ph-btn ph-btn--upgrade"
            onClick={handleUpgrade}
            disabled={upgradingStripe}
            aria-label="Upgrade to NutriFit Premium"
          >
            {upgradingStripe ? (
              <>
                <span className="ph-btn__spinner" aria-hidden="true" />
                Redirecting to Checkout…
              </>
            ) : (
              <>
                <span aria-hidden="true">✦</span>
                Upgrade to Premium — $9.99
              </>
            )}
          </button>

          <p className="ph-paywall__hint">
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>
      )}

      {/* ── Single-column stacked panels — only for Premium users ── */}
      {isPremium && (
        <div className="ph-split" role="main">
          <DietaryReviewPanel
            consumer={consumer}
            dietStatus={dietStatus}
            connectedName={dietConnectedName}
            onDisconnected={fetchStatus}
            onConsumerChange={onConsumerChange}
          />

          <FitnessPlanPanel
            consumer={consumer}
            instructorStatus={instructorStatus}
            connectedName={instructorConnectedName}
            onDisconnected={fetchStatus}
            onConsumerChange={onConsumerChange}
          />
        </div>
      )}

      {/* ── Info strip ── */}
      <p className="ph-footnote">
        ⚕ Professional connections are made with verified NutriFit AI partners.
        Response times are typically within 24–48 hours. Premium subscription required.
      </p>

    </div>
  );
};

export default ProfessionalHub;
