/**
 * @file App.jsx
 * @description Root application router for NutriFit AI.
 *
 * Route Architecture:
 * ──────────────────
 * Public Routes (no auth required):
 *   /login   → Login page
 *   /signup  → Signup page
 *
 * Protected Routes (require a valid JWT cookie + localStorage user):
 *   /dashboard → Standard user dashboard (Consumer, Dietician, Instructor)
 *                Wrapped in <ProtectedRoute> which checks localStorage
 *
 * Admin Routes (require JWT + role === "Admin"):
 *   /admin   → Admin dashboard
 *              Wrapped in <AdminRoute> which checks localStorage AND role field
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
    const isFullscreen = ["/dashboard", "/admin", "/dietician", "/instructor"].some((path) =>
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

        {/* ── Protected Consumer Dashboard (/dashboard) ── */}
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