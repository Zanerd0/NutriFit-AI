import { Navigate } from "react-router-dom";

/**
 * ProtectedRoute - Renders children only if a user session exists in
 * localStorage, otherwise redirects the user to the login page.
 *
 * @param {object}         props          - Component props.
 * @param {React.ReactNode} props.children - The protected page component(s)
 *                                          to render if the user is logged in.
 * @returns {React.ReactNode} Either the child component tree or a <Navigate>
 *                            redirect to /login.
 */
const ProtectedRoute = ({ children }) => {
  // Attempt to parse the user object from localStorage.
  // JSON.parse returns null if the key doesn't exist or if stored value is "null".
  const user = JSON.parse(localStorage.getItem("user"));

  // If no user session is found, redirect immediately to the login page.
  // The `replace` prop replaces the current history entry so the user
  // cannot press the browser's Back button to return to the protected page.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // User session exists — render the requested protected page.
  return children;
};

export default ProtectedRoute;