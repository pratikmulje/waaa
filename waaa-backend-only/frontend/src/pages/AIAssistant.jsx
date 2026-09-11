import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Zap, RotateCw, Copy, Check, Trash2 } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";
import ThinkingDots from "../components/common/ThinkingDots.jsx";
import DateSeparator, { groupMessagesByDate } from "../components/common/DateSeparator.jsx";
import { askWAAA } from "../api/ai.js";
import { clockTime, cleanSourceLabel } from "../utils/format.js";

const EXAMPLES = [
  "What messages need my attention today?",
  "Show me my pending tasks.",
  "What deadlines are coming up?",
  "Summarize what happened in my groups.",
  "What did my team decide recently?",
  "Any suspicious messages I should know about?",
];

const STORAGE_KEY = "waaa_ai_assistant_session_v1";

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [], sessionId: `session-${Date.now()}` };
    const parsed = JSON.parse(raw);
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : `session-${Date.now()}`,
    };
  } catch {
    return { messages: [], sessionId: `session-${Date.now()}` };
  }
}

function useClipboard(text, duration = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), duration);
    } catch { /* ignore */ }
  }, [text, duration]);
  return [copied, copy];
}

function WaaaMessage({ msg }) {
  const [copied, copy] = useClipboard(typeof msg.content === "string" ? msg.content : "");
  const isStructured = msg.structured;

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* Avatar */}
      <div className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-accent/30 to-violet-glow/20 border border-accent/20 flex items-center justify-center mt-0.5">
        <Zap className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-xs font-semibold text-accent">WAAA</span>
          <span className="text-[10px] text-ink-faint">{clockTime(msg.ts)}</span>
        </div>

        <div className="bubble-waaa">
          {isStructured ? (
            <StructuredResult data={msg.content} />
          ) : (
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </p>
          )}
        </div>

        <button
          onClick={copy}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-faint hover:text-ink-muted transition-colors focus:outline-none"
          aria-label="Copy response"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function UserMessage({ msg }) {
  return (
    <div className="flex gap-3 justify-end animate-slide-up">
      <div className="max-w-[75%]">
        <div className="flex items-baseline justify-end gap-2 mb-1.5">
          <span className="text-[10px] text-ink-faint">{clockTime(msg.ts)}</span>
          <span className="text-xs font-semibold text-ink-muted">You</span>
        </div>
        <div className="bubble-user">
          <p className="text-sm leading-relaxed">{msg.content}</p>
        </div>
      </div>
    </div>
  );
}

function StructuredResult({ data }) {
  // data can be: string, array of items, or an object with a `result` or `answer` field
  if (typeof data === "string") {
    return <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{data}</p>;
  }

  const answer = data?.answer || data?.result || data?.summary || data?.response;
  const items = data?.items || data?.results || data?.actions || data?.deadlines || data?.tasks || data?.alerts;

  return (
    <div className="space-y-2">
      {answer && (
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{answer}</p>
      )}
      {Array.isArray(items) && items.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {items.slice(0, 5).map((item, i) => {
            const label = item.text || item.action || item.message || item.title || JSON.stringify(item);
            return (
              <div key={i} className="rounded-xl border border-accent/15 bg-accent/5 px-3.5 py-2.5">
                <p className="text-xs text-ink leading-snug">{label}</p>
                {item.dueDate && (
                  <p className="mt-0.5 text-[10px] text-ink-faint">
                    Due {new Date(item.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
                {item.chatName && (
                  <p className="mt-0.5 text-[10px] text-ink-faint">Source: {cleanSourceLabel(item.chatName)}</p>
                )}
              </div>
            );
          })}
          {items.length > 5 && (
            <p className="text-[10px] text-ink-faint pl-1">+{items.length - 5} more</p>
          )}
        </div>
      )}
      {!answer && !items && (
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </p>
      )}
    </div>
  );
}

export default function AIAssistant() {
  const [sessionData] = useState(loadSavedSession);
  const [messages, setMessages] = useState(sessionData.messages);
  const [sessionId, setSessionId] = useState(sessionData.sessionId);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Persist messages & session to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, sessionId }));
    } catch {
      // ignore storage quota error
    }
  }, [messages, sessionId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const clearChat = useCallback(() => {
    const newSessionId = `session-${Date.now()}`;
    setMessages([]);
    setSessionId(newSessionId);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const sendMessage = useCallback(async (query) => {
    const text = (query || input).trim();
    if (!text || thinking) return;

    setInput("");
    setError(null);

    const userMsg = { role: "user", content: text, ts: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);

    try {
      const res = await askWAAA(text, { sessionId, mode: "SMART_AUTO" });

      // Determine if result is structured or plain text
      const hasStructured =
        res?.items || res?.results || res?.actions || res?.deadlines ||
        res?.tasks || res?.alerts || res?.answer || res?.result || res?.summary;

      const waaaMsg = {
        role: "waaa",
        content: hasStructured ? res : (res?.response || res?.answer || res?.result || res?.text || JSON.stringify(res)),
        structured: !!hasStructured,
        ts: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, waaaMsg]);
    } catch (err) {
      setError(err.message || "WAAA couldn't process your request. Please try again.");
      // Still show error inline
      const errMsg = {
        role: "waaa",
        content: `Sorry, I ran into a problem: ${err.message || "unknown error"}. Please try again.`,
        structured: false,
        ts: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }, [input, thinking, sessionId]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Group messages by date for separators
  const pseudoMessages = messages.map((m) => ({ ...m, createdAt: m.ts }));
  const groups = groupMessagesByDate(pseudoMessages);

  const isEmpty = messages.length === 0;

  return (
    <AppShell title="Ask WAAA">
      <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-4">

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/8">
                <Zap className="h-6 w-6 text-accent" strokeWidth={1.75} />
              </div>
              <h2 className="font-display text-xl font-semibold text-ink">I'm ready.</h2>
              <p className="mt-2 max-w-xs text-sm text-ink-muted leading-relaxed">
                Ask me about your messages, tasks, deadlines, or conversations.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => sendMessage(ex)}
                    className="focus-ring rounded-full border border-surface-border bg-surface-raised px-3.5 py-1.5 text-xs text-ink-muted transition-all hover:border-accent/30 hover:text-ink hover:bg-surface-hover"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation */}
          {!isEmpty && (
            <div className="flex justify-end pb-1">
              <button
                onClick={clearChat}
                className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-ink-faint hover:bg-surface-hover hover:text-ink-muted transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear chat</span>
              </button>
            </div>
          )}

          {!isEmpty &&
            groups.map((group, gi) => (
              <React.Fragment key={group.dateLabel ?? `group-${gi}`}>
                {group.dateLabel && <DateSeparator label={group.dateLabel} />}
                {group.messages.map((msg) =>
                  msg.role === "user" ? (
                    <UserMessage key={`${msg.ts}-${msg.role}`} msg={msg} />
                  ) : (
                    <WaaaMessage key={`${msg.ts}-${msg.role}`} msg={msg} />
                  )
                )}
              </React.Fragment>
            ))}

          {/* Thinking indicator */}
          {thinking && (
            <div className="flex gap-3 animate-fade-in">
              <div className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-accent/30 to-violet-glow/20 border border-accent/20 flex items-center justify-center mt-0.5">
                <Zap className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              </div>
              <div className="bubble-waaa mt-6">
                <ThinkingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 pt-3 border-t border-surface-border">
          <div className="flex items-end gap-3 rounded-2xl border border-surface-border bg-surface-raised px-4 py-3 transition-all focus-within:border-accent/35 focus-within:shadow-[0_0_0_3px_rgba(56,189,248,0.08)]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask WAAA anything…"
              rows={1}
              disabled={thinking}
              className="flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none min-h-[24px] max-h-40 leading-relaxed disabled:opacity-50"
              style={{ height: "auto" }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || thinking}
              className="focus-ring shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-surface transition-all hover:bg-accent-glow disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              {thinking ? (
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-ink-faint">
            Enter to send · Shift+Enter for new line · Powered by JARVIS Router
          </p>
        </div>
      </div>
    </AppShell>
  );
}
