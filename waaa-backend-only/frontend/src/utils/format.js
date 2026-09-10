export function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const RISK_COLORS = {
  critical: { text: "text-red-400", bg: "bg-red-500/15", ring: "ring-red-500/30", bar: "#f87171" },
  high: { text: "text-orange-400", bg: "bg-orange-500/15", ring: "ring-orange-500/30", bar: "#fb923c" },
  medium: { text: "text-amber-400", bg: "bg-amber-500/15", ring: "ring-amber-500/30", bar: "#fbbf24" },
  low: { text: "text-emerald-glow", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", bar: "#17E3A6" },
};

export const IMPORTANCE_COLORS = {
  high: { text: "text-violet-glow", bg: "bg-violet-500/15", ring: "ring-violet-500/30", bar: "#8B7CF6" },
  medium: { text: "text-cyan-glow", bg: "bg-cyan-500/15", ring: "ring-cyan-500/30", bar: "#5FD4E8" },
  normal: { text: "text-ink-muted", bg: "bg-white/5", ring: "ring-white/10", bar: "#5C6D77" },
};

export const PRIORITY_COLORS = {
  critical: { text: "text-red-400", bg: "bg-red-500/15", ring: "ring-red-500/30", dot: "#f87171" },
  high: { text: "text-orange-400", bg: "bg-orange-500/15", ring: "ring-orange-500/30", dot: "#fb923c" },
  medium: { text: "text-amber-400", bg: "bg-amber-500/15", ring: "ring-amber-500/30", dot: "#fbbf24" },
  low: { text: "text-cyan-glow", bg: "bg-cyan-500/10", ring: "ring-cyan-500/20", dot: "#5FD4E8" },
  normal: { text: "text-ink-faint", bg: "bg-white/5", ring: "ring-white/10", dot: "#5C6D77" },
};

export const PRIORITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  normal: "Normal",
};

export function chatTypeLabel(type) {
  return { personal: "Personal", group: "Group", community: "Community", channel: "Channel" }[type] || "Unknown";
}