import React, { useState, useEffect, useCallback } from "react";
import { X, Sparkles, Send, RotateCw, AlertCircle } from "lucide-react";
import ScoreBar from "../common/ScoreBar.jsx";
import { IMPORTANCE_COLORS, clockTime } from "../../utils/format.js";
import { generateDraft } from "../../api/ai.js";

// "Envelope" experience for an important message. Suggested replies are
// real Claude-generated drafts (via /api/ai/draft) when ANTHROPIC_API_KEY
// is configured on the backend — never fabricated client-side. Reply
// SENDING is still not implemented in the backend (no WhatsApp-send
// endpoint exists), so that button stays honestly disabled.
export default function SmartReplyDrawer({ message, onClose }) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSuggestions = useCallback(async () => {
    if (!message) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateDraft(message.id);
      setSuggestions(res.replies || []);
    } catch (err) {
      setError(err.status === 503 ? "not_configured" : "failed");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    setDraft("");
    setSuggestions(null);
    setError(null);
    if (message) fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id]);

  if (!message) return null;

  const importance = message.importanceAnalysis;
  const impColor = IMPORTANCE_COLORS[importance?.level]?.bar || IMPORTANCE_COLORS.normal.bar;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg animate-[cardIn_0.25s_ease-out] rounded-t-2xl border border-surface-border bg-surface-raised p-6 shadow-panel sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-glow">
              <Sparkles className="h-3.5 w-3.5" /> Needs your attention
            </p>
            <p className="mt-1 text-sm text-ink-muted">{message.sender} · {message.chatName} · {clockTime(message.createdAt || message.receivedAt)}</p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-lg p-1 text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="rounded-xl border border-surface-border bg-surface-panel/60 p-3.5 text-sm leading-relaxed text-ink">
          {message.text}
        </p>

        <div className="mt-4">
          <ScoreBar value={importance?.finalScore ?? 0} color={impColor} label="Importance" size="sm" />
          {importance?.reasons?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {importance.reasons.map((r, i) => (
                <span key={i} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-glow ring-1 ring-violet-500/20">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Sparkles className="h-3 w-3 text-violet-glow" /> AI Suggested Replies
          </p>

          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border p-3 text-xs text-ink-faint">
              <RotateCw className="h-3.5 w-3.5 animate-spin" /> Generating suggestions…
            </div>
          )}

          {!loading && error === "not_configured" && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              AI isn't configured yet — add <code className="font-mono">ANTHROPIC_API_KEY</code> to the backend's <code className="font-mono">.env</code> and restart <code className="font-mono">npm run api</code>.
            </div>
          )}

          {!loading && error === "failed" && (
            <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
              <span>Couldn't generate suggestions.</span>
              <button onClick={fetchSuggestions} className="underline underline-offset-2 hover:text-red-300">Retry</button>
            </div>
          )}

          {!loading && !error && suggestions?.length > 0 && (
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setDraft(s)}
                  className="focus-ring block w-full rounded-lg border border-surface-border bg-surface-panel/60 px-3 py-2 text-left text-xs text-ink hover:border-violet-500/30 hover:bg-violet-500/5"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {!loading && !error && suggestions?.length === 0 && (
            <div className="rounded-xl border border-dashed border-surface-border p-3 text-xs text-ink-faint">
              No suggestions came back for this message.
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Your reply</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Type a reply, or tap a suggestion above"
            className="focus-ring w-full resize-none rounded-xl border border-surface-border bg-surface-panel px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint"
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-sm font-medium text-ink-muted hover:bg-white/10 disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Regenerate
          </button>
          <button disabled className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-2 text-sm font-medium text-emerald-glow/50">
            <Send className="h-3.5 w-3.5" /> Send reply
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-ink-faint">Sending isn't connected to WhatsApp yet — coming soon.</p>
      </div>
      <style>{`@keyframes cardIn { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  );
}
