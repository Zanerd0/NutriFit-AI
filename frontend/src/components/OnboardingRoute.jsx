/**
 * @file OnboardingRoute.jsx
 * @description Route guard for the /onboarding page.
 *
 * Mirrors the pattern established by ConsumerRoute — it is a proper React
 * component (not an IIFE) so React re-evaluates the guard on every render,
 * including navigations that happen after the initial page load.
 *
 * Logic:
 *   1. No user in localStorage            → /login   (not authenticated)
 *   2. User role is not "Consumer"        → /login   (wrong role)
 *   3. Onboarding already complete        → /consumer (skip gate)
 *   4. New consumer, profile incomplete   → render <ConsumerOnboarding />
 *
 * Why a separate component instead of an inline IIFE in App.jsx?
 * ──────────────────────────────────────────────────────────────
 * React Router v6 evaluates the `element` prop expression once when the
 * parent <Routes> component renders. An IIFE used as `element` is therefore
 * stale — it cannot re-read localStorage after a navigate() call because it
 * never re-runs. A real component is re-invoked by React on every render,
 * which means the guard always reflects the current auth state.
 */

import { Navigate }          from "react-router-dom";
import ConsumerOnboarding    from "../pages/ConsumerOnboarding";

/**
 * isOnboardingComplete — Returns true when the stored user has the minimum
 * health metrics (age + weight) that the onboarding form collects.
 * Must stay in sync with the same helper in ConsumerRoute.jsx.
 *
 * @param {object} user
 * @returns {boolean}
 */
const isOnboardingComplete = (user) =>
  user.age != null && user.weight != null;

/**
 * OnboardingRoute — Guards the /onboarding page.
 * Renders <ConsumerOnboarding /> only for unonboarded Consumers.
 */
const OnboardingRoute = () => {
  // Read fresh from localStorage on every render — this is the key difference
  // from the IIFE approach: localStorage is always up-to-date here.
  const user = JSON.parse(localStorage.getItem("user"));

  // 1. Not logged in
  if (!user) return <Navigate to="/login" replace />;

  // 2. Wrong role (Admin / Dietician / Instructor somehow hit this route)
  if (user.role !== "Consumer") return <Navigate to="/login" replace />;

  // 3. Already completed onboarding — send them straight to the dashboard
  if (isOnboardingComplete(user)) return <Navigate to="/consumer" replace />;

  // 4. New consumer with incomplete profile — show the onboarding form
  return <ConsumerOnboarding />;
};

export default OnboardingRoute;
