/**
 * @file ConsumerOnboarding.jsx
 * @description First-time health profile setup page for new Consumers.
 *
 * Flow:
 *   1. Consumer registers / logs in for the first time.
 *   2. ConsumerRoute detects missing health metrics and redirects here.
 *   3. Consumer fills out the form and submits.
 *   4. PUT /api/consumer/onboarding saves the data.
 *   5. localStorage is updated with the fresh user object.
 *   6. Consumer is redirected to /consumer (main dashboard).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import "./ConsumerOnboarding.css";

// ── Constants ────────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { value: "Weight Loss",       label: "⚖️  Weight Loss" },
  { value: "Muscle Gain",       label: "💪  Muscle Gain" },
  { value: "Maintenance",       label: "🔄  Maintenance" },
  { value: "Improve Endurance", label: "🏃  Improve Endurance" },
  { value: "General Fitness",   label: "🌟  General Fitness" },
];

const DIET_OPTIONS = [
  { value: "None",        label: "🍽️  No Preference" },
  { value: "Keto",        label: "🥑  Keto" },
  { value: "Vegan",       label: "🌱  Vegan" },
  { value: "Vegetarian",  label: "🥦  Vegetarian" },
  { value: "Paleo",       label: "🍖  Paleo" },
  { value: "Gluten-Free", label: "🌾  Gluten-Free" },
  { value: "Halal",       label: "☪️  Halal" },
  { value: "Intermittent Fasting", label: "⏱️  Intermittent Fasting" },
];

// ── Component ────────────────────────────────────────────────────────────────

const ConsumerOnboarding = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    age:                 "",
    weight:              "",
    height:              "",
    primary_goal:        "",
    dietary_preferences: [],
  });

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDietToggle = (value) => {
    setFormData((prev) => {
      const current = prev.dietary_preferences;
      // If "None" is selected, clear everything else
      if (value === "None") return { ...prev, dietary_preferences: ["None"] };
      // If something else is selected, remove "None" if present
      const without = current.filter((v) => v !== "None");
      const updated = without.includes(value)
        ? without.filter((v) => v !== value)   // deselect
        : [...without, value];                  // select
      return { ...prev, dietary_preferences: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Basic client-side validation
    if (!formData.age || !formData.weight || !formData.height) {
      setError("Age, weight, and height are required.");
      return;
    }
    if (!formData.primary_goal) {
      setError("Please select your primary fitness goal.");
      return;
    }
    if (formData.dietary_preferences.length === 0) {
      setError("Please select at least one dietary preference.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        age:                 Number(formData.age),
        weight:              Number(formData.weight),
        height:              Number(formData.height),
        primary_goal:        formData.primary_goal,
        dietary_preferences: formData.dietary_preferences,
      };

      const { data } = await axios.put("/consumer/onboarding", payload);

      // Refresh localStorage so ConsumerRoute no longer redirects back here
      const existing = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...existing, ...data.user }));

      navigate("/consumer", { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error || "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="onboarding-root">
      {/* Ambient background orbs */}
      <div className="onboarding-orb onboarding-orb--1" aria-hidden="true" />
      <div className="onboarding-orb onboarding-orb--2" aria-hidden="true" />

      <div className="onboarding-card">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-logo">🥗</div>
          <h1 className="onboarding-title">Let's Build Your Profile</h1>
          <p className="onboarding-subtitle">
            Tell us about yourself so our AI can craft a personalised plan just for you.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="onboarding-progress" aria-label="Step 1 of 1">
          <div className="onboarding-progress__bar" />
        </div>

        {/* Form */}
        <form className="onboarding-form" onSubmit={handleSubmit} noValidate>

          {/* ── Row 1: Age / Weight / Height ── */}
          <div className="onboarding-row">
            <div className="onboarding-field">
              <label htmlFor="ob-age" className="onboarding-label">Age</label>
              <div className="onboarding-input-wrap">
                <input
                  id="ob-age"
                  type="number"
                  name="age"
                  className="onboarding-input"
                  placeholder="e.g. 25"
                  min="10"
                  max="120"
                  value={formData.age}
                  onChange={handleChange}
                  required
                />
                <span className="onboarding-unit">yrs</span>
              </div>
            </div>

            <div className="onboarding-field">
              <label htmlFor="ob-weight" className="onboarding-label">Weight</label>
              <div className="onboarding-input-wrap">
                <input
                  id="ob-weight"
                  type="number"
                  name="weight"
                  className="onboarding-input"
                  placeholder="e.g. 70"
                  min="20"
                  max="400"
                  step="0.1"
                  value={formData.weight}
                  onChange={handleChange}
                  required
                />
                <span className="onboarding-unit">kg</span>
              </div>
            </div>

            <div className="onboarding-field">
              <label htmlFor="ob-height" className="onboarding-label">Height</label>
              <div className="onboarding-input-wrap">
                <input
                  id="ob-height"
                  type="number"
                  name="height"
                  className="onboarding-input"
                  placeholder="e.g. 175"
                  min="50"
                  max="280"
                  step="0.1"
                  value={formData.height}
                  onChange={handleChange}
                  required
                />
                <span className="onboarding-unit">cm</span>
              </div>
            </div>
          </div>

          {/* ── Primary Goal ── */}
          <div className="onboarding-field onboarding-field--full">
            <label htmlFor="ob-goal" className="onboarding-label">Primary Fitness Goal</label>
            <select
              id="ob-goal"
              name="primary_goal"
              className="onboarding-select"
              value={formData.primary_goal}
              onChange={handleChange}
              required
            >
              <option value="" disabled>Select your goal…</option>
              {GOAL_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          {/* ── Dietary Preferences ── */}
          <div className="onboarding-field onboarding-field--full">
            <span className="onboarding-label">Dietary Preferences</span>
            <p className="onboarding-hint">Select all that apply.</p>
            <div className="onboarding-chips" role="group" aria-label="Dietary preferences">
              {DIET_OPTIONS.map((d) => {
                const selected = formData.dietary_preferences.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    id={`diet-${d.value.replace(/\s+/g, "-").toLowerCase()}`}
                    className={`onboarding-chip ${selected ? "onboarding-chip--active" : ""}`}
                    onClick={() => handleDietToggle(d.value)}
                    aria-pressed={selected}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="onboarding-error" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* ── Submit ── */}
          <button
            id="onboarding-submit-btn"
            type="submit"
            className="onboarding-submit"
            disabled={loading}
          >
            {loading ? (
              <span className="onboarding-spinner" aria-label="Saving…" />
            ) : (
              "Complete Setup →"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ConsumerOnboarding;
