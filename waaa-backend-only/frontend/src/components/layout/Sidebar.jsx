import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Star,
  MessagesSquare,
  Flame,
  ShieldAlert,
  BrainCircuit,
  Sparkles,
  BarChart3,
  Settings,
  Radio,
  X,
} from "lucide-react";

const NAV = [
  {
    heading: "Overview",
    items: [{ to: "/", icon: LayoutDashboard, label: "Dashboard", end: true }],
  },
  {
    heading: "Conversations",
    items: [
      { to: "/priority", icon: Star, label: "Priority Chats" },
      { to: "/chats", icon: MessagesSquare, label: "All Chats" },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { to: "/important", icon: Flame, label: "Important Messages" },
      { to: "/fraud", icon: ShieldAlert, label: "Fraud Center" },
      { to: "/assistant", icon: Sparkles, label: "AI Assistant" },
    ],
  },
  {
    heading: "Insights",
    items: [{ to: "/analytics", icon: BarChart3, label: "Analytics" }],
  },
  {
    heading: "System",
    items: [
      { to: "/settings", icon: Settings, label: "Settings" },
      { to: "/connection", icon: Radio, label: "Connection" },
    ],
  },
];

export default function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-surface-border bg-surface-raised/95 backdrop-blur transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Wordmark />
          <button onClick={onClose} className="focus-ring rounded-lg p-1 text-ink-faint hover:text-ink lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {NAV.map((section) => (
            <div key={section.heading}>
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `focus-ring group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "bg-emerald-500/10 text-emerald-glow ring-1 ring-emerald-500/20"
                          : "text-ink-muted hover:bg-white/5 hover:text-ink"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-surface-border px-5 py-4">
          <p className="text-[11px] text-ink-faint">WAAA v0.1 · local instance</p>
        </div>
      </aside>
    </>
  );
}

export function Wordmark({ size = "md" }) {
  const textSize = size === "sm" ? "text-lg" : "text-xl";
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 ring-1 ring-emerald-500/30">
        <BrainCircuit className="h-4 w-4 text-emerald-glow" strokeWidth={2} />
      </div>
      <div className="leading-none">
        <p className={`font-display font-semibold tracking-tight text-ink ${textSize}`}>WAAA</p>
        <p className="text-[10px] font-medium tracking-wide text-ink-faint">WhatsApp AI &amp; Awareness</p>
      </div>
    </div>
  );
}
