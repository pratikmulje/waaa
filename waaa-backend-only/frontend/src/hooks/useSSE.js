import { useEffect, useRef } from "react";
import { sseUrl } from "../api/client.js";

// Subscribes to a backend SSE stream. Falls back silently — the caller
// is expected to also poll, since a proxy/network hiccup shouldn't
// leave the UI stuck with stale data.
export function useSSE(path, eventName, onEvent, enabled = true) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return undefined;

    let es;
    try {
      es = new EventSource(sseUrl(path));
    } catch {
      return undefined;
    }

    const listener = (evt) => {
      try {
        handlerRef.current(JSON.parse(evt.data));
      } catch {
        // ignore malformed frame
      }
    };

    es.addEventListener(eventName, listener);
    es.onerror = () => {
      // EventSource auto-retries; nothing to do here.
    };

    return () => {
      es.removeEventListener(eventName, listener);
      es.close();
    };
  }, [path, eventName, enabled]);
}
