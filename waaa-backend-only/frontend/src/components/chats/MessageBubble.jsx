import React from "react";
import { clockTime } from "../../utils/format.js";
import { RiskBadge, ImportanceBadge } from "../intelligence/ScoreBadges.jsx";

export default function MessageBubble({ message, onSelect }) {
  return (
    <button
      onClick={() => onSelect(message)}
      className="focus-ring w-full rounded-xl border border-surface-border bg-surface-panel/60 p-3.5 text-left transition-colors hover:border-white/15"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-muted">{message.sender}</span>
        <span className="text-[10px] text-ink-faint">{clockTime(message.createdAt || message.receivedAt)}</span>
      </div>
      <p className="text-sm leading-relaxed text-ink">{message.text}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <ImportanceBadge importanceAnalysis={message.importanceAnalysis} compact />
        <RiskBadge fraudAnalysis={message.fraudAnalysis} compact />
      </div>
    </button>
  );
}
