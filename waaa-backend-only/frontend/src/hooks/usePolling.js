import { useEffect, useRef, useState, useCallback } from "react";

// Simple fetch-on-interval hook with loading/error states. Used for
// every real-data view so nothing ever renders fabricated content —
// it's either real data, a loading skeleton, or an explicit error/empty state.
export function usePolling(fetcher, { intervalMs = 15000, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();

    if (!intervalMs) return undefined;

    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}
