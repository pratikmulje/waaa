import React from "react";
import { Menu, Link } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";
import { Wordmark } from "./Sidebar.jsx";
import StatusDot from "../common/StatusDot.jsx";
import { useConnection } from "../../context/ConnectionContext.jsx";

export default function Topbar({ onMenuClick, title }) {
  const conn = useConnection();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-surface-border bg-surface/90 px-4 backdrop-blur-md lg:px-6">
      {/* Left: hamburger (mobile) + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="focus-ring rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* WAAA wordmark on mobile only */}
        <div className="lg:hidden">
          <Wordmark />
        </div>

        {/* Page title on desktop */}
        <h1 className="hidden font-display text-base font-semibold text-ink lg:block">
          {title}
        </h1>
      </div>

      {/* Right: connection status */}
      <div className="flex items-center gap-2">
        <RouterLink
          to="/connection"
          className="focus-ring hidden items-center gap-2 rounded-full border border-surface-border bg-surface-panel px-3.5 py-1.5 text-xs transition-colors hover:border-accent/25 sm:flex"
        >
          <StatusDot status={conn?.status} showLabel={false} />
          <span className="font-medium text-ink-muted">
            {conn?.status === "connected" ? "Connected" : conn?.status === "connecting" ? "Connecting…" : conn?.status === "waiting_qr" ? "Scan QR" : "Disconnected"}
          </span>
        </RouterLink>

        {/* Mobile status dot only */}
        <div className="sm:hidden">
          <StatusDot status={conn?.status} showLabel={false} />
        </div>
      </div>
    </header>
  );
}
