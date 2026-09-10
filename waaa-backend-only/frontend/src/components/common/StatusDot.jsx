import React from "react";

const MAP = {
  connected: { color: "bg-emerald-glow", label: "Connected", pulse: true },
  connecting: { color: "bg-cyan-glow", label: "Connecting", pulse: true },
  waiting_qr: { color: "bg-amber-400", label: "Scan QR", pulse: true },
  reconnecting: { color: "bg-amber-400", label: "Reconnecting", pulse: true },
  disconnected: { color: "bg-ink-faint", label: "Disconnected", pulse: false },
  error: { color: "bg-red-400", label: "Error", pulse: false },
};

export default function StatusDot({ status = "disconnected", showLabel = true }) {
  const cfg = MAP[status] || MAP.disconnected;

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        {cfg.pulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.color} opacity-60`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${cfg.color}`} />
      </span>
      {showLabel && <span className="text-xs font-medium text-ink-muted">{cfg.label}</span>}
    </div>
  );
}
