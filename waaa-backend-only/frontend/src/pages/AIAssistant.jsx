import React from "react";
import { Sparkles, Send } from "lucide-react";
import AppShell from "../components/layout/AppShell.jsx";

const EXAMPLES = [
  "What messages need my attention?",
  "Summarize today's group chats.",
  "What deadlines do I have?",
  "Show suspicious messages.",
  "Which chats are most important?",
];

export default function AIAssistant() {
  return (
    <AppShell title="AI Assistant">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-500/[0.06] to-transparent p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/25">
            <Sparkles className="h-5 w-5 text-violet-glow" />
          </div>
          <h2 className="font-display text-lg font-semibold text-ink">AI Assistant — Coming soon</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            There's no conversational AI endpoint in the backend yet. Once one exists, you'll be able to ask things like:
          </p>

          <div className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <span key={ex} className="rounded-full border border-surface-border bg-surface-raised px-3 py-1.5 text-xs text-ink-muted">
                {ex}
              </span>
            ))}
          </div>

          <div className="mx-auto mt-6 flex max-w-md items-center gap-2 opacity-50">
            <input
              disabled
              placeholder="Ask WAAA anything…"
              className="flex-1 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
            <button disabled className="rounded-lg bg-violet-500/15 p-2 text-violet-glow">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
