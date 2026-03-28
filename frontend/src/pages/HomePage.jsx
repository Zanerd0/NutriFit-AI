/**
 * @file HomePage.jsx
 * @description The public-facing landing page for NutriFit AI.
 *
 * Displays a full-screen hero section with:
 *   - The app brand name as a massive, gradient headline
 *   - A subtitle description
 *   - Login and Sign Up call-to-action buttons
 */

import { Link } from "react-router-dom";
import "./HomePage.css";

const HomePage = () => {
  return (
    <div className="home-page">

      {/* ── Animated background orbs for depth ── */}
      <div className="home-orb home-orb--1" aria-hidden="true" />
      <div className="home-orb home-orb--2" aria-hidden="true" />
      <div className="home-orb home-orb--3" aria-hidden="true" />

      {/* ── Hero Content ── */}
      <main className="home-hero" role="main">

        {/* Badge pill above title */}
        <div className="home-badge">
          <span className="home-badge__dot" />
          AI-Powered Nutrition &amp; Fitness
        </div>

        {/* The massive brand headline */}
        <h1 className="home-title">
          NutriFit
          <span className="home-title__accent">-AI</span>
        </h1>

        {/* Subtitle */}
        <p className="home-subtitle">
          Your intelligent companion for personalized nutrition plans,
          <br />
          fitness tracking, and expert dietician guidance.
        </p>

        {/* CTA Buttons */}
        <div className="home-actions">
          <Link to="/login" className="home-btn home-btn--primary" id="home-login-btn">
            Log In
          </Link>
          <Link to="/signup" className="home-btn home-btn--secondary" id="home-signup-btn">
            Create Account
          </Link>
        </div>

      </main>

    </div>
  );
};

export default HomePage;
