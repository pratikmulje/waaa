import React from "react";
import { clockTime } from "../../utils/format.js";

export default function MessageBubble({ message, onSelect }) {
  const isSelf = message.fromMe === true;
  const time = clockTime(message.createdAt || message.receivedAt);

  return (
    <button
      onClick={() => onSelect?.(message)}
      className={`w-full text-left focus:outline-none group animate-slide-up ${
        isSelf ? "flex flex-col items-end" : ""
      }`}
    >
      <div className="max-w-[80%]">
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
        {/* Importance / risk badges */}
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
