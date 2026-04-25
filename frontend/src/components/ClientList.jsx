/**
 * @file ClientList.jsx
 * @description Shared "Client List" module for professional dashboards.
 *
 * Renders a modern data table showing all Consumer clients linked to the
 * currently authenticated professional (Dietician or Instructor). Each row
 * displays the client's name, primary goal, a colour-coded compliance badge
 * (based on whether they have submitted a DailyLog in the last 72 hours),
 * and an action button for future profile/plan management.
 *
 * Props:
 *   onSelectClient {Function}  — Optional callback invoked with the client
 *                                object when the "Manage Plan" button is
 *                                clicked. Lets the parent dashboard open its
 *                                existing Create Plan modal.
 *   variant       {"dietician"|"instructor"}  — Controls accent colours to
 *                                match the parent dashboard's theme.
 *
 * Data Fetching:
 *   GET /api/professional/clients — protected by verifyToken + isProfessional.
 *   Uses the shared Axios instance so the HTTP-only JWT cookie is sent automatically.
 */

import { useState, useEffect } from "react";
import axios from "../api/axios";
import "./ClientList.css";

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ComplianceBadge — Visual indicator for a client's activity status.
 * @param {boolean} active - true = logged in last 72h, false = missed logs
 */
const ComplianceBadge = ({ active }) => (
  <span
    className={`cl-badge ${active ? "cl-badge--active" : "cl-badge--inactive"}`}
    aria-label={active ? "On Track" : "Needs Attention"}
  >
    <span className="cl-badge__dot" />
    {active ? "On Track" : "Needs Attention"}
  </span>
);

/**
 * EmptyState — Shown when the professional has no linked clients yet.
 */
const EmptyState = () => (
  <div className="cl-empty" role="status">
    <div className="cl-empty__icon">👥</div>
    <h3 className="cl-empty__title">No Linked Clients Yet</h3>
    <p className="cl-empty__text">
      Clients will appear here once they connect with you from their Consumer
      Dashboard. Share your profile so consumers can find and link to you.
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ClientList
 * @param {object}   props
 * @param {Function} [props.onSelectClient] - Called with a client object when
 *                                            "Manage Plan" is clicked.
 * @param {"dietician"|"instructor"} [props.variant="dietician"] - Theme variant.
 */
const ClientList = ({ onSelectClient, variant = "dietician" }) => {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  // ── Summary counts ──────────────────────────────────────────────────────────
  const activeCount   = clients.filter((c) => c.hasRecentLogs).length;
  const inactiveCount = clients.length - activeCount;

  // ── Fetch on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get("/professional/clients");
        setClients(res.data);
      } catch (err) {
        if (err.response?.status === 403) {
          setError("Access denied. Professional privileges required.");
        } else {
          setError(
            err.response?.data?.error || "Failed to load your client list."
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="cl-loading" role="status" aria-label="Loading clients">
        <div className="cl-spinner" />
        <p className="cl-loading__text">Loading your clients…</p>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="cl-error" role="alert">
        <span className="cl-error__icon">⚠️</span>
        <p>{error}</p>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (clients.length === 0) {
    return <EmptyState />;
  }

  // ── Table ───────────────────────────────────────────────────────────────────
  return (
    <div className={`cl-wrapper cl-wrapper--${variant}`}>

      {/* ── Summary strip ── */}
      <div className="cl-summary" aria-label="Client summary">
        <div className="cl-summary__chip cl-summary__chip--total">
          <span className="cl-summary__count">{clients.length}</span>
          <span className="cl-summary__label">Total Clients</span>
        </div>
        <div className="cl-summary__chip cl-summary__chip--active">
          <span className="cl-summary__count">{activeCount}</span>
          <span className="cl-summary__label">On Track</span>
        </div>
        <div className="cl-summary__chip cl-summary__chip--inactive">
          <span className="cl-summary__count">{inactiveCount}</span>
          <span className="cl-summary__label">Need Attention</span>
        </div>
      </div>

      {/* ── Data table ── */}
      <div className="cl-table-container" role="region" aria-label="Client list table">
        <table className="cl-table" aria-label="Client compliance table">
          <thead className="cl-table__head">
            <tr>
              <th scope="col" className="cl-th cl-th--name">Client Name</th>
              <th scope="col" className="cl-th cl-th--goal">Primary Goal</th>
              <th scope="col" className="cl-th cl-th--status">Compliance Status</th>
              <th scope="col" className="cl-th cl-th--actions">Actions</th>
            </tr>
          </thead>

          <tbody className="cl-table__body">
            {clients.map((client, index) => (
              <tr
                key={client._id}
                className="cl-row"
                id={`client-row-${client._id}`}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {/* Client Name + Avatar */}
                <td className="cl-td cl-td--name">
                  <div className="cl-identity">
                    <div
                      className="cl-avatar"
                      aria-hidden="true"
                    >
                      {client.full_name?.charAt(0).toUpperCase() ?? "?"}
                    </div>
                    <div className="cl-identity__text">
                      <span className="cl-identity__name">{client.full_name}</span>
                      <span className="cl-identity__email">{client.email}</span>
                    </div>
                  </div>
                </td>

                {/* Primary Goal */}
                <td className="cl-td cl-td--goal">
                  {client.primary_goal ? (
                    <span className="cl-goal-tag">{client.primary_goal}</span>
                  ) : (
                    <span className="cl-goal-none">—</span>
                  )}
                </td>

                {/* Compliance Status */}
                <td className="cl-td cl-td--status">
                  <ComplianceBadge active={client.hasRecentLogs} />
                </td>

                {/* Actions */}
                <td className="cl-td cl-td--actions">
                  <button
                    id={`manage-plan-btn-${client._id}`}
                    className="cl-action-btn"
                    onClick={() => onSelectClient?.(client)}
                    aria-label={`Manage plan for ${client.full_name}`}
                  >
                    Manage Plan →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientList;
