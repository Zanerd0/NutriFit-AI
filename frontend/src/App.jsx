/**
 * @file App.jsx
 * @description Root application router for NutriFit AI.
 *
 * Route Architecture:
 * ──────────────────
 * Public Routes (no auth required):
 *   /          → Home / landing page
 *   /login     → Login page
 *   /signup    → Signup page
 *
 * Onboarding Route (Consumer-only, pre-dashboard gate):
 *   /onboarding → First-time health profile form
 *                 Wrapped in OnboardingRoute which redirects away if:
 *                   a) User is not a Consumer → /login
 *                   b) Profile already complete → /consumer
 *
 * Protected Consumer Route:
 *   /consumer  → Consumer dashboard
 *               Wrapped in ConsumerRoute which requires:
 *                   a) JWT cookie + localStorage user
 *                   b) role === "Consumer"
 *                   c) Onboarding complete (age + weight set)
 *
 * Admin / Dietician / Instructor Routes:
 *   /admin      → AdminDashboard
 *   /dietician  → DieticianDashboard
 *   /instructor → InstructorDashboard
 *
 * Layout Notes:
 * ─────────────
 * The <LayoutManager> component dynamically toggles the `page-fullscreen` CSS
 * class on the #root div. Auth pages (login/signup) use the centered layout
 * defined in index.css. Dashboard pages use the full-screen sidebar layout.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

// Pages
import Login               from "./pages/Login";
import Signup              from "./pages/Signup";
import Dashboard           from "./pages/Dashboard";
import AdminDashboard      from "./pages/AdminDashboard";
import DieticianDashboard  from "./pages/DieticianDashboard";
import InstructorDashboard from "./pages/InstructorDashboard";
import ConsumerDashboard   from "./pages/ConsumerDashboard";
import ConsumerOnboarding  from "./pages/ConsumerOnboarding";
import HomePage            from "./pages/HomePage";

// Route Guards
import ProtectedRoute  from "./components/ProtectedRoute";
import AdminRoute      from "./components/AdminRoute";
import DieticianRoute  from "./components/DieticianRoute";
import InstructorRoute from "./components/InstructorRoute";
import ConsumerRoute   from "./components/ConsumerRoute";

/**
 * LayoutManager - Listens to the current route and toggles the #root
 * CSS class so full-page layouts (dashboards) don't get constrained
 * by the centered flexbox layout used for auth pages.
 */
const LayoutManager = () => {
  const location = useLocation();

  useEffect(() => {
    const root = document.getElementById("root");
    // Dashboard-style pages need full-screen layout; all others stay centered
    const isFullscreen = ["/dashboard", "/admin", "/dietician", "/instructor", "/consumer"].some((path) =>
      location.pathname.startsWith(path)
    );
    root.classList.toggle("page-fullscreen", isFullscreen);
  }, [location.pathname]);

  return null; // This component renders nothing, it's a side-effect only
};

function App() {
  return (
    <BrowserRouter>
      {/* Manages the #root CSS class based on current route */}
      <LayoutManager />

      <Routes>
        {/* ── Home / Landing Page ── */}
        <Route path="/"       element={<HomePage />} />

        {/* ── Public Auth Routes ── */}
        <Route path="/login"  element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* ── Onboarding (Consumer only — pre-dashboard gate) ── */}
        {/*
          OnboardingRoute is defined inline here because it is a micro-guard
          used only for this single route. It mirrors ConsumerRoute but with
          the logic inverted: redirect AWAY if the profile is already complete.
        */}
        <Route
          path="/onboarding"
          element={(() => {
            const user = JSON.parse(localStorage.getItem("user"));
            // Not logged in or wrong role → back to login
            if (!user || user.role !== "Consumer") return <Navigate to="/login" replace />;
            // Already onboarded → skip to dashboard
            if (user.age != null && user.weight != null) return <Navigate to="/consumer" replace />;
            return <ConsumerOnboarding />;
          })()}
        />

        {/* ── Protected Consumer Dashboard (/consumer) ── */}
        <Route
          path="/consumer"
          element={
            <ConsumerRoute>
              <ConsumerDashboard />
            </ConsumerRoute>
          }
        />

        {/* ── Legacy /dashboard alias — kept for backward-compat ── */}
        <Route
          path="/dashboard"
          element={
            <ConsumerRoute>
              <ConsumerDashboard />
            </ConsumerRoute>
          }
        />

        {/* ── Protected Admin Dashboard ── */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />

        {/* ── Protected Dietician Dashboard ── */}
        <Route
          path="/dietician"
          element={
            <DieticianRoute>
              <DieticianDashboard />
            </DieticianRoute>
          }
        />

        {/* ── Protected Instructor Dashboard ── */}
        <Route
          path="/instructor"
          element={
            <InstructorRoute>
              <InstructorDashboard />
            </InstructorRoute>
          }
        />

        {/* ── Catch-all: redirect unknown URLs to Home ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;