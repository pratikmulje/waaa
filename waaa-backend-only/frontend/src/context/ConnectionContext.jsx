import React, { createContext, useContext, useEffect, useState } from "react";
import { getConnectionStatus } from "../api/connection.js";
import { useSSE } from "../hooks/useSSE.js";

const ConnectionContext = createContext(null);

const DEFAULT_STATE = {
  status: "disconnected",
  qr: null,
  qrGeneratedAt: null,
  lastError: null,
  connectedAt: null,
  updatedAt: null,
};

export function ConnectionProvider({ children }) {
  const [state, setState] = useState(DEFAULT_STATE);
  const [apiReachable, setApiReachable] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getConnectionStatus()
      .then((res) => {
        if (!cancelled) {
          setState(res);
          setApiReachable(true);
        }
      })
      .catch(() => {
        if (!cancelled) setApiReachable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useSSE("/connection/stream", "connection", (data) => {
    setState(data);
    setApiReachable(true);
  });

  return (
    <ConnectionContext.Provider value={{ ...state, apiReachable }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export const useConnection = () => useContext(ConnectionContext);
