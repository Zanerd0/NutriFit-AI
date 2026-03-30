/**
 * @file DieticianRoute.jsx
 * @description A client-side route guard component for dietician-only pages.
 *
 * This component performs two client-side checks in sequence:
 *
 *   1. Authentication — Is there a user object in localStorage?
 *      If not, the user is not logged in → redirect to /login.
 *
 *   2. Authorization  — Does the user have the role "Dietician"?
 *      If not (e.g., Consumer or Admin trying to access) → redirect to /login.
 *
 * IMPORTANT — Security Note for Academic Defense:
 * ────────────────────────────────────────────────
 * Client-side guards are a UX convenience only. They prevent rendering the
 * Dietician UI to unauthorized users, but they are NOT a security boundary.
 * The real enforcement is on the server: every API call must pass through
 * `verifyToken` + `isDietician` middleware. Even if an attacker modified the
 * localStorage object to spoof a "Dietician" role, every API call would still
 * return a 403 Forbidden response from Express.
 *
 * Usage in App.jsx:
 *   <Route path="/dietician" element={<DieticianRoute><DieticianDashboard /></DieticianRoute>} />
 */

import { Navigate } from "react-router-dom";

/**
 * DieticianRoute — Wraps a component to restrict access to Dietician-role users.
 *
 * @param {object}         props          - Component props.
 * @param {React.ReactNode} props.children - The protected component(s) to render.
 */
const DieticianRoute = ({ children }) => {
  // Read the user object saved to localStorage during login
  const user = JSON.parse(localStorage.getItem("user"));

  // 1. No user at all → not logged in → send to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. User exists but their role is not "Dietician" → not authorized → send to login
  //    (We redirect to /login rather than /dashboard to avoid leaking route existence)
  if (user.role !== "Dietician") {
    return <Navigate to="/login" replace />;
  }

  // 3. Authenticated AND authorized as Dietician → render the protected page
  return children;
};

export default DieticianRoute;
