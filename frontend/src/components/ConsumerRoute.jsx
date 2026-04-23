/**
 * @file ConsumerRoute.jsx
 * @description A client-side route guard component for consumer-only pages.
 *
 * Performs three sequential checks before rendering the protected page:
 *
 *   1. Authentication  — Is there a user object in localStorage?
 *      If not → redirect to /login.
 *
 *   2. Authorization   — Does the user have the role "Consumer"?
 *      If not → redirect to /login.
 *
 *   3. Onboarding gate — Are the core health metrics (age, weight) present?
 *      If not → redirect to /onboarding so the user completes their profile
 *      before accessing the main dashboard.
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
 *   <Route path="/consumer" element={<ConsumerRoute><ConsumerDashboard /></ConsumerRoute>} />
 */

import { Navigate } from "react-router-dom";

/**
 * isOnboardingComplete - Returns true when the user document stored in
 * localStorage contains the minimum health metrics needed to use the dashboard.
 *
 * We check `age` AND `weight` as the canonical "is onboarded" signal because:
 *   - Both are required by the onboarding form.
 *   - Neither has a non-null default in the User schema, so null/undefined
 *     unambiguously means "form has not been submitted yet".
 *
 * @param {object} user - The user object from localStorage.
 * @returns {boolean}
 */
const isOnboardingComplete = (user) =>
  user.age != null && user.weight != null;

/**
 * ConsumerRoute — Wraps a page to restrict access to fully-onboarded Consumers.
 *
 * @param {object}          props          - Component props.
 * @param {React.ReactNode} props.children - The protected component(s) to render.
 */
const ConsumerRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem("user"));

  // 1. Not logged in at all
  if (!user)                    return <Navigate to="/login" replace />;

  // 2. Logged in but wrong role
  if (user.role !== "Consumer") return <Navigate to="/login" replace />;

  // 3. Correct role but onboarding not yet completed
  if (!isOnboardingComplete(user)) return <Navigate to="/onboarding" replace />;

  return children;
};

export default ConsumerRoute;
