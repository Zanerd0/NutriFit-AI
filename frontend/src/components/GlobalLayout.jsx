/**
 * @file GlobalLayout.jsx
 * @description Shared dashboard shell used by all roles. Lifts mobile sidebar
 * state so the Topbar hamburger and Sidebar off-canvas panel stay in sync.
 */

import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const GlobalLayout = ({
  layoutClassName,
  mainClassName,
  contentClassName,
  mainAriaLabel,
  sidebarClassName,
  sidebarAriaLabel,
  topbarClassName,
  topbarLeading,
  topbarTrailing,
  banner,
  sidebar,
  children,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleMobileSidebar = useCallback(
    () => setIsMobileSidebarOpen((open) => !open),
    []
  );

  const closeMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), []);

  const sidebarContent =
    typeof sidebar === "function"
      ? sidebar({ closeSidebar: closeMobileSidebar })
      : sidebar;

  return (
    <div className={layoutClassName}>
      {banner}

      <Sidebar
        className={sidebarClassName}
        ariaLabel={sidebarAriaLabel}
        isOpen={isMobileSidebarOpen}
        closeSidebar={closeMobileSidebar}
      >
        {sidebarContent}
      </Sidebar>

      <main className={mainClassName} aria-label={mainAriaLabel}>
        <Topbar
          className={topbarClassName}
          onToggleSidebar={toggleMobileSidebar}
          leading={topbarLeading}
          trailing={topbarTrailing}
        />
        <div className={contentClassName}>{children}</div>
      </main>
    </div>
  );
};

export default GlobalLayout;
