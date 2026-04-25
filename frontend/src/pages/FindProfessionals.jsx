/**
 * @file FindProfessionals.jsx
 * @description "My Health Team" Hub — the Consumer's professional linking centre.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  ❤️  My Health Team                                  │
 *   │  ┌────────────────┐  ┌────────────────┐            │
 *   │  │  Your Dietician │  │ Your Instructor │            │
 *   │  └────────────────┘  └────────────────┘            │
 *   ├─────────────────── Discover ────────────────────────┤
 *   │  [Browse Dieticians] [Browse Instructors]  [Search] │
 *   │                                                     │
 *   │  Card  Card  Card  Card  Card …                     │
 *   └─────────────────────────────────────────────────────┘
 *
 * State Persistence:
 *   After every connect / disconnect action, `refreshConsumer()` calls
 *   GET /api/consumer/me and propagates the fresh document to the parent via
 *   `onConsumerUpdate`. This ensures the UI always reflects database truth,
 *   surviving page refreshes.
 *
 * Button Logic (three states per card):
 *   ① professional._id === linked[Role]Id  →  "✓ Currently Connected"  (disabled, green)
 *   ② linked[Role]Id exists but is different → "⇄ Switch to this [Role]"  (purple)
 *   ③ no one linked yet                   →  "⚡ Connect"              (orange)
 *
 * Props:
 *   consumer        {object}  — Logged-in consumer object (from localStorage / parent state).
 *   onConsumerUpdate {fn}     — Callback(updatedUser) syncs parent state + localStorage.
 *
 * API calls used:
 *   GET  /api/professionals                    — list all Dieticians + Instructors
 *   GET  /api/consumer/me                      — re-fetch fresh consumer document
 *   PUT  /api/consumer/link-professional       — connect or switch
 *   PUT  /api/consumer/disconnect-professional — nullify a link
 */

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "../api/axios";
import "./FindProfessionals.css";

// =============================================================================
// TOAST — lightweight notification system
// =============================================================================

/**
 * ToastContainer
 * Renders a stack of transient messages (success / error).
 * Each toast auto-dismisses in 4 s and can also be clicked to dismiss early.
 */
const ToastContainer = ({ toasts, onRemove }) => (
  <div className="fp-toast-container" role="status" aria-live="polite">
    {toasts.map((t) => (
      <div
        key={t.id}
        className={`fp-toast fp-toast--${t.type}`}
        onClick={() => onRemove(t.id)}
        title="Click to dismiss"
      >
        <span className="fp-toast__icon">{t.type === "success" ? "✅" : "❌"}</span>
        <span className="fp-toast__msg">{t.message}</span>
      </div>
    ))}
  </div>
);

// =============================================================================
// SKELETON — animated placeholder cards
// =============================================================================

const SkeletonCard = () => (
  <div className="fp-skeleton-card">
    <div className="fp-skeleton-header">
      <div className="fp-skeleton-row fp-skeleton-row--avatar" />
      <div className="fp-skeleton-lines">
        <div className="fp-skeleton-row fp-skeleton-row--wide" />
        <div className="fp-skeleton-row fp-skeleton-row--mid" />
      </div>
    </div>
    <div className="fp-skeleton-row fp-skeleton-row--full" />
    <div className="fp-skeleton-row fp-skeleton-row--full" />
  </div>
);

const SlotSkeleton = () => (
  <div className="fp-slot-skeleton">
    <div className="fp-skeleton-row fp-skeleton-row--mid" />
    <div className="fp-skeleton-header">
      <div className="fp-skeleton-row fp-skeleton-row--avatar" />
      <div className="fp-skeleton-lines">
        <div className="fp-skeleton-row fp-skeleton-row--wide" />
        <div className="fp-skeleton-row fp-skeleton-row--mid" />
      </div>
    </div>
    <div className="fp-skeleton-row fp-skeleton-row--full" />
  </div>
);

// =============================================================================
// MY TEAM SLOT — one per professional role
// =============================================================================

/**
 * TeamSlot
 * @description Displays the consumer's currently linked professional for a
 * given role, or an empty-state placeholder.
 *
 * @param {"Dietician"|"Instructor"} role
 * @param {object|null}  professional — The matched professional object, or null.
 * @param {boolean}      isBusy       — True while a disconnect call is in flight.
 * @param {fn}           onDisconnect — Callback to disconnect this role.
 */
const TeamSlot = ({ role, professional, isBusy, onDisconnect }) => {
  const roleClass = role.toLowerCase();
  const roleEmoji = role === "Dietician" ? "🥗" : "💪";

  if (!professional) {
    // ── Empty Slot ──
    return (
      <div className="fp-slot fp-slot--empty" id={`team-slot-${roleClass}`}>
        <p className="fp-slot__label fp-slot__label--empty">{roleEmoji} {role}</p>
        <div className="fp-slot__empty-body">
          <div className="fp-slot__empty-icon">?</div>
          <span className="fp-slot__empty-text">
            No {role} selected.
            <br />
            Browse below to connect.
          </span>
        </div>
      </div>
    );
  }

  // ── Filled Slot ──
  const avatarLetter = professional.full_name?.charAt(0).toUpperCase() ?? "?";

  return (
    <div className={`fp-slot fp-slot--${roleClass}`} id={`team-slot-${roleClass}`}>
      <p className="fp-slot__label fp-slot__label--${roleClass}"
         style={{ color: role === "Dietician" ? "var(--con-green)" : "var(--con-blue)" }}>
        {roleEmoji} Your {role}
      </p>

      <div className="fp-slot__body">
        <div className={`fp-slot__avatar fp-slot__avatar--${roleClass}`}>
          {avatarLetter}
        </div>
        <div className="fp-slot__info">
          <p className="fp-slot__name">{professional.full_name}</p>
          <span className="fp-slot__email">{professional.email}</span>
        </div>
      </div>

      <button
        className="fp-disconnect-btn"
        id={`disconnect-btn-${roleClass}`}
        disabled={isBusy}
        onClick={() => onDisconnect(role)}
        aria-label={`Disconnect from ${professional.full_name}`}
      >
        {isBusy ? (
          <><span className="con-spinner-sm" aria-hidden="true" /> Disconnecting…</>
        ) : (
          <>✕ Disconnect</>
        )}
      </button>
    </div>
  );
};

// =============================================================================
// DISCOVER CARD — one per professional in the browse grid
// =============================================================================

/**
 * ProfessionalCard
 * @description Renders a professional's info card with a context-aware action button.
 *
 * Button logic:
 *   - isCurrentlyLinked  → green "✓ Currently Connected" badge (disabled)
 *   - hasDifferentLinked → purple "⇄ Switch to this [Role]" button
 *   - neither            → orange "⚡ Connect" button
 *
 * @param {object}  professional       — Full professional user doc.
 * @param {boolean} isCurrentlyLinked  — This prof is the consumer's linked one.
 * @param {boolean} hasDifferentLinked — Consumer has a *different* prof linked.
 * @param {boolean} isBusy             — A network call for this card is in flight.
 * @param {fn}      onAction           — Callback(professionalId, professionalRole).
 */
const ProfessionalCard = ({
  professional,
  isCurrentlyLinked,
  hasDifferentLinked,
  isBusy,
  onAction,
}) => {
  const roleClass   = professional.role.toLowerCase();
  const avatarLetter = professional.full_name?.charAt(0).toUpperCase() ?? "?";

  // Derive button label + CSS variant from the three states
  const getButton = () => {
    if (isCurrentlyLinked) {
      return (
        <button
          className="fp-action-btn fp-action-btn--active"
          id={`action-btn-${professional._id}`}
          disabled
          aria-label="Currently connected"
        >
          ✓ Currently Connected
        </button>
      );
    }

    if (isBusy) {
      return (
        <button
          className={`fp-action-btn ${hasDifferentLinked ? "fp-action-btn--switch" : "fp-action-btn--connect"} fp-action-btn--loading`}
          disabled
        >
          <span className="con-spinner-sm" aria-hidden="true" />
          {hasDifferentLinked ? "Switching…" : "Connecting…"}
        </button>
      );
    }

    if (hasDifferentLinked) {
      return (
        <button
          className="fp-action-btn fp-action-btn--switch"
          id={`action-btn-${professional._id}`}
          onClick={() => onAction(professional._id, professional.role)}
          aria-label={`Switch to ${professional.full_name} as your ${professional.role}`}
        >
          ⇄ Switch to this {professional.role}
        </button>
      );
    }

    return (
      <button
        className="fp-action-btn fp-action-btn--connect"
        id={`action-btn-${professional._id}`}
        onClick={() => onAction(professional._id, professional.role)}
        aria-label={`Connect with ${professional.full_name}`}
      >
        ⚡ Connect
      </button>
    );
  };

  return (
    <div
      className={`fp-card fp-card--${roleClass}`}
      id={`prof-card-${professional._id}`}
    >
      {/* ── Header: Avatar + Name + Role Badge ── */}
      <div className="fp-card__header">
        <div className={`fp-card__avatar fp-card__avatar--${roleClass}`}>
          {avatarLetter}
        </div>
        <div className="fp-card__info">
          <p className="fp-card__name">{professional.full_name}</p>
          <span className={`fp-card__role-badge fp-card__role-badge--${roleClass}`}>
            {professional.role === "Dietician" ? "🥗" : "💪"} {professional.role}
          </span>
        </div>
      </div>

      {/* ── Email ── */}
      <div className="fp-card__email" title={professional.email}>
        📧 {professional.email}
      </div>

      {/* ── Context-aware Action Button ── */}
      {getButton()}
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * FindProfessionals (My Health Team Hub)
 */
const FindProfessionals = ({ consumer, onConsumerUpdate }) => {

  // ── Remote data ──────────────────────────────────────────────────────────────
  const [professionals, setProfessionals] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchError,    setFetchError]    = useState("");

  // ── Discover tab & search ────────────────────────────────────────────────────
  const [discoverTab, setDiscoverTab] = useState("dietician"); // "dietician"|"instructor"
  const [searchQuery, setSearchQuery] = useState("");

  // ── In-flight tracking ───────────────────────────────────────────────────────
  // One state tracks which professional's card is busy (connect/switch).
  // Another tracks which slot is busy (disconnect).
  const [actionInFlight,     setActionInFlight]     = useState(null); // professional._id
  const [disconnectInFlight, setDisconnectInFlight] = useState(null); // "Dietician"|"Instructor"

  // ── Toast system ─────────────────────────────────────────────────────────────
  const [toasts,    setToasts]    = useState([]);
  const toastTimers               = useRef({});

  // ── Toast helpers ─────────────────────────────────────────────────────────────

  const removeToast = useCallback((id) => {
    clearTimeout(toastTimers.current[id]);
    delete toastTimers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    toastTimers.current[id] = setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  // Cleanup timers on unmount to avoid memory leaks
  useEffect(() => {
    const timers = toastTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  // ── Data Fetching ─────────────────────────────────────────────────────────────

  /**
   * fetchProfessionals — loads the full directory of Dieticians + Instructors.
   */
  const fetchProfessionals = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const res = await axios.get("/professionals");
      setProfessionals(res.data);
    } catch (err) {
      console.error("fetchProfessionals error:", err);
      setFetchError(err.response?.data?.error ?? "Failed to load professionals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfessionals(); }, [fetchProfessionals]);

  /**
   * refreshConsumer — re-fetches the consumer's own document from the DB and
   * pushes it to the parent via onConsumerUpdate. This is the key mechanism
   * for state persistence: the frontend never trusts its own optimistic state
   * for professional links — it always gets the ground truth from the server.
   */
  const refreshConsumer = useCallback(async () => {
    try {
      const res = await axios.get("/consumer/me");
      onConsumerUpdate(res.data.user);
    } catch (err) {
      console.error("refreshConsumer error:", err);
      // Non-critical: UI will still show success toast; link is persisted in DB.
    }
  }, [onConsumerUpdate]);

  // ── Action Handlers ───────────────────────────────────────────────────────────

  /**
   * handleConnect
   * Calls PUT /api/consumer/link-professional, then refreshes the consumer doc.
   * Handles both "Connect" (new link) and "Switch" (replace existing link) actions,
   * as the backend linkProfessional controller overwrites whichever field is set.
   *
   * @param {string} professionalId
   * @param {string} professionalRole  "Dietician" | "Instructor"
   */
  const handleConnect = async (professionalId, professionalRole) => {
    setActionInFlight(professionalId);
    try {
      const res = await axios.put("/consumer/link-professional", {
        professionalId,
        professionalRole,
      });
      addToast("success", res.data.message);
      // Re-fetch the consumer document so UI reflects DB truth on any refresh
      await refreshConsumer();
    } catch (err) {
      console.error("handleConnect error:", err);
      addToast("error", err.response?.data?.error ?? "Failed to connect. Please try again.");
    } finally {
      setActionInFlight(null);
    }
  };

  /**
   * handleDisconnect
   * Calls PUT /api/consumer/disconnect-professional to nullify a professional link,
   * then refreshes the consumer document.
   *
   * @param {string} professionalRole  "Dietician" | "Instructor"
   */
  const handleDisconnect = async (professionalRole) => {
    setDisconnectInFlight(professionalRole);
    try {
      const res = await axios.put("/consumer/disconnect-professional", {
        professionalRole,
      });
      addToast("success", res.data.message);
      await refreshConsumer();
    } catch (err) {
      console.error("handleDisconnect error:", err);
      addToast("error", err.response?.data?.error ?? "Failed to disconnect. Please try again.");
    } finally {
      setDisconnectInFlight(null);
    }
  };

  // ── Derived State ─────────────────────────────────────────────────────────────

  // Split the full list by role
  const dieticians  = professionals.filter((p) => p.role === "Dietician");
  const instructors = professionals.filter((p) => p.role === "Instructor");

  // Resolve the consumer's linked professional IDs.
  // The field may hold a raw ObjectId string OR a populated object; handle both.
  const linkedDieticianId  = consumer?.dieticianId?._id  ?? consumer?.dieticianId  ?? null;
  const linkedInstructorId = consumer?.instructorId?._id ?? consumer?.instructorId ?? null;

  // Look up the actual professional objects for the "My Team" slot cards
  const myDietician  = dieticians.find((p) => p._id === linkedDieticianId)  ?? null;
  const myInstructor = instructors.find((p) => p._id === linkedInstructorId) ?? null;

  // The discover list is filtered by the active tab and the search query
  const activeDiscoverList = (discoverTab === "dietician" ? dieticians : instructors)
    .filter((p) =>
      p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // The linked ID for the currently active discover tab
  const activeLinkedId = discoverTab === "dietician" ? linkedDieticianId : linkedInstructorId;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fp-wrapper">

      {/* ════════════════════════════════════════════════════════════════════
          MY HEALTH TEAM  (top section)
          ════════════════════════════════════════════════════════════════════ */}
      <section className="fp-my-team" aria-label="My Health Team">
        <div className="fp-section-header">
          <span className="fp-section-icon">❤️</span>
          <div>
            <h2 className="fp-section-title">My Health Team</h2>
            <p className="fp-section-subtitle">Your currently connected professionals</p>
          </div>
        </div>

        <div className="fp-my-team__slots">
          {loading ? (
            /* Show skeleton slots while professionals are loading */
            <>
              <SlotSkeleton />
              <SlotSkeleton />
            </>
          ) : (
            <>
              {/* Dietician slot */}
              <TeamSlot
                role="Dietician"
                professional={myDietician}
                isBusy={disconnectInFlight === "Dietician"}
                onDisconnect={handleDisconnect}
              />

              {/* Instructor slot */}
              <TeamSlot
                role="Instructor"
                professional={myInstructor}
                isBusy={disconnectInFlight === "Instructor"}
                onDisconnect={handleDisconnect}
              />
            </>
          )}
        </div>
      </section>

      {/* Visual separator between the two sections */}
      <div className="fp-divider">Discover Professionals</div>

      {/* ════════════════════════════════════════════════════════════════════
          DISCOVER  (bottom section)
          ════════════════════════════════════════════════════════════════════ */}
      <section className="fp-discover" aria-label="Discover Professionals">

        {/* ── Toolbar: tabs + search ── */}
        <div className="fp-toolbar">

          {/* Tab selector */}
          <div className="fp-tabs" role="tablist" aria-label="Browse by profession">
            <button
              role="tab"
              id="discover-tab-dietician"
              aria-selected={discoverTab === "dietician"}
              className={`fp-tab-btn ${discoverTab === "dietician" ? "fp-tab-btn--active" : ""}`}
              onClick={() => { setDiscoverTab("dietician"); setSearchQuery(""); }}
            >
              🥗 Browse Dieticians
              <span className="fp-tab-badge">{dieticians.length}</span>
            </button>

            <button
              role="tab"
              id="discover-tab-instructor"
              aria-selected={discoverTab === "instructor"}
              className={`fp-tab-btn ${discoverTab === "instructor" ? "fp-tab-btn--active" : ""}`}
              onClick={() => { setDiscoverTab("instructor"); setSearchQuery(""); }}
            >
              💪 Browse Instructors
              <span className="fp-tab-badge">{instructors.length}</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="fp-search-wrap">
            <span className="fp-search-icon" aria-hidden="true">🔍</span>
            <input
              id="professionals-search"
              type="text"
              className="fp-search-input"
              placeholder={`Search ${discoverTab === "dietician" ? "dieticians" : "instructors"}…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search professionals by name"
            />
          </div>
        </div>

        {/* ── Content area ── */}
        {loading ? (
          /* Skeleton grid */
          <div className="fp-skeleton-grid">
            {[1, 2, 3, 4].map((n) => <SkeletonCard key={n} />)}
          </div>

        ) : fetchError ? (
          /* Fetch error */
          <div className="con-error-banner" role="alert">
            {fetchError}
            <button
              onClick={fetchProfessionals}
              style={{
                marginLeft: "0.75rem",
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>

        ) : activeDiscoverList.length === 0 ? (
          /* Empty state — either no professionals registered or search had no results */
          <div className="fp-empty">
            <div className="fp-empty__icon">
              {discoverTab === "dietician" ? "🥗" : "💪"}
            </div>
            <p className="fp-empty__title">
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No ${discoverTab === "dietician" ? "Dieticians" : "Instructors"} registered yet`}
            </p>
            {searchQuery && (
              <p className="fp-empty__sub">Try a different name.</p>
            )}
          </div>

        ) : (
          /* Professional card grid */
          <div
            className="fp-grid"
            role="tabpanel"
            aria-labelledby={`discover-tab-${discoverTab}`}
          >
            {activeDiscoverList.map((prof) => {
              // Determine this card's connection state relative to the consumer
              const isCurrentlyLinked  = prof._id === activeLinkedId;
              const hasDifferentLinked = !isCurrentlyLinked && !!activeLinkedId;

              return (
                <ProfessionalCard
                  key={prof._id}
                  professional={prof}
                  isCurrentlyLinked={isCurrentlyLinked}
                  hasDifferentLinked={hasDifferentLinked}
                  isBusy={actionInFlight === prof._id}
                  onAction={handleConnect}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ── Toast Notifications (fixed, bottom-right) ── */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default FindProfessionals;
