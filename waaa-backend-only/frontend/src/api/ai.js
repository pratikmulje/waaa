import { api } from "./client.js";

export const getAiStatus = () => api.get("/ai/status");

export const summarizeChat = (chatId) => api.post(`/ai/summarize/${encodeURIComponent(chatId)}`, {});

export const generateDraft = (messageId) => api.post("/ai/draft", { messageId });
