import React from "react";
import { CheckCircle2, AlertTriangle, RotateCw } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import QRCode from "../components/common/QRCode.jsx";
import { useConnection } from "../context/ConnectionContext.jsx";

// Dedicated in-app version of the Connect screen (sidebar -> System -> Connection),
// for reconnecting/checking status without leaving the app shell.
export default function ConnectionPage() {
  const conn = useConnection();
  const status = conn?.status || "disconnected";

  return (
    <AppShell title="Connection">
      <div className="mx-auto max-w-md rounded-2xl border border-surface-border bg-surface-panel p-6 text-center shadow-panel">
        {status === "connected" && (
          <>
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-glow" />
            <p className="font-display text-base font-semibold text-ink">WhatsApp connected</p>
            <p className="mt-1 text-sm text-ink-muted">
              Connected since {conn.connectedAt ? new Date(conn.connectedAt).toLocaleString() : "—"}
            </p>
          </>
        )}

        {status !== "connected" && conn?.qr && (
          <>
            <div className="mx-auto w-fit rounded-xl bg-white p-3">
              <QRCode value={conn.qr} size={200} />
            </div>
            <p className="mt-4 text-sm text-ink-muted">WhatsApp → Settings → Linked Devices → Link a Device</p>
          </>
        )}

        {status !== "connected" && !conn?.qr && !conn?.lastError && (
          <>
            <RotateCw className="mx-auto mb-3 h-6 w-6 animate-spin text-ink-faint" />
            <p className="text-sm text-ink-muted">
              {status === "connecting" || status === "reconnecting" ? "Connecting to WhatsApp…" : "Waiting for QR code…"}
            </p>
          </>
        )}

        {conn?.lastError && (
          <>
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
            <p className="text-sm text-ink-muted">{conn.lastError}</p>
          </>
        )}

        {!conn?.apiReachable && (
          <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400 ring-1 ring-amber-500/20">
            Can't reach the WAAA API (<code className="font-mono">npm run api</code>).
          </p>
        )}
      </div>
    </AppShell>
  );
}
