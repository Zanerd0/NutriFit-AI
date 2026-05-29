/**
 * @file ClientProgressPanel.jsx
 * @description Professional modal: dietician (weight + meals) or instructor (workout adherence).
 */

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import axios from "../api/axios";
import "./ClientProgressPanel.css";

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * @param {object} props
 * @param {object} props.client - Client user document
 * @param {"dietician"|"instructor"} [props.variant="dietician"]
 * @param {"weight"|"meals"|"workout"} [props.initialView] - Opening tab
 * @param {Function} props.onClose
 */
const ClientProgressPanel = ({ client, variant = "dietician", initialView, onClose }) => {
  const defaultView =
    initialView || (variant === "instructor" ? "workout" : "weight");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [view, setView] = useState(defaultView);

  const apiBase = variant === "instructor" ? "/instructor" : "/dietician";

  useEffect(() => {
    setView(defaultView);
  }, [client?._id, defaultView]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${apiBase}/client-progress/${client._id}`);
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.error || "Failed to load client progress.");
      } finally {
        setLoading(false);
      }
    };
    if (client?._id) load();
  }, [client?._id, apiBase]);

  const weightData = (data?.weightLogs || []).map((log) => ({
    date: log.date,
    weight: log.weight,
  }));

  const workoutItems = data?.workoutAdherence?.items || [];
  const dietItems = data?.dietAdherence?.items || [];
  const adherenceDateLabel = data?.date
    ? new Date(`${data.date}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "today";

  return (
    <div className="cpp-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="cpp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Progress for ${client.full_name}`}
      >
        <div className="cpp-modal__header">
          <div>
            <h3 className="cpp-modal__title">{client.full_name}</h3>
            <p className="cpp-modal__sub">{client.email}</p>
          </div>
          <button type="button" className="cpp-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {variant === "dietician" && (
          <div className="cpp-tabs">
            <button
              type="button"
              className={`cpp-tab ${view === "weight" ? "cpp-tab--active" : ""}`}
              onClick={() => setView("weight")}
            >
              Weight Graph
            </button>
            <button
              type="button"
              className={`cpp-tab ${view === "meals" ? "cpp-tab--active" : ""}`}
              onClick={() => setView("meals")}
            >
              Meals List
            </button>
          </div>
        )}

        {variant === "instructor" && (
          <p className="cpp-modal__hint">Exercise checklist marked by your client for their current plan.</p>
        )}

        {loading && <div className="cpp-state">Loading progress…</div>}
        {error && (
          <div className="cpp-state cpp-state--error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && variant === "dietician" && view === "weight" && (
          <div className="cpp-panel">
            {weightData.length === 0 ? (
              <p className="cpp-empty">No weight entries logged yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={weightData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} width={40} />
                  <Tooltip
                    labelFormatter={(v) => formatDate(v)}
                    formatter={(v) => [`${v} kg`, "Weight"]}
                  />
                  <Line type="monotone" dataKey="weight" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {!loading && !error && variant === "dietician" && view === "meals" && (
          <div className="cpp-panel cpp-panel--meals">
            {(data?.meals || []).length === 0 ? (
              <p className="cpp-empty">No meal logs recorded yet.</p>
            ) : (
              <ul className="cpp-meals-list">
                {data.meals.map((meal, i) => (
                  <li key={`${meal.date}-${i}`} className="cpp-meal-row">
                    <span className="cpp-meal-row__date">{formatDate(meal.date)}</span>
                    <span className="cpp-meal-row__food">{meal.foodItem}</span>
                    <span className="cpp-meal-row__cal">{meal.estimatedCalories} kcal</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!loading && !error && variant === "instructor" && (
          <div className="cpp-panel">
            {workoutItems.length === 0 ? (
              <p className="cpp-empty">No workout checklist items yet.</p>
            ) : (
              <div className="cpp-adherence__list cpp-adherence__list--stack">
                {workoutItems.map((item) => (
                  <span
                    key={item.key}
                    className={`cpp-adherence-chip cpp-adherence-chip--block ${
                      item.completed ? "cpp-adherence-chip--yes" : "cpp-adherence-chip--no"
                    }`}
                  >
                    {item.completed ? "✔" : "✕"} {item.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && !error && variant === "dietician" && dietItems.length > 0 && (
          <div className="cpp-adherence">
            <h4 className="cpp-adherence__title">Meal Adherence ({adherenceDateLabel})</h4>
            <div className="cpp-adherence__list">
              {dietItems.map((item) => (
                <span
                  key={item.key}
                  className={`cpp-adherence-chip ${
                    item.completed ? "cpp-adherence-chip--yes" : "cpp-adherence-chip--no"
                  }`}
                >
                  {item.completed ? "✔" : "✕"} {item.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientProgressPanel;
