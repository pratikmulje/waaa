import { api } from "./client.js";

export const getMessages = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/messages${qs ? `?${qs}` : ""}`);
};
