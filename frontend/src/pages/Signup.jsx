import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "../api/axios";
import "./AuthPages.css";

const Signup = () => {
  const [formData, setFormData] = useState({
    full_name: "",
    email:     "",
    password:  "",
    role:      "Consumer",
  });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await axios.post("/auth/signup", formData);
      localStorage.setItem("user", JSON.stringify(response.data));
      if (response.data.role === "Admin") navigate("/admin");
      else                                navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed. Please try again.");
      console.error("Signup Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { value: "Consumer",   label: "Consumer",   icon: "🍊" },
    { value: "Dietician",  label: "Dietician",  icon: "🥗" },
    { value: "Instructor", label: "Instructor", icon: "🏋️" },
  ];

  return (
    <div className="auth-page">
      {/* Animated background orbs */}
      <div className="auth-orb auth-orb--1" aria-hidden="true" />
      <div className="auth-orb auth-orb--2" aria-hidden="true" />
      <div className="auth-orb auth-orb--3" aria-hidden="true" />

      <div className="auth-card auth-card--wide" role="main">

        {/* Header */}
        <div className="auth-card__header">
          <div className="auth-brand">
            NutriFit<span className="auth-brand__accent">-AI</span>
          </div>
          <h1 className="auth-card__title">Create your account</h1>
          <p className="auth-card__sub">Start your personalised health journey today</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="auth-error" role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} id="signup-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-name">Full Name</label>
            <input
              id="signup-name"
              type="text"
              className="auth-input"
              placeholder="e.g. Alex Johnson"
              required
              autoComplete="name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              required
              autoComplete="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              className="auth-input"
              placeholder="Choose a strong password"
              required
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          {/* Role selector — pill buttons */}
          <div className="auth-field">
            <label className="auth-label">I am a…</label>
            <div className="auth-role-group" role="group" aria-label="Account role">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  id={`role-btn-${r.value.toLowerCase()}`}
                  className={`auth-role-btn ${formData.role === r.value ? "auth-role-btn--active" : ""}`}
                  onClick={() => setFormData({ ...formData, role: r.value })}
                  aria-pressed={formData.role === r.value}
                >
                  <span aria-hidden="true">{r.icon}</span>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            id="signup-submit-btn"
            className="auth-btn"
            disabled={loading}
          >
            {loading ? (
              <><span className="auth-btn__spinner" aria-hidden="true" /> Creating account…</>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="auth-footer">
          Already have an account?{" "}
          <Link to="/login" className="auth-link" id="goto-login-link">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;