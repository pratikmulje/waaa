import React from "react";
import { Star, Users, Radio, Hash } from "lucide-react";
import { timeAgo, chatTypeLabel, PRIORITY_COLORS } from "../../utils/format.js";

const TYPE_ICON = { group: Users, community: Users, channel: Radio, personal: Hash };

export default function ConversationRow({ conv, active, onClick }) {
  const Icon = TYPE_ICON[conv.chatType] || Hash;
  const level = conv.priorityLevel || "normal";
  const priorityColor = PRIORITY_COLORS[level]?.dot;

  return (
    <button
      onClick={onClick}
      className={`focus-ring flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
        active ? "border-emerald-500/30 bg-emerald-500/5" : "border-transparent hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
        <Icon className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink">{conv.chatName}</p>
          {conv.priority && (
            <Star className="h-3 w-3 shrink-0 fill-current" style={{ color: priorityColor }} />
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">{conv.lastMessage || "No messages yet"}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-faint">
          <span>{chatTypeLabel(conv.chatType)}</span>
          {conv.participantCount ? <span>· {conv.participantCount} members</span> : null}
        </div>
      </div>

      <span className="shrink-0 text-[10px] text-ink-faint">{timeAgo(conv.lastMessageAt)}</span>
    </button>
  );
}