import React from "react";
import { NavLink, Link } from "react-router-dom";
import {
  MessageSquare,
  Flame,
  CheckSquare,
  Clock,
  Bell,
  Search,
  Settings,
  Radio,
  BrainCircuit,
  X,
  Zap,
} from "lucide-react";
import { useConnection } from "../../context/ConnectionContext.jsx";
import StatusDot from "../common/StatusDot.jsx";

const NAV_MAIN = [
  { to: "/chats", icon: MessageSquare, label: "Chats" },
  { to: "/important", icon: Flame, label: "Important" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/deadlines", icon: Clock, label: "Deadlines" },
  { to: "/alerts", icon: Bell, label: "Alerts" },
  { to: "/assistant", icon: Zap, label: "Ask WAAA" },
];

const NAV_SYSTEM = [
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/connection", icon: Radio, label: "Connection" },
];

export default function Sidebar({ open, onClose }) {
  const conn = useConnection();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-surface-border bg-surface-raised transition-transform duration-200 ease-smooth lg:static lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-surface-border">
        <Wordmark />
        <button
          onClick={onClose}
          className="focus-ring rounded-lg p-1.5 text-ink-faint hover:text-ink lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
          Intelligence
        </p>
        {NAV_MAIN.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `nav-item focus-ring ${isActive ? "nav-active" : ""}`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="my-3 border-t border-surface-border" />

        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
          System
        </p>
        {NAV_SYSTEM.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `nav-item focus-ring ${isActive ? "nav-active" : ""}`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Connection status footer */}
      <div className="px-4 py-4 border-t border-surface-border">
        <Link
          to="/connection"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-hover"
        >
          <StatusDot status={conn?.status} showLabel={false} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink truncate">
              WhatsApp
            </p>
            <p className="text-[10px] text-ink-faint capitalize">
              {conn?.status || "disconnected"}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-violet-glow/10 border border-accent/20">
        <BrainCircuit className="h-4 w-4 text-accent" strokeWidth={2} />
      </div>
      <div className="leading-none">
        <p className="font-display text-base font-semibold tracking-tight text-ink">
          WAAA
        </p>
        <p className="text-[9px] font-medium tracking-widest text-ink-faint uppercase">
          Intelligence
        </p>
      </div>
    </div>
  );
}
