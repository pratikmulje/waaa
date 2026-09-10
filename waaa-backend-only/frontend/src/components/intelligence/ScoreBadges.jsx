import React from "react";
import { ShieldAlert, Flame } from "lucide-react";
import { RISK_COLORS, IMPORTANCE_COLORS } from "../../utils/format.js";

// Renders the fraud/importance badges used across chats, fraud center,
// and important-messages — always sourced from real
// message.fraudAnalysis / message.importanceAnalysis, never invented.
export function RiskBadge({ fraudAnalysis, compact = false }) {
  if (!fraudAnalysis) return null;
  const level = fraudAnalysis.riskLevel || "low";
  if (level === "low" && compact) return null;
  const c = RISK_COLORS[level] || RISK_COLORS.low;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text} ring-1 ${c.ring}`}>
      <ShieldAlert className="h-3 w-3" /> {level.toUpperCase()} RISK
      {!compact && <span className="font-mono opacity-70">· {fraudAnalysis.finalScore}</span>}
    </span>
  );
}

export function ImportanceBadge({ importanceAnalysis, compact = false }) {
  if (!importanceAnalysis) return null;
  const level = importanceAnalysis.level || "normal";
  if (level === "normal" && compact) return null;
  const c = IMPORTANCE_COLORS[level] || IMPORTANCE_COLORS.normal;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text} ring-1 ${c.ring}`}>
      <Flame className="h-3 w-3" /> {level.toUpperCase()} IMPORTANCE
      {!compact && <span className="font-mono opacity-70">· {importanceAnalysis.finalScore}</span>}
    </span>
  );
}
