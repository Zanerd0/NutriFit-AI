/**
 * @file Sidebar.jsx
 * @description Shared sidebar wrapper with mobile off-canvas behaviour and overlay.
 */

import "./Sidebar.css";

const Sidebar = ({ className = "", ariaLabel, isOpen, closeSidebar, children }) => (
  <>
    {isOpen && (
      <div
        className="sidebar-overlay"
        onClick={closeSidebar}
        aria-hidden="true"
      />
    )}
    <aside
      className={`app-sidebar ${className}${isOpen ? " sidebar-open" : ""}`}
      aria-label={ariaLabel}
    >
      {children}
    </aside>
  </>
);

export default Sidebar;
