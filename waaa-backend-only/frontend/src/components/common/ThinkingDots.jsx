import React from "react";

/**
 * ThinkingDots — animated 3-dot thinking indicator for WAAA responses.
 */
export default function ThinkingDots({ label = "Thinking" }) {
  return (
    <div className="flex items-center gap-2 text-ink-faint text-xs animate-fade-in">
      <span>{label}</span>
      <span className="flex items-center gap-0.5">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
    </div>
  );
}
