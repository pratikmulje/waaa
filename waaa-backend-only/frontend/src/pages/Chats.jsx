import React, { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Search, MessageSquare, Star, Sparkles, Users, Hash, Radio } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import IntelligenceDrawer from "../components/intelligence/IntelligenceDrawer.jsx";
import SummaryPanel from "../components/intelligence/SummaryPanel.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import DateSeparator, { groupMessagesByDate } from "../components/common/DateSeparator.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { useSSE } from "../hooks/useSSE.js";
import { getConversations, getConversationMessages } from "../api/conversations.js";
import { setChatPriorityLevel } from "../api/chats.js";
import { summarizeChat } from "../api/ai.js";
import { clockTime, timeAgo, chatTypeLabel, PRIORITY_COLORS } from "../utils/format.js";
import { useToast } from "../context/ToastContext.jsx";
import PriorityLevelSelect from "../components/common/PriorityLevelSelect.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "personal", label: "Personal" },
  { key: "group", label: "Group" },
  { key: "community", label: "Community" },
  { key: "channel", label: "Channel" },
];

const TYPE_ICON = { group: Users, community: Users, channel: Radio, personal: Hash };

function ConvRow({ conv, active, onClick }) {
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

function MsgBubble({ message, onSelect }) {
  const isSelf = message.fromMe === true;
  const time = clockTime(message.createdAt || message.receivedAt);

  return (
    <button
      onClick={() => onSelect(message)}
      className={`w-full text-left focus:outline-none group animate-slide-up ${
        isSelf ? "flex flex-col items-end" : ""
      }`}
    >
      <div className={`max-w-[80%] ${isSelf ? "" : ""}`}>
        <div className={`flex items-baseline gap-2 mb-1 ${isSelf ? "justify-end" : ""}`}>
          {!isSelf && (
            <span className="text-[11px] font-semibold text-ink-muted">{message.sender}</span>
          )}
          <span className="text-[10px] text-ink-faint">{time}</span>
          {isSelf && (
            <span className="text-[11px] font-semibold text-ink-muted">You</span>
          )}
        </div>
        <div className={isSelf ? "bubble-user text-left" : "bubble-waaa"}>
          <p className="text-sm leading-relaxed">{message.text}</p>
        </div>
        {/* Importance / risk badges (if present) */}
        {(message.importanceAnalysis?.level === "high" || (message.fraudAnalysis?.riskScore ?? 0) >= 60) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.importanceAnalysis?.level === "high" && (
              <span className="rounded-full bg-violet-glow/10 px-2 py-0.5 text-[9px] font-semibold text-violet-glow ring-1 ring-violet-glow/20">
                Important
              </span>
            )}
            {(message.fraudAnalysis?.riskScore ?? 0) >= 60 && (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-400 ring-1 ring-red-500/20">
                Risk
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

export default function Chats({ priorityOnly = false }) {
  const location = useLocation();
  const toast = useToast();
  const messagesEndRef = useRef(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedChatId, setSelectedChatId] = useState(location.state?.chatId || null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [summaryState, setSummaryState] = useState(null);

  const params = useMemo(() => {
    const p = { limit: 200 };
    if (typeFilter !== "all") p.type = typeFilter;
    if (search) p.search = search;
    if (priorityOnly) p.priorityOnly = "true";
    return p;
  }, [typeFilter, search, priorityOnly]);

  const { data, error, loading, reload } = usePolling(
    () => getConversations(params),
    { intervalMs: 8000, deps: [JSON.stringify(params)] }
  );

  const conversations = data?.conversations || [];
  const selected = conversations.find((c) => c.chatId === selectedChatId) || conversations[0];

  const { data: msgData, error: msgError, loading: msgLoading, reload: reloadMessages } = usePolling(
    () => selected ? getConversationMessages(selected.chatId, 100) : Promise.resolve({ messages: [] }),
    { intervalMs: 8000, deps: [selected?.chatId] }
  );

  useSSE("/messages/stream", "message", (msg) => {
    if (msg.chatId === selected?.chatId) reloadMessages();
    reload();
  });

  // Auto-scroll when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgData]);

  async function runSummarize(chatId) {
    setSummaryState({ loading: true, error: null, summary: null, messageCount: 0 });
    try {
      const res = await summarizeChat(chatId);
      setSummaryState({ loading: false, error: null, summary: res.summary, messageCount: res.messageCount });
    } catch (err) {
      setSummaryState({
        loading: false,
        error: err.status === 503 ? "not_configured" : "failed",
        summary: null,
        messageCount: 0,
      });
    }
  }

  async function changePriorityLevel(conv, level) {
    try {
      await setChatPriorityLevel(conv.chatId, level);
      toast.push(`Priority updated`, "success");
      reload();
    } catch {
      toast.push("Couldn't update priority.", "error");
    }
  }

  const messages = msgData?.messages || [];
  const groups = groupMessagesByDate(messages);

  return (
    <AppShell title={priorityOnly ? "Priority Chats" : "All Chats"}>
      <div className="grid h-[calc(100vh-8rem)] gap-3 lg:grid-cols-[280px_1fr]">

        {/* ── Conversation List ─────────────────── */}
        <div className="flex flex-col rounded-2xl border border-surface-border bg-surface-panel overflow-hidden">
          {/* Search + filters */}
          <div className="shrink-0 p-3 border-b border-surface-border space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats…"
                className="focus-ring w-full rounded-xl border border-surface-border bg-surface-raised py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint"
              />
            </div>
            {!priorityOnly && (
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setTypeFilter(f.key)}
                    className={`focus-ring shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      typeFilter === f.key
                        ? "bg-accent/12 text-accent ring-1 ring-accent/25"
                        : "text-ink-faint hover:bg-surface-hover"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {error && <ErrorState message="Couldn't load conversations." onRetry={reload} />}
            {!error && loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            {!error && !loading && conversations.length === 0 && (
              <EmptyState
                icon={priorityOnly ? Star : MessageSquare}
                title={priorityOnly ? "No priority chats" : "No conversations yet"}
                description="Conversations appear here once WhatsApp is connected."
              />
            )}
            {!error &&
              conversations.map((conv) => (
                <ConvRow
                  key={conv.chatId}
                  conv={conv}
                  active={selected?.chatId === conv.chatId}
                  onClick={() => setSelectedChatId(conv.chatId)}
                />
              ))}
          </div>
        </div>

        {/* ── Message Detail ────────────────────── */}
        <div className="flex flex-col rounded-2xl border border-surface-border bg-surface-panel overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-10">
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                description="Pick a chat from the list to see its messages."
              />
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="shrink-0 flex items-center justify-between border-b border-surface-border px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{selected.chatName}</p>
                  <p className="text-xs text-ink-faint">
                    {chatTypeLabel(selected.chatType)}
                    {selected.participantCount ? ` · ${selected.participantCount} members` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => runSummarize(selected.chatId)}
                    className="focus-ring flex items-center gap-1.5 rounded-xl border border-accent/20 bg-accent/8 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Summarize
                  </button>
                  <PriorityLevelSelect
                    value={selected.priorityLevel || "normal"}
                    onChange={(level) => changePriorityLevel(selected, level)}
                  />
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {msgError ? (
                  <ErrorState message="Couldn't load messages." onRetry={reloadMessages} />
                ) : msgLoading && !msgData ? (
                  Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
                ) : messages.length === 0 ? (
                  <EmptyState icon={MessageSquare} title="No messages" description="Messages will appear here as WAAA processes them." />
                ) : (
                  groups.map((group) => (
                    <React.Fragment key={group.dateLabel}>
                      <DateSeparator label={group.dateLabel} />
                      {group.messages.map((m) => (
                        <MsgBubble key={m.id} message={m} onSelect={setSelectedMessage} />
                      ))}
                    </React.Fragment>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}
        </div>
      </div>

      {selectedMessage && (
        <IntelligenceDrawer message={selectedMessage} onClose={() => setSelectedMessage(null)} />
      )}
      {summaryState && (
        <SummaryPanel
          chatName={selected?.chatName}
          loading={summaryState.loading}
          error={summaryState.error}
          summary={summaryState.summary}
          messageCount={summaryState.messageCount}
          onClose={() => setSummaryState(null)}
          onRetry={() => runSummarize(selected.chatId)}
        />
      )}
    </AppShell>
  );
}
