import React, { useEffect, useState } from "react";
import { Wordmark } from "../components/layout/Sidebar.jsx";

export default function Intro({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), 2600);
    const doneTimer = setTimeout(onDone, 3100);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-surface bg-grid-fade transition-opacity duration-500 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="animate-[fadeUp_0.7s_ease-out]">
        <div className="scale-125">
          <Wordmark size="lg" />
        </div>
      </div>
      <p className="mt-6 max-w-xs text-center text-sm text-ink-faint">
        Reading the signal in your WhatsApp — what matters, what's risky, what's waiting on you.
      </p>
      <button
        onClick={onDone}
        className="focus-ring mt-8 rounded-full border border-surface-border px-4 py-1.5 text-xs text-ink-muted hover:bg-white/5"
      >
        Skip
      </button>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
