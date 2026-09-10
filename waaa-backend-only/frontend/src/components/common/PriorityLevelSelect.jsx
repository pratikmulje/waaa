import React, { useEffect, useRef, useState } from "react";
import { Star, ChevronDown, Check } from "lucide-react";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "../../utils/format.js";

const LEVELS = ["normal", "low", "medium", "high", "critical"];

export default function PriorityLevelSelect({ value = "normal", onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const c = PRIORITY_COLORS[value] || PRIORITY_COLORS.normal;

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function pick(level) {
    setOpen(false);
    if (level !== value) onChange(level);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${c.bg} ${c.ring} ring-1 ${c.text} hover:brightness-110`}
      >
        <Star className={`h-3.5 w-3.5 ${value !== "normal" ? "fill-current" : ""}`} />
        {PRIORITY_LABELS[value]}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-36 overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-panel">
          {LEVELS.map((level) => {
            const lc = PRIORITY_COLORS[level];
            const selected = level === value;
            return (
              <button
                key={level}
                type="button"
                onClick={() => pick(level)}
                className={`focus-ring flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5 ${
                  selected ? "bg-white/[0.04]" : ""
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: lc.dot }} />
                  <span className={lc.text}>{PRIORITY_LABELS[level]}</span>
                </span>
                {selected && <Check className="h-3.5 w-3.5 text-emerald-glow" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}