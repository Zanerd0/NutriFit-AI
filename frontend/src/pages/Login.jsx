import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "../api/axios";
import "./AuthPages.css";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await axios.post("/auth/login", formData);
      localStorage.setItem("user", JSON.stringify(response.data));

      const { role } = response.data;
      if (role === "Admin")      navigate("/admin");
      else if (role === "Dietician")  navigate("/dietician");
      else if (role === "Instructor") navigate("/instructor");
      else                            navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated background orbs */}
      <div className="auth-orb auth-orb--1" aria-hidden="true" />
      <div className="auth-orb auth-orb--2" aria-hidden="true" />
      <div className="auth-orb auth-orb--3" aria-hidden="true" />

      <div className="auth-card" role="main">

        {/* Header */}
        <div className="auth-card__header">
          <div className="auth-brand">
            NutriFit<span className="auth-brand__accent">-AI</span>
          </div>
          <h1 className="auth-card__title">Welcome back</h1>
          <p className="auth-card__sub">Sign in to continue your health journey</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="auth-error" role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} id="login-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
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
            <label className="auth-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="auth-input"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            id="login-submit-btn"
            className="auth-btn"
            disabled={loading}
          >
            {loading ? (
              <><span className="auth-btn__spinner" aria-hidden="true" /> Signing in…</>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="auth-footer">
          Don't have an account?{" "}
          <Link to="/signup" className="auth-link" id="goto-signup-link">
            Create one here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;