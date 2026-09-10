import React, { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Search, Star, MessagesSquare, Sparkles } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import ConversationRow from "../components/chats/ConversationRow.jsx";
import MessageBubble from "../components/chats/MessageBubble.jsx";
import IntelligenceDrawer from "../components/intelligence/IntelligenceDrawer.jsx";
import SummaryPanel from "../components/intelligence/SummaryPanel.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import ErrorState from "../components/common/ErrorState.jsx";
import { SkeletonRow } from "../components/common/Skeleton.jsx";
import { usePolling } from "../hooks/usePolling.js";
import { useSSE } from "../hooks/useSSE.js";
import { getConversations, getConversationMessages } from "../api/conversations.js";
import { setChatPriorityLevel } from "../api/chats.js";
import { PRIORITY_LABELS } from "../utils/format.js";
import PriorityLevelSelect from "../components/common/PriorityLevelSelect.jsx"; import { summarizeChat } from "../api/ai.js";
import { useToast } from "../context/ToastContext.jsx";


const FILTERS = [
  { key: "all", label: "All" },
  { key: "personal", label: "Personal" },
  { key: "group", label: "Group" },
  { key: "community", label: "Community" },
  { key: "channel", label: "Channel" },
];

export default function Chats({ priorityOnly = false }) {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedChatId, setSelectedChatId] = useState(location.state?.chatId || null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [summaryState, setSummaryState] = useState(null); // { loading, error, summary, messageCount }
  const toast = useToast();

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

  const params = useMemo(() => {
    const p = { limit: 200 };
    if (typeFilter !== "all") p.type = typeFilter;
    if (search) p.search = search;
    if (priorityOnly) p.priorityOnly = "true";
    return p;
  }, [typeFilter, search, priorityOnly]);

  const { data, error, loading, reload } = usePolling(() => getConversations(params), {
    intervalMs: 8000,
    deps: [JSON.stringify(params)],
  });

  const conversations = data?.conversations || [];
  const selected = conversations.find((c) => c.chatId === selectedChatId) || conversations[0];

  const {
    data: msgData,
    error: msgError,
    loading: msgLoading,
    reload: reloadMessages,
  } = usePolling(
    () => (selected ? getConversationMessages(selected.chatId, 100) : Promise.resolve({ messages: [] })),
    { intervalMs: 8000, deps: [selected?.chatId] }
  );

  useSSE("/messages/stream", "message", (msg) => {
    if (msg.chatId === selected?.chatId) reloadMessages();
    reload();
  });

  async function changePriorityLevel(conv, level) {
    try {
      await setChatPriorityLevel(conv.chatId, level);
      toast.push(`${conv.chatName} priority set to ${PRIORITY_LABELS[level]}`, "success");
      reload();
    } catch {
      toast.push("Couldn't update priority — check the API server.", "error");
    }
  }
  return (
    <AppShell title={priorityOnly ? "Priority Chats" : "All Chats"}>
      <div className="grid gap-4 lg:h-[calc(100vh-8rem)] lg:grid-cols-[340px_1fr]">
        {/* LIST */}
        <div className="flex flex-col rounded-2xl border border-surface-border bg-surface-panel/40 lg:overflow-hidden">
          <div className="border-b border-surface-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats…"
                className="focus-ring w-full rounded-lg border border-surface-border bg-surface-raised py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint"
              />
            </div>
            {!priorityOnly && (
              <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setTypeFilter(f.key)}
                    className={`focus-ring shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${typeFilter === f.key ? "bg-emerald-500/15 text-emerald-glow" : "text-ink-faint hover:bg-white/5"
                      }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {error && <ErrorState message="Couldn't load conversations." onRetry={reload} />}
            {!error && loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            {!error && !loading && conversations.length === 0 && (
              <EmptyState
                icon={priorityOnly ? Star : MessagesSquare}
                title={priorityOnly ? "No priority conversations" : "No conversations yet"}
                description={
                  priorityOnly
                    ? "WAAA hasn't detected anything requiring immediate attention."
                    : "Conversations appear here once WhatsApp is connected and messages start arriving."
                }
              />
            )}
            {!error &&
              conversations.map((conv) => (
                <ConversationRow
                  key={conv.chatId}
                  conv={conv}
                  active={selected?.chatId === conv.chatId}
                  onClick={() => setSelectedChatId(conv.chatId)}
                />
              ))}
          </div>
        </div>

        {/* DETAIL */}
        <div className="flex flex-col rounded-2xl border border-surface-border bg-surface-panel/40 lg:overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-10">
              <EmptyState icon={MessagesSquare} title="Select a conversation" description="Pick a chat from the list to see its messages and intelligence." />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-surface-border p-4">
                <div>
                  <p className="font-medium text-ink">{selected.chatName}</p>
                  <p className="text-xs text-ink-muted">
                    {selected.chatType}
                    {selected.participantCount ? ` · ${selected.participantCount} members` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runSummarize(selected.chatId)}
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-glow hover:bg-cyan-500/15"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Summarize
                  </button>
                  <PriorityLevelSelect
                    value={selected.priorityLevel || "normal"}
                    onChange={(level) => changePriorityLevel(selected, level)}
                  />
                </div>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                {msgError ? (
                  <ErrorState message="Couldn't load messages for this chat — see console/terminal for a Firestore index error." onRetry={reloadMessages} />
                ) : msgLoading && !msgData ? (
                  Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
                ) : msgData?.messages?.length ? (
                  msgData.messages.map((m) => <MessageBubble key={m.id} message={m} onSelect={setSelectedMessage} />)
                ) : (
                  <EmptyState icon={MessagesSquare} title="No messages yet" description="Messages will appear here as WAAA processes them." />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {selectedMessage && <IntelligenceDrawer message={selectedMessage} onClose={() => setSelectedMessage(null)} />}
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
