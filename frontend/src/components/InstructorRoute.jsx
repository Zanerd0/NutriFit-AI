/**
 * @file InstructorRoute.jsx
 * @description A client-side route guard component for instructor-only pages.
 *
 * This component performs two client-side checks in sequence:
 *
 *   1. Authentication — Is there a user object in localStorage?
 *      If not, the user is not logged in → redirect to /login.
 *
 *   2. Authorization  — Does the user have the role "Instructor"?
 *      If not → redirect to /login.
 *
 * IMPORTANT — Security Note for Academic Defense:
 * ────────────────────────────────────────────────
 * Client-side guards are a UX convenience only. They prevent rendering the
 * Instructor UI to unauthorized users, but they are NOT a security boundary.
 * The real enforcement is server-side: every API call must pass through
 * `verifyToken` + `isInstructor` middleware. Even if an attacker modified the
 * localStorage object to spoof an "Instructor" role, all API calls would still
 * return a 403 Forbidden response from Express.
 *
 * Usage in App.jsx:
 *   <Route path="/instructor" element={<InstructorRoute><InstructorDashboard /></InstructorRoute>} />
 */

import { Navigate } from "react-router-dom";

/**
 * InstructorRoute — Wraps a component to restrict access to Instructor-role users.
 *
 * @param {object}          props          - Component props.
 * @param {React.ReactNode} props.children - The protected component(s) to render.
 */
const InstructorRoute = ({ children }) => {
  // Read the user object saved to localStorage during login
  const user = JSON.parse(localStorage.getItem("user"));

  // 1. No user at all → not logged in → send to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. User exists but their role is not "Instructor" → not authorized → send to login
  if (user.role !== "Instructor") {
    return <Navigate to="/login" replace />;
  }

  // 3. Authenticated AND authorized as Instructor → render the protected page
  return children;
};

export default InstructorRoute;
