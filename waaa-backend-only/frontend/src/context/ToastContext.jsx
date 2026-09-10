import React, { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);
let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = "info") => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
  const COLORS = {
    success: "text-emerald-glow border-emerald-500/30",
    error: "text-red-400 border-red-500/30",
    info: "text-cyan-glow border-cyan-500/30",
  };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2 rounded-xl border bg-surface-raised/95 px-4 py-3 text-sm text-ink shadow-panel backdrop-blur ${COLORS[t.tone]}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="ml-2 text-ink-faint hover:text-ink">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
