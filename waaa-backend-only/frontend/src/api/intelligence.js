import { api } from "./client.js";

export const getAlerts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/intelligence/alerts${qs ? `?${qs}` : ""}`);
};

export const markAlertRead = (alertId, read) => {
  // Uses PATCH /api/intelligence/alerts/:alertId
  return fetch(`${import.meta.env.VITE_API_BASE || "/api"}/intelligence/alerts/${encodeURIComponent(alertId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ read }),
  }).then((r) => r.json());
};

export const getTasks = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/intelligence/tasks${qs ? `?${qs}` : ""}`);
};

export const getDeadlines = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/intelligence/deadlines${qs ? `?${qs}` : ""}`);
};

export const getActions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/intelligence/actions${qs ? `?${qs}` : ""}`);
};

export const getProjects = () => api.get("/intelligence/projects");

export const smartRetrieve = (query, options = {}) =>
  api.post("/intelligence/retrieve", { query, ...options });
