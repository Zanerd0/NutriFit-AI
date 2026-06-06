/**
 * @file Topbar.jsx
 * @description Shared dashboard top bar with a mobile-only hamburger menu trigger.
 */

import "./Topbar.css";

const Topbar = ({ className = "", onToggleSidebar, leading, trailing }) => (
  <header className={className}>
    <div className="topbar-leading">
      <button
        type="button"
        className="sidebar-hamburger"
        onClick={onToggleSidebar}
        aria-label="Open navigation menu"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"
          />
        </svg>
      </button>
      {leading}
    </div>
    {trailing}
  </header>
);

export default Topbar;
