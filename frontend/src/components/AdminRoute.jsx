/**
 * @file AdminRoute.jsx
 * @description A client-side route guard component for admin-only pages.
 *
 * This component performs two client-side authorization checks in sequence:
 *
 *   1. Authentication — Is there any user in localStorage? If not, redirect
 *      to /login (the user is not logged in at all).
 *
 *   2. Authorization  — Does the logged-in user have role "Admin"? If not,
 *      redirect to /dashboard (the user is logged in but is NOT an admin).
 *
 * IMPORTANT NOTE ON SECURITY:
 * This client-side check is a UI convenience only (prevents unauthorized users
 * from seeing the admin UI). It is NOT a security boundary — the real security
 * is enforced by the `verifyToken` + `isAdmin` middleware on the backend.
 * Even if a malicious user bypassed this component, all API calls would still
 * return 403 Forbidden from the server.
 *
 * Usage in App.jsx:
 *   <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
 */

import { Navigate } from "react-router-dom";

/**
 * AdminRoute - Wraps a component to restrict access to Admin-role users only.
 *
 * @param {object}      props          - Component props.
 * @param {React.ReactNode} props.children - The protected component(s) to render.
 */
const AdminRoute = ({ children }) => {
  // Read the user object saved to localStorage during login
  const user = JSON.parse(localStorage.getItem("user"));

  // 1. No user at all — redirect to login page
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. User exists but isn't an Admin — redirect to the standard dashboard
  if (user.role !== "Admin") {
    return <Navigate to="/dashboard" replace />;
  }

  // 3. User is authenticated and has Admin role — render the protected page
  return children;
};

export default AdminRoute;
