import React from "react";
import { X, ShieldAlert, Flame } from "lucide-react";
import ScoreBar from "../common/ScoreBar.jsx";
import { RISK_COLORS, IMPORTANCE_COLORS, clockTime } from "../../utils/format.js";

// "MESSAGE INTELLIGENCE" side panel — shown when a message is selected.
// Every value here comes straight from the message's stored
// fraudAnalysis / importanceAnalysis object.
export default function IntelligenceDrawer({ message, onClose }) {
  if (!message) return null;

  const fraud = message.fraudAnalysis;
  const importance = message.importanceAnalysis;
  const riskColor = RISK_COLORS[fraud?.riskLevel]?.bar || RISK_COLORS.low.bar;
  const impColor = IMPORTANCE_COLORS[importance?.level]?.bar || IMPORTANCE_COLORS.normal.bar;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-md animate-[slideIn_0.25s_ease-out] overflow-y-auto border-l border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="font-display text-sm font-semibold uppercase tracking-wider text-ink-muted">Message Intelligence</p>
          <button onClick={onClose} className="focus-ring rounded-lg p-1 text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-6 space-y-1">
          <p className="text-xs text-ink-faint">{message.sender} · {clockTime(message.createdAt || message.receivedAt)}</p>
          <p className="text-sm leading-relaxed text-ink">{message.text}</p>
        </div>

        <div className="space-y-5">
          {importance && (
            <div>
              <ScoreBar value={importance.finalScore} color={impColor} label={
                <span className="flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" /> Importance</span>
              } />
              {importance.reasons?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {importance.reasons.map((r, i) => (
                    <span key={i} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-glow ring-1 ring-violet-500/20">
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {fraud && (
            <div>
              <ScoreBar value={fraud.finalScore} color={riskColor} label={
                <span className="flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Risk</span>
              } />
              {fraud.reasons?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {fraud.reasons.map((r, i) => (
                    <span key={i} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400 ring-1 ring-red-500/20">
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4 border-t border-surface-border pt-5 text-xs">
          {importance && (
            <div>
              <p className="mb-1.5 font-medium text-ink-muted">Importance breakdown</p>
              <div className="grid grid-cols-3 gap-3">
                <ScoreStat label="Rule" value={importance.ruleScore} />
                <ScoreStat label="ML" value={importance.mlScore} />
                <ScoreStat label="Final" value={importance.finalScore} />
              </div>
            </div>
          )}
          {fraud && (
            <div>
              <p className="mb-1.5 font-medium text-ink-muted">Risk breakdown</p>
              <div className="grid grid-cols-3 gap-3">
                <ScoreStat label="Rule" value={fraud.ruleScore} />
                <ScoreStat label="ML" value={fraud.mlScore} />
                <ScoreStat label="Final" value={fraud.finalScore} />
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </div>
  );
}

function ScoreStat({ label, value }) {
  return (
    <div>
      <p className="text-ink-faint">{label}</p>
      <p className="font-mono text-ink">{value ?? "—"}</p>
    </div>
  );
}
