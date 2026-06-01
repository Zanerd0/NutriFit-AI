/**
 * @file ClientList.jsx
 * @description Shared client list for dietician and instructor dashboards.
 */

import { useState, useEffect } from "react";
import axios from "../api/axios";
import ClientProgressPanel from "./ClientProgressPanel";
import "./ClientList.css";

const ComplianceBadge = ({ active }) => (
  <span
    className={`cl-badge ${active ? "cl-badge--active" : "cl-badge--inactive"}`}
    aria-label={active ? "On Track" : "Needs Attention"}
  >
    <span className="cl-badge__dot" />
    {active ? "On Track" : "Needs Attention"}
  </span>
);

const WorkoutRequestBadge = () => (
  <span className="cl-badge cl-badge--workout-request" aria-label="Workout plan requested">
    <span className="cl-badge__dot" />
    Plan Requested
  </span>
);

const DietRequestBadge = ({ forReview }) => (
  <span
    className="cl-badge cl-badge--diet-request"
    aria-label={forReview ? "AI plan sent for review" : "Diet plan requested"}
  >
    <span className="cl-badge__dot" />
    {forReview ? "AI Plan for Review" : "Diet Plan Requested"}
  </span>
);

/** Green/red flag: full plan adherence on the previous 2 calendar days. */
const AdherenceFlag = ({ status }) => {
  if (!status) return null;
  const isGreen = status === "green";
  return (
    <span
      className={`cl-adherence-flag cl-adherence-flag--${status}`}
      title={
        isGreen
          ? "Followed their plan fully on the last 2 days"
          : "Did not fully follow their plan on the last 2 days"
      }
      aria-label={isGreen ? "Good plan adherence" : "Poor plan adherence"}
    />
  );
};

const formatDietaryPreferences = (prefs) => {
  if (!Array.isArray(prefs) || prefs.length === 0) return [];
  return prefs.filter((p) => p && p !== "None");
};

const EmptyState = () => (
  <div className="cl-empty" role="status">
    <h3 className="cl-empty__title">No Linked Clients Yet</h3>
    <p className="cl-empty__text">
      Clients will appear here once they connect with you from their Consumer
      Dashboard. Share your profile so consumers can find and link to you.
    </p>
  </div>
);

const ClientList = ({ onSelectClient, variant = "dietician", refreshTrigger = 0 }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progressClient, setProgressClient] = useState(null);
  const [progressView, setProgressView] = useState("weight");

  const activeCount = clients.filter((c) => c.hasRecentLogs).length;
  const inactiveCount = clients.length - activeCount;

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
          setError(err.response?.data?.error || "Failed to load your client list.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, [refreshTrigger]);

  const openProgress = (client, view) => {
    setProgressView(view);
    setProgressClient(client);
  };

  if (loading) {
    return (
      <div className="cl-loading" role="status" aria-label="Loading clients">
        <div className="cl-spinner" />
        <p className="cl-loading__text">Loading your clients…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cl-error" role="alert">
        <p>{error}</p>
      </div>
    );
  }

  if (clients.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className={`cl-wrapper cl-wrapper--${variant}`}>
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

      <p className="cl-flag-legend" aria-hidden="true">
        <span className="cl-adherence-flag cl-adherence-flag--green" /> Followed plan (last 2 days)
        <span className="cl-adherence-flag cl-adherence-flag--red" /> Needs attention (last 2 days)
      </p>

      <div className="cl-table-container" role="region" aria-label="Client list table">
        <table className="cl-table" aria-label="Client compliance table">
          <thead className="cl-table__head">
            <tr>
              <th scope="col" className="cl-th cl-th--name">Client Name</th>
              <th scope="col" className="cl-th cl-th--goal">Primary Goal</th>
              {variant === "dietician" && (
                <th scope="col" className="cl-th cl-th--diet">Dietary Preferences</th>
              )}
              <th scope="col" className="cl-th cl-th--status">Compliance Status</th>
              <th scope="col" className="cl-th cl-th--actions">Actions</th>
            </tr>
          </thead>

          <tbody className="cl-table__body">
            {clients.map((client, index) => {
              const hasWorkoutRequest = variant === "instructor" && client.workoutRequested;
              const hasDietRequest = variant === "dietician" && client.dietPlanRequested;
              const rowClass = [
                "cl-row",
                hasWorkoutRequest ? "cl-row--requested" : "",
                hasDietRequest ? "cl-row--diet-requested" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <tr
                  key={client._id}
                  className={rowClass}
                  id={`client-row-${client._id}`}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <td className="cl-td cl-td--name">
                    <div className="cl-identity">
                      <div className="cl-avatar" aria-hidden="true">
                        {client.full_name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <div className="cl-identity__text">
                        <span className="cl-identity__name-row">
                          <span className="cl-identity__name">{client.full_name}</span>
                          <AdherenceFlag status={client.adherenceFlag} />
                        </span>
                        <span className="cl-identity__email">{client.email}</span>
                      </div>
                    </div>
                  </td>

                  <td className="cl-td cl-td--goal">
                    {client.primary_goal ? (
                      <span className="cl-goal-tag">{client.primary_goal}</span>
                    ) : (
                      <span className="cl-goal-none">—</span>
                    )}
                  </td>

                  {variant === "dietician" && (
                    <td className="cl-td cl-td--diet">
                      {formatDietaryPreferences(client.dietary_preferences).length > 0 ? (
                        <div className="cl-diet-tags">
                          {formatDietaryPreferences(client.dietary_preferences).map((pref) => (
                            <span key={pref} className="cl-diet-tag">{pref}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="cl-goal-none">—</span>
                      )}
                    </td>
                  )}

                  <td className="cl-td cl-td--status">
                    <ComplianceBadge active={client.hasRecentLogs} />
                  </td>

                  <td className="cl-td cl-td--actions">
                    <div className="cl-actions-col">
                      {hasWorkoutRequest && <WorkoutRequestBadge />}
                      {hasDietRequest && (
                        <DietRequestBadge forReview={client.aiPlanSentForReview} />
                      )}

                      {variant === "dietician" && (
                        <div className="cl-actions-row">
                          <button
                            type="button"
                            className="cl-progress-btn"
                            onClick={() => openProgress(client, "weight")}
                            aria-label={`Weight graph for ${client.full_name}`}
                          >
                            Weight Graph
                          </button>
                          <button
                            type="button"
                            className="cl-progress-btn"
                            onClick={() => openProgress(client, "meals")}
                            aria-label={`Meals list for ${client.full_name}`}
                          >
                            Meals List
                          </button>
                        </div>
                      )}

                      {variant === "instructor" && (
                        <button
                          type="button"
                          className="cl-progress-btn"
                          onClick={() => openProgress(client, "workout")}
                          aria-label={`Workout checklist for ${client.full_name}`}
                        >
                          ✔ Workout Checklist
                        </button>
                      )}

                      <button
                        id={`manage-plan-btn-${client._id}`}
                        className="cl-action-btn"
                        onClick={() => onSelectClient?.(client)}
                        aria-label={`Manage plan for ${client.full_name}`}
                      >
                        Manage Plan →
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {progressClient && (
        <ClientProgressPanel
          client={progressClient}
          variant={variant}
          initialView={progressView}
          onClose={() => setProgressClient(null)}
        />
      )}
    </div>
  );
};

export default ClientList;
