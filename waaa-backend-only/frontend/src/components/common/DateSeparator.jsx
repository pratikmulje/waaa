import React from "react";

/**
 * DateSeparator — shows a date label between groups of messages.
 * @param {string} label - e.g. "Today", "Yesterday", "September 9, 2026"
 */
export default function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 py-3 animate-fade-in">
      <div className="h-px flex-1 bg-surface-border" />
      <span className="shrink-0 rounded-full border border-surface-border bg-surface-raised px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
        {label}
      </span>
      <div className="h-px flex-1 bg-surface-border" />
    </div>
  );
}

/**
 * Returns a human-readable date label for a given ISO string.
 */
export function getDateLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const sameDay = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: undefined,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Groups an array of messages into segments separated by date.
 * Each segment: { dateLabel: string, messages: Message[] }
 */
export function groupMessagesByDate(messages) {
  const groups = [];
  let currentLabel = null;
  let currentGroup = [];

  for (const msg of messages) {
    const ts = msg.createdAt || msg.receivedAt;
    const label = getDateLabel(ts);

    if (label !== currentLabel) {
      if (currentGroup.length > 0) {
        groups.push({ dateLabel: currentLabel, messages: currentGroup });
      }
      currentLabel = label;
      currentGroup = [msg];
    } else {
      currentGroup.push(msg);
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ dateLabel: currentLabel, messages: currentGroup });
  }

  return groups;
}
