/**
 * @file ConsumerRoute.jsx
 * @description A client-side route guard component for consumer-only pages.
 *
 * This component performs two client-side checks in sequence:
 *
 *   1. Authentication — Is there a user object in localStorage?
 *      If not → redirect to /login.
 *
 *   2. Authorization  — Does the user have the role "Consumer"?
 *      If not → redirect to /login.
 *
 * IMPORTANT — Security Note for Academic Defense:
 * ────────────────────────────────────────────────
 * Client-side guards are a UX convenience only. They are NOT a security
 * boundary. The real enforcement is server-side: every API call must pass
 * through `verifyToken` + `isConsumer` middleware on the Express backend.
 * Even if a malicious actor spoofs localStorage, all API calls still return
 * 403 Forbidden from the server.
 *
 * Usage in App.jsx:
 *   <Route path="/dashboard" element={<ConsumerRoute><ConsumerDashboard /></ConsumerRoute>} />
 */

import { Navigate } from "react-router-dom";

/**
 * ConsumerRoute — Wraps a component to restrict access to Consumer-role users.
 *
 * @param {object}          props          - Component props.
 * @param {React.ReactNode} props.children - The protected component(s) to render.
 */
const ConsumerRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user)                        return <Navigate to="/login" replace />;
  if (user.role !== "Consumer")     return <Navigate to="/login" replace />;

  return children;
};

export default ConsumerRoute;
