import { api } from "./client.js";

export const getConversations = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/conversations${qs ? `?${qs}` : ""}`);
};

export const getConversation = (chatId) => api.get(`/conversations/${encodeURIComponent(chatId)}`);

export const getConversationMessages = (chatId, limit = 100) =>
  api.get(`/conversations/${encodeURIComponent(chatId)}/messages?limit=${limit}`);
