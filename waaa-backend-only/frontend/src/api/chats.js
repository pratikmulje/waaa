import { api } from "./client.js";

export const PRIORITY_LEVELS = ["normal", "low", "medium", "high", "critical"];

export const getChatSettings = (chatId) => api.get(`/chats/${encodeURIComponent(chatId)}/settings`);

export const setChatPriorityLevel = (chatId, priorityLevel) =>
  api.post(`/chats/${encodeURIComponent(chatId)}/priority`, { priorityLevel });