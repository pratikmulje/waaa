import React from "react";

const MAP = {
  connected: { color: "bg-emerald-glow", label: "Connected", pulse: true, glow: true },
  connecting: { color: "bg-accent", label: "Connecting", pulse: true, glow: false },
  waiting_qr: { color: "bg-amber-glow", label: "Scan QR", pulse: true, glow: false },
  reconnecting: { color: "bg-amber-glow", label: "Reconnecting", pulse: true, glow: false },
  disconnected: { color: "bg-ink-faint", label: "Disconnected", pulse: false, glow: false },
  error: { color: "bg-red-400", label: "Error", pulse: false, glow: false },
};

export default function StatusDot({ status = "disconnected", showLabel = true }) {
  const cfg = MAP[status] || MAP.disconnected;

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2 shrink-0">
        {cfg.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.color} opacity-50`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${cfg.color} ${
            cfg.glow ? "connected-pulse" : ""
          }`}
        />
      </span>
      {showLabel && (
        <span className="text-xs font-medium text-ink-muted">{cfg.label}</span>
      )}
    </div>
  );
}
