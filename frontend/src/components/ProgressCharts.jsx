/**
 * @file ProgressCharts.jsx
 * @description Fetches the consumer's full weight-log history and renders a
 * responsive Recharts LineChart. The chart shows weight on the Y-axis and
 * formatted dates on the X-axis so the consumer can visualise their progress
 * over time.
 *
 * Library: recharts (already installed — see frontend/package.json)
 *
 * Props:
 *   refreshTrigger {number} — increment this value from the parent to force
 *                             a fresh data fetch (used after DailyLogForm saves).
 *
 * Data source: GET /api/consumer/progress-history
 *   → Array<{ _id: string, date: string (ISO 8601), weight: number }>
 *     sorted oldest → newest
 */

import { useState, useEffect }         from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import axios                           from "../api/axios";
import "./ProgressCharts.css";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * formatDate — Converts an ISO date string to "MM/DD" for X-axis tick labels.
 * Example: "2025-04-23T00:00:00.000Z" → "04/23"
 *
 * @param {string} isoString
 * @returns {string}
 */
const formatDate = (isoString) => {
  const d = new Date(isoString);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}`;
};

/**
 * formatTooltipDate — Verbose date string for the hover tooltip.
 * Example: "April 23, 2025"
 *
 * @param {string} isoString
 * @returns {string}
 */
const formatTooltipDate = (isoString) =>
  new Date(isoString).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    timeZone: "UTC",
  });

// =============================================================================
// CUSTOM RECHARTS TOOLTIP
// =============================================================================

/**
 * CustomTooltip
 * Replaces Recharts' default tooltip with a styled card that shows the date
 * (formatted verbosely) and the exact weight reading.
 *
 * Recharts passes `active`, `payload`, and `label` automatically.
 */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const weight = payload[0]?.value;

  return (
    <div className="pc-tooltip" role="tooltip">
      <p className="pc-tooltip__date">{formatTooltipDate(label)}</p>
      <p className="pc-tooltip__weight">
        <span className="pc-tooltip__value">{weight}</span>
        <span className="pc-tooltip__unit"> kg / lbs</span>
      </p>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * ProgressCharts
 * @param {{ refreshTrigger?: number }} props
 */
const ProgressCharts = ({ refreshTrigger = 0 }) => {
  // ── State ───────────────────────────────────────────────────────────────────
  const [logs,    setLogs]    = useState([]);      // raw API response
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // ── Data Fetch ──────────────────────────────────────────────────────────────

  /**
   * fetchHistory — GET /api/consumer/progress-history
   * Re-runs whenever `refreshTrigger` changes (parent increments it after
   * DailyLogForm successfully saves a new entry).
   */
  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get("/consumer/progress-history");
        setLogs(res.data);
      } catch (err) {
        setError(
          err.response?.data?.error || "Failed to load progress data."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [refreshTrigger]); // re-fetch whenever the parent signals a new save

  // ── Derived Chart Data ──────────────────────────────────────────────────────
  // Transform the raw API array into the shape Recharts expects:
  //   { date: ISOString (raw, for label formatting), weight: number }
  const chartData = logs.map((log) => ({
    date:   log.date,
    weight: log.weight,
  }));

  // Compute average weight for a reference line (only when we have data)
  const avgWeight =
    chartData.length > 0
      ? parseFloat(
          (chartData.reduce((sum, d) => sum + d.weight, 0) / chartData.length).toFixed(1)
        )
      : null;

  // ── Render Helpers ──────────────────────────────────────────────────────────

  const renderLoading = () => (
    <div className="pc-state pc-state--loading" aria-label="Loading progress data">
      <div className="pc-spinner" />
      <p>Loading your progress data…</p>
    </div>
  );

  const renderError = () => (
    <div className="pc-state pc-state--error" role="alert">
      {error}
    </div>
  );

  const renderEmpty = () => (
    <div className="pc-state pc-state--empty" aria-label="No data yet">
      <div className="pc-empty__graphic" aria-hidden="true">
        {/* Simple SVG bar-chart placeholder */}
        <svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="pc-empty__svg">
          <rect x="4"  y="32" width="8"  height="12" rx="2" fill="rgba(249,115,22,0.15)" />
          <rect x="16" y="20" width="8"  height="24" rx="2" fill="rgba(249,115,22,0.2)"  />
          <rect x="28" y="12" width="8"  height="32" rx="2" fill="rgba(249,115,22,0.3)"  />
          <rect x="40" y="24" width="8"  height="20" rx="2" fill="rgba(249,115,22,0.2)"  />
          <rect x="52" y="8"  width="8"  height="36" rx="2" fill="rgba(249,115,22,0.4)"  />
          <line x1="0" y1="44" x2="64" y2="44" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        </svg>
      </div>
      <p className="pc-empty__title">No weight logs yet</p>
      <p className="pc-empty__sub">
        Use the form to log your weight — your chart will appear here once you
        have at least one entry.
      </p>
    </div>
  );

  // ── Main Render ─────────────────────────────────────────────────────────────
  return (
    <div className="pc-card" id="progress-chart-card">
      {/* Card header */}
      <div className="pc-card__header">
        <div className="pc-card__icon-wrap" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pc-card__icon">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="pc-card__title">Weight Progress</h2>
          <p className="pc-card__subtitle">
            {chartData.length > 0
              ? `${chartData.length} entr${chartData.length === 1 ? "y" : "ies"} recorded`
              : "Start logging to see your trend"}
          </p>
        </div>

        {/* Average badge — only shown when data exists */}
        {avgWeight !== null && (
          <div className="pc-avg-badge" title="Average logged weight">
            <span className="pc-avg-badge__label">Avg</span>
            <span className="pc-avg-badge__value">{avgWeight}</span>
          </div>
        )}
      </div>

      {/* Chart area */}
      <div className="pc-chart-wrap">
        {loading
          ? renderLoading()
          : error
          ? renderError()
          : chartData.length === 0
          ? renderEmpty()
          : (
            /* ResponsiveContainer fills the parent's width automatically */
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
              >
                {/* Subtle grid lines */}
                <CartesianGrid
                  strokeDasharray="3 4"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />

                {/* X-axis: formatted dates */}
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: "var(--con-text-muted)", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  tickLine={false}
                  dy={6}
                />

                {/* Y-axis: weight values */}
                <YAxis
                  tick={{ fill: "var(--con-text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `${v}`}
                />

                {/* Custom hover tooltip */}
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: "rgba(249,115,22,0.25)", strokeWidth: 1.5 }}
                />

                {/* Average reference line */}
                {avgWeight !== null && (
                  <ReferenceLine
                    y={avgWeight}
                    stroke="rgba(249,115,22,0.35)"
                    strokeDasharray="5 3"
                    label={{
                      value: `Avg ${avgWeight}`,
                      position: "insideTopRight",
                      fill: "var(--con-accent)",
                      fontSize: 10,
                    }}
                  />
                )}

                {/* The weight trend line */}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--con-accent)"
                  strokeWidth={2.5}
                  dot={{
                    r: 4,
                    fill: "var(--con-accent)",
                    stroke: "var(--con-surface)",
                    strokeWidth: 2,
                  }}
                  activeDot={{
                    r: 6,
                    fill: "var(--con-accent)",
                    stroke: "var(--con-surface)",
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
      </div>

      {/* Legend hint — only shown with data */}
      {!loading && !error && chartData.length > 0 && (
        <div className="pc-legend">
          <span className="pc-legend__swatch" aria-hidden="true" />
          <span className="pc-legend__label">Daily Weight</span>
          <span className="pc-legend__sep" aria-hidden="true">·</span>
          <span className="pc-legend__sub">Hover data points to see exact values</span>
        </div>
      )}
    </div>
  );
};

export default ProgressCharts;
