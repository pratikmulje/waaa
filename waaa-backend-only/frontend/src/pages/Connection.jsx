import React from "react";
import { CheckCircle2, AlertTriangle, RotateCw, Wifi } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import QRCode from "../components/common/QRCode.jsx";
import { useConnection } from "../context/ConnectionContext.jsx";

export default function ConnectionPage() {
  const conn = useConnection();
  const status = conn?.status || "disconnected";

  return (
    <AppShell title="Connection">
      <div className="mx-auto max-w-sm">
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-8 text-center shadow-glass">

          {status === "connected" && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-glow/10 border border-emerald-glow/20">
                <CheckCircle2 className="h-7 w-7 text-emerald-glow" strokeWidth={1.75} />
              </div>
              <h2 className="font-display text-lg font-semibold text-ink">WhatsApp Connected</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Connected since{" "}
                {conn.connectedAt
                  ? new Date(conn.connectedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </p>
              <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-emerald-glow/15 bg-emerald-glow/8 px-4 py-3">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-glow opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-glow" />
                </span>
                <span className="text-sm text-emerald-glow font-medium">Receiving messages</span>
              </div>
            </>
          )}

          {status !== "connected" && conn?.qr && (
            <>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Scan to Connect</h2>
              <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-glass">
                <QRCode value={conn.qr} size={200} />
              </div>
              <p className="mt-5 text-sm text-ink-muted leading-relaxed">
                Open WhatsApp → Settings → Linked Devices → Link a Device
              </p>
            </>
          )}

          {status !== "connected" && !conn?.qr && !conn?.lastError && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised border border-surface-border">
                <RotateCw className="h-6 w-6 animate-spin text-ink-faint" strokeWidth={1.75} />
              </div>
              <p className="text-sm text-ink-muted">
                {status === "connecting" || status === "reconnecting"
                  ? "Connecting to WhatsApp…"
                  : "Waiting for QR code…"}
              </p>
            </>
          )}

          {conn?.lastError && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-7 w-7 text-red-400" strokeWidth={1.75} />
              </div>
              <p className="text-sm text-ink-muted">{conn.lastError}</p>
            </>
          )}

          {!conn?.apiReachable && (
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-left">
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="h-4 w-4 text-amber-glow shrink-0" strokeWidth={1.75} />
                <p className="text-xs font-semibold text-amber-glow">API Unreachable</p>
              </div>
              <p className="text-xs text-ink-muted">
                Start the backend with <code className="font-mono text-amber-glow">npm start</code> in the{" "}
                <code className="font-mono">waaa-backend-only</code> folder.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
