/**
 * @file AdminDashboard.jsx
 * @description The main Admin Dashboard page for NutriFit AI.
 *
 * This component renders a full admin control panel with:
 *   - A fixed sidebar for navigation between sections
 *   - An "Overview" section displaying system stats in animated stat cards
 *   - A "User Management" section with a sortable data table and delete functionality
 *
 * Authentication & Authorization:
 *   This page is protected by <AdminRoute> in App.jsx, which verifies
 *   that the logged-in user's role is "Admin" before rendering.
 *
 * Data Fetching:
 *   Uses the shared Axios instance (withCredentials: true) so the
 *   HTTP-only JWT cookie is automatically sent with every API request.
 *
 * State Management:
 *   - stats:      System-wide counts fetched from GET /api/admin/stats
 *   - users:      Full user list fetched from GET /api/admin/users
 *   - loading:    Boolean loading state during initial data fetch
 *   - error:      String error message if a fetch fails
 *   - activeTab:  Controls which sidebar section is rendered
 *   - deleting:   Tracks which user ID is currently being deleted
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import "./AdminDashboard.css";

// ─── Sub-Components ────────────────────────────────────────────────────────

/**
 * StatCard - Renders a single metric card in the Overview section.
 * @param {object} props
 * @param {string} props.label  - The human-readable label (e.g., "Total Users")
 * @param {number} props.value  - The numeric value to display
 * @param {string} props.icon   - An emoji or icon character
 * @param {string} props.accent - A CSS color string for the glow accent
 */
const StatCard = ({ label, value, icon, accent }) => (
  <div className="stat-card" style={{ "--accent": accent }}>
    <div className="stat-card__icon">{icon}</div>
    <div className="stat-card__body">
      <span className="stat-card__value">{value ?? "—"}</span>
      <span className="stat-card__label">{label}</span>
    </div>
  </div>
);

/**
 * RoleBadge - Renders a colored pill badge for a user role.
 * @param {object} props
 * @param {string} props.role - The user role string
 */
const RoleBadge = ({ role }) => {
  // Map each role to a CSS modifier class defined in AdminDashboard.css
  const classMap = {
    Admin:      "badge--admin",
    Dietician:  "badge--dietician",
    Instructor: "badge--instructor",
    Consumer:   "badge--consumer",
  };
  return (
    <span className={`badge ${classMap[role] || ""}`}>{role}</span>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────

const AdminDashboard = () => {
  const navigate  = useNavigate();
  const adminUser = JSON.parse(localStorage.getItem("user"));

  // ── State ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("overview");    // Which sidebar tab is active
  const [stats,     setStats]     = useState(null);          // System stats object
  const [users,     setUsers]     = useState([]);            // Array of all user documents
  const [loading,   setLoading]   = useState(true);          // True during initial data load
  const [error,     setError]     = useState("");            // Error message string
  const [deleting,  setDeleting]  = useState(null);          // ID of user currently being deleted

  // ── Data Fetching ──────────────────────────────────────────────────────

  /**
   * fetchData - Fetches both stats and users concurrently on mount.
   * Wrapped in useCallback so it can be called again after a delete.
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fire both requests in parallel — more efficient than sequential awaits
      const [statsRes, usersRes] = await Promise.all([
        axios.get("/admin/stats"),
        axios.get("/admin/users"),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
    } catch (err) {
      // Check for 403 specifically — user may not actually be an Admin
      if (err.response?.status === 403) {
        setError("Access denied. You do not have admin privileges.");
      } else {
        setError(err.response?.data?.error || "Failed to load admin data.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger data fetch when the component mounts
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Event Handlers ─────────────────────────────────────────────────────

  /**
   * handleLogout - Calls the logout endpoint and redirects to login page.
   */
  const handleLogout = async () => {
    try {
      await axios.post("/auth/logout");
      localStorage.removeItem("user");
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  /**
   * handleDeleteUser - Sends a DELETE request for a specific user.
   * Shows an inline loading state on the specific row's button.
   * @param {string} userId - The MongoDB ObjectId of the user to delete.
   */
  const handleDeleteUser = async (userId) => {
    // Show a browser confirmation dialog before irreversible action
    if (!window.confirm("Are you sure you want to permanently delete this user?")) return;

    setDeleting(userId); // Mark this specific row as loading
    try {
      await axios.delete(`/admin/users/${userId}`);
      // After success, remove the user from local state — no need to re-fetch
      setUsers((prev) => prev.filter((u) => u._id !== userId));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete user.");
    } finally {
      setDeleting(null); // Clear the loading state
    }
  };

  // ── Render Helpers ─────────────────────────────────────────────────────

  /**
   * renderOverview - Renders the stats cards section.
   */
  const renderOverview = () => (
    <section className="admin-section" id="overview-section">
      <div className="section-header">
        <h2 className="section-title">Platform Overview</h2>
        <p className="section-subtitle">Real-time statistics from the NutriFit AI database.</p>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading statistics...</p>
        </div>
      ) : error ? (
        <div className="error-banner" role="alert">{error}</div>
      ) : (
        <div className="stats-grid">
          <StatCard label="Total Users"      value={stats?.totalUsers}      icon="👥" accent="#6c63ff" />
          <StatCard label="Consumers"        value={stats?.totalConsumers}  icon="🧑‍🍳" accent="#10b981" />
          <StatCard label="Dieticians"       value={stats?.totalDieticians} icon="🥗" accent="#f59e0b" />
          <StatCard label="Instructors"      value={stats?.totalInstructors}icon="🏋️" accent="#3b82f6" />
          <StatCard label="Admins"           value={stats?.totalAdmins}     icon="🛡️" accent="#ff4d6d" />
        </div>
      )}
    </section>
  );

  /**
   * renderUserManagement - Renders the full user data table section.
   */
  const renderUserManagement = () => (
    <section className="admin-section" id="user-management-section">
      <div className="section-header">
        <h2 className="section-title">User Management</h2>
        <p className="section-subtitle">
          {users.length} registered user{users.length !== 1 ? "s" : ""} in the system.
        </p>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading users...</p>
        </div>
      ) : error ? (
        <div className="error-banner" role="alert">{error}</div>
      ) : (
        <div className="table-wrapper">
          <table className="users-table" aria-label="All registered users">
            <thead>
              <tr>
                <th>#</th>
                <th>Full Name</th>
                <th>Email Address</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user, index) => (
                  <tr key={user._id} className="table-row">
                    {/* Row number */}
                    <td className="row-num">{index + 1}</td>

                    {/* User avatar + name */}
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar" aria-hidden="true">
                          {user.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <span className="user-name">{user.full_name}</span>
                        {/* Highlight if this is the currently logged-in admin */}
                        {user._id === adminUser?._id && (
                          <span className="you-badge">You</span>
                        )}
                      </div>
                    </td>

                    {/* Email */}
                    <td className="email-cell">{user.email}</td>

                    {/* Role badge */}
                    <td><RoleBadge role={user.role} /></td>

                    {/* Formatted join date */}
                    <td className="date-cell">
                      {new Date(user.createdAt).toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })}
                    </td>

                    {/* Delete action */}
                    <td>
                      <button
                        id={`delete-user-${user._id}`}
                        className="btn-delete"
                        onClick={() => handleDeleteUser(user._id)}
                        disabled={deleting === user._id || user._id === adminUser?._id}
                        title={user._id === adminUser?._id ? "You cannot delete your own account" : "Delete user"}
                        aria-label={`Delete user ${user.full_name}`}
                      >
                        {deleting === user._id ? (
                          <span className="spinner-sm" />
                        ) : (
                          "🗑 Delete"
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  // ── Sidebar Navigation Config ───────────────────────────────────────────
  const navItems = [
    { id: "overview",        label: "Overview",         icon: "📊" },
    { id: "user-management", label: "User Management",  icon: "👥" },
  ];

  // ── Main Render ─────────────────────────────────────────────────────────
  return (
    <div className="admin-layout">

      {/* ── Sidebar ── */}
      <aside className="admin-sidebar" aria-label="Admin navigation">

        {/* Brand logo area */}
        <div className="sidebar-brand">
          <span className="brand-icon">🥦</span>
          <div className="brand-text">
            <span className="brand-name">NutriFit AI</span>
            <span className="brand-sub">Admin Panel</span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`sidebar-link ${activeTab === item.id ? "sidebar-link--active" : ""}`}
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? "page" : undefined}
            >
              <span className="sidebar-link__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Admin user info + logout at the bottom */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user__avatar">
              {adminUser?.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user__info">
              <span className="sidebar-user__name">{adminUser?.full_name}</span>
              <span className="sidebar-user__role">Administrator</span>
            </div>
          </div>
          <button
            id="admin-logout-btn"
            className="btn-logout"
            onClick={handleLogout}
            aria-label="Log out of admin panel"
          >
            ⏻ Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="admin-main" aria-label="Admin content">

        {/* Top header bar */}
        <header className="admin-topbar">
          <div>
            <h1 className="topbar-title">
              {navItems.find((n) => n.id === activeTab)?.icon}{" "}
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
            <p className="topbar-date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div className="topbar-badge">
            🛡 Admin
          </div>
        </header>

        {/* Dynamic section based on activeTab */}
        <div className="admin-content">
          {activeTab === "overview"        && renderOverview()}
          {activeTab === "user-management" && renderUserManagement()}
        </div>
      </main>

    </div>
  );
};

export default AdminDashboard;
