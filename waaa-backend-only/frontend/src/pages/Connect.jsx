import React, { useState } from "react";
import { QrCode, Smartphone, RotateCw, CheckCircle2, AlertTriangle } from "lucide-react";
import QRCode from "../components/common/QRCode.jsx";
import { Wordmark } from "../components/layout/Sidebar.jsx";
import { useConnection } from "../context/ConnectionContext.jsx";

export default function Connect() {
  const conn = useConnection();
  const [tab, setTab] = useState("qr");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface bg-grid-fade px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>

        <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface-panel shadow-panel">
          <div className="flex border-b border-surface-border">
            <TabButton active={tab === "qr"} onClick={() => setTab("qr")} icon={QrCode} label="QR Code" />
            <TabButton active={tab === "phone"} onClick={() => setTab("phone")} icon={Smartphone} label="Phone Number" />
          </div>

          <div className="p-6">{tab === "qr" ? <QRPanel conn={conn} /> : <PhonePanel />}</div>
        </div>

        {!conn?.apiReachable && (
          <p className="mt-4 text-center text-xs text-amber-400">
            Can't reach the WAAA API. Is <code className="font-mono">npm run api</code> running?
          </p>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`focus-ring flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
        active ? "bg-white/5 text-ink" : "text-ink-faint hover:text-ink-muted"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function QRPanel({ conn }) {
  const status = conn?.status || "disconnected";

  if (status === "connected") {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-glow" />
        <p className="font-display text-base font-semibold text-ink">WhatsApp connected</p>
        <p className="mt-1 text-sm text-ink-muted">WAAA is now reading your messages in real time.</p>
      </div>
    );
  }

  if (status === "error" || conn?.lastError) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
        <p className="font-display text-base font-semibold text-ink">Connection failed</p>
        <p className="mt-1 text-sm text-ink-muted">{conn.lastError || "Something interrupted the connection."}</p>
        <p className="mt-4 text-xs text-ink-faint">Restart the backend (<code className="font-mono">npm start</code>) to get a fresh QR code.</p>
      </div>
    );
  }

  if (conn?.qr) {
    return (
      <div className="flex flex-col items-center">
        <div className="rounded-xl bg-white p-3">
          <QRCode value={conn.qr} size={220} />
        </div>
        <p className="mt-4 text-center text-sm text-ink-muted">
          WhatsApp → Settings → Linked Devices → Link a Device
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
          <RotateCw className="h-3 w-3 animate-spin" /> Waiting for scan…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <RotateCw className="mb-3 h-6 w-6 animate-spin text-ink-faint" />
      <p className="text-sm text-ink-muted">
        {status === "connecting" || status === "reconnecting" ? "Connecting to WhatsApp…" : "Waiting for QR code…"}
      </p>
      <p className="mt-1 text-xs text-ink-faint">Start the backend with <code className="font-mono">npm start</code> if this doesn't change.</p>
    </div>
  );
}

function PhonePanel() {
  return (
    <div className="py-4">
      <div className="space-y-3 opacity-50">
        <div className="flex gap-2">
          <input disabled placeholder="+1" className="w-16 rounded-lg border border-surface-border bg-surface-raised px-2 py-2 text-sm text-ink" />
          <input disabled placeholder="Phone number" className="flex-1 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink" />
        </div>
        <button disabled className="w-full rounded-lg bg-white/10 py-2 text-sm font-medium text-ink-faint">
          Continue
        </button>
      </div>
      <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-400 ring-1 ring-amber-500/20">
        Phone number connection is coming soon. Use QR code for now.
      </p>
    </div>
  );
}
