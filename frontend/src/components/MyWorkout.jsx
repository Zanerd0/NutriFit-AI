/**
 * @file MyWorkout.jsx
 * @description Consumer-facing "My Workout" tab component.
 *
 * Fetches GET /api/consumer/my-workout on mount and renders:
 *   - Empty state  → friendly card if no plan has been assigned yet
 *   - Loaded state → plan header + responsive grid of exercise cards
 *
 * Styling: BEM class prefix `mw-` (MyWorkout).
 */

import { useState, useEffect } from "react";
import axios from "../api/axios";
import "./MyWorkout.css";

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * ExerciseCard — Displays one exercise from the workout plan.
 * Shows the exercise name, a sets×reps stat, and an optional duration badge.
 */
const ExerciseCard = ({ exercise, index }) => (
  <div className="mw-exercise-card" id={`exercise-card-${index}`}>
    {/* Exercise number badge */}
    <span className="mw-exercise-card__num">{index + 1}</span>

    {/* Exercise name */}
    <h3 className="mw-exercise-card__name">{exercise.exerciseName}</h3>

    {/* Stats row */}
    <div className="mw-exercise-card__stats">
      <div className="mw-exercise-stat">
        <span className="mw-exercise-stat__value">{exercise.sets}</span>
        <span className="mw-exercise-stat__label">Sets</span>
      </div>
      <span className="mw-exercise-card__sep">×</span>
      <div className="mw-exercise-stat">
        <span className="mw-exercise-stat__value">{exercise.reps}</span>
        <span className="mw-exercise-stat__label">Reps</span>
      </div>
    </div>

    {/* Optional duration badge */}
    {exercise.duration && (
      <span className="mw-exercise-card__duration">⏱ {exercise.duration}s</span>
    )}
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * MyWorkout — Consumer's current active workout plan view.
 */
const MyWorkout = () => {
  const [plan,    setPlan]    = useState(undefined); // undefined = loading, null = none found
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // ── Fetch on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchMyWorkout = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get("/consumer/my-workout");
        // Backend returns { plan: WorkoutPlan | null }
        setPlan(res.data.plan);
      } catch (err) {
        setError(err.response?.data?.error || "Failed to load your workout plan.");
      } finally {
        setLoading(false);
      }
    };

    fetchMyWorkout();
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mw-loading" id="my-workout-loading">
        <div className="mw-spinner" />
        <p>Loading your workout plan…</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mw-error-banner" role="alert" id="my-workout-error">
        {error}
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!plan) {
    return (
      <div className="mw-empty-state" id="my-workout-empty">
        <div className="mw-empty-state__icon">🏋️</div>
        <h2 className="mw-empty-state__title">No Workout Assigned Yet</h2>
        <p className="mw-empty-state__text">
          Your instructor hasn't assigned a routine yet!{" "}
          Once they assign a personalised workout plan it will appear here, 
          ready for you to follow.
        </p>
        <div className="mw-empty-state__hint">
          💡 Make sure you're linked to an instructor in the{" "}
          <strong>Find Professionals</strong> tab.
        </div>
      </div>
    );
  }

  // ── Loaded state ───────────────────────────────────────────────────────────
  return (
    <div className="mw-container" id="my-workout-container">

      {/* ── Plan header card ── */}
      <div className="mw-plan-header">
        {/* Left: Title + meta */}
        <div className="mw-plan-header__info">
          <h2 className="mw-plan-header__title">{plan.title}</h2>

          {plan.description && (
            <p className="mw-plan-header__desc">{plan.description}</p>
          )}

          <div className="mw-plan-header__meta">
            {/* Assigned by */}
            {plan.instructorId?.full_name && (
              <span className="mw-meta-chip mw-meta-chip--instructor">
                👤 Assigned by {plan.instructorId.full_name}
              </span>
            )}

            {/* Date */}
            <span className="mw-meta-chip">
              📅{" "}
              {new Date(plan.createdAt).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>

            {/* Exercise count */}
            <span className="mw-meta-chip mw-meta-chip--count">
              💪 {plan.exercises?.length ?? 0} exercise
              {plan.exercises?.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* ── Exercise grid ── */}
      {plan.exercises?.length > 0 ? (
        <div className="mw-exercises-grid">
          {plan.exercises.map((ex, i) => (
            <ExerciseCard key={ex._id || i} exercise={ex} index={i} />
          ))}
        </div>
      ) : (
        <div className="mw-no-exercises">
          <p>This plan has no exercises defined yet.</p>
        </div>
      )}

    </div>
  );
};

export default MyWorkout;
