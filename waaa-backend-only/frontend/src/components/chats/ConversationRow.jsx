import React from "react";
import { Users, Radio, Hash } from "lucide-react";
import { timeAgo, chatTypeLabel } from "../../utils/format.js";

const TYPE_ICON = { group: Users, community: Users, channel: Radio, personal: Hash };

export default function ConversationRow({ conv, active, onClick }) {
  const Icon = TYPE_ICON[conv.chatType] || Hash;
  const initials = (conv.chatName || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all duration-150 border focus:outline-none ${
        active
          ? "border-accent/25 bg-accent/8 shadow-glow-sm"
          : "border-transparent hover:bg-surface-hover"
      }`}
    >
      {/* Avatar */}
      <div
        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
          active ? "bg-accent/20 text-accent" : "bg-surface-border text-ink-faint"
        }`}
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-sm font-medium text-ink">{conv.chatName}</p>
          <span className="shrink-0 text-[10px] text-ink-faint ml-2">{timeAgo(conv.lastMessageAt)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {conv.lastMessage || "No messages yet"}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-faint">
          <Icon className="h-3 w-3" strokeWidth={1.75} />
          <span>{chatTypeLabel(conv.chatType)}</span>
          {conv.participantCount ? <span>· {conv.participantCount}</span> : null}
        </div>
      </div>
    </button>
  );
}