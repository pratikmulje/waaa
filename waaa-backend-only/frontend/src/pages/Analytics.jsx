import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import AppShell from "../components/layout/AppShell.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import { SkeletonCard } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { getMessages } from "../api/messages.js";
import { BarChart3 } from "lucide-react";

const TOOLTIP_STYLE = {
  background: "#141A20",
  border: "1px solid #212A31",
  borderRadius: 10,
  fontSize: 12,
  color: "#E7EDF0",
};

const PIE_COLORS = ["#17E3A6", "#5FD4E8", "#8B7CF6", "#fbbf24"];

export default function Analytics() {
  const { data, error, loading, reload } = usePolling(() => getMessages({ limit: 300 }), { intervalMs: 15000 });
  const messages = data?.messages || [];

  const byDay = useMemo(() => {
    const map = {};
    messages.forEach((m) => {
      const d = m.createdAt || m.receivedAt;
      if (!d) return;
      const day = new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      map[day] = (map[day] || 0) + 1;
    });
    return Object.entries(map).map(([day, count]) => ({ day, count }));
  }, [messages]);

  const byType = useMemo(() => {
    const map = {};
    messages.forEach((m) => {
      map[m.chatType || "unknown"] = (map[m.chatType || "unknown"] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [messages]);

  const importanceDist = useMemo(() => {
    const map = { normal: 0, medium: 0, high: 0 };
    messages.forEach((m) => {
      const lvl = m.importanceAnalysis?.level || "normal";
      map[lvl] = (map[lvl] || 0) + 1;
    });
    return Object.entries(map).map(([level, count]) => ({ level, count }));
  }, [messages]);

  const riskDist = useMemo(() => {
    const map = { low: 0, medium: 0, high: 0, critical: 0 };
    messages.forEach((m) => {
      const lvl = m.fraudAnalysis?.riskLevel || "low";
      map[lvl] = (map[lvl] || 0) + 1;
    });
    return Object.entries(map).map(([level, count]) => ({ level, count }));
  }, [messages]);

  if (error) {
    return (
      <AppShell title="Analytics">
        <ErrorState message="Couldn't load analytics data." onRetry={reload} />
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Analytics">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </AppShell>
    );
  }

  if (messages.length === 0) {
    return (
      <AppShell title="Analytics">
        <EmptyState icon={BarChart3} title="No data to analyze yet" description="Charts will populate once WAAA has processed some messages." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Analytics">
      <p className="mb-6 text-sm text-ink-muted">Based on the last {messages.length} processed messages.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Message Activity">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={byDay}>
              <defs>
                <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#17E3A6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#17E3A6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#212A31" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" stroke="#5C6D77" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#5C6D77" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="count" stroke="#17E3A6" fill="url(#activityFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Chat Type Distribution">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Pie data={byType} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {byType.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <Legend items={byType.map((d, i) => ({ label: d.name, color: PIE_COLORS[i % PIE_COLORS.length] }))} />
        </Panel>

        <Panel title="Importance Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={importanceDist}>
              <CartesianGrid stroke="#212A31" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="level" stroke="#5C6D77" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#5C6D77" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="#8B7CF6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Risk Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={riskDist}>
              <CartesianGrid stroke="#212A31" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="level" stroke="#5C6D77" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#5C6D77" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="#f87171" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </AppShell>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      {children}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-3">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
