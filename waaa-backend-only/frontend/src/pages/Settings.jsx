import React, { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell.jsx";
import { useConnection } from "../context/ConnectionContext.jsx";
import StatusDot from "../components/common/StatusDot.jsx";

function useLocalToggle(key, initial = true) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? initial : stored === "true";
  });
  useEffect(() => localStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue];
}

function useLocalSlider(key, initial) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? initial : Number(stored);
  });
  useEffect(() => localStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue];
}

export default function Settings() {
  const conn = useConnection();
  const [fraudAlerts, setFraudAlerts] = useLocalToggle("waaa:notif:fraud", true);
  const [priorityAlerts, setPriorityAlerts] = useLocalToggle("waaa:notif:priority", true);
  const [importantAlerts, setImportantAlerts] = useLocalToggle("waaa:notif:important", true);
  const [priorityThreshold, setPriorityThreshold] = useLocalSlider("waaa:threshold:priority", 75);
  const [riskThreshold, setRiskThreshold] = useLocalSlider("waaa:threshold:risk", 60);

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-xl space-y-4">

        <Section title="Account">
          <Row label="Connection status">
            <StatusDot status={conn?.status} />
          </Row>
          <Row label="Connected since">
            <span className="text-sm text-ink-muted">
              {conn?.connectedAt ? new Date(conn.connectedAt).toLocaleString() : "—"}
            </span>
          </Row>
        </Section>

        <Section
          title="Notifications"
          hint="Stored locally in this browser."
        >
          <Toggle label="Fraud alerts" checked={fraudAlerts} onChange={setFraudAlerts} />
          <Toggle label="Priority chat alerts" checked={priorityAlerts} onChange={setPriorityAlerts} />
          <Toggle label="Important message alerts" checked={importantAlerts} onChange={setImportantAlerts} />
        </Section>

        <Section
          title="Intelligence Thresholds"
          hint="Adjusts UI display only — does not change backend scoring."
        >
          <Slider label="Priority threshold" value={priorityThreshold} onChange={setPriorityThreshold} />
          <Slider label="Risk display threshold" value={riskThreshold} onChange={setRiskThreshold} />
        </Section>

        <Section title="Appearance">
          <Row label="Theme">
            <span className="rounded-lg border border-surface-border bg-surface-raised px-3 py-1.5 text-sm text-ink-muted">
              Dark (fixed)
            </span>
          </Row>
        </Section>

        <div className="pt-1 text-center">
          <p className="text-[11px] text-ink-faint">WAAA · Local instance · v0.1</p>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5">
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <Row label={label}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`focus-ring relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-accent/60" : "bg-surface-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </Row>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="font-mono text-xs text-accent">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent h-1.5"
      />
    </div>
  );
}
