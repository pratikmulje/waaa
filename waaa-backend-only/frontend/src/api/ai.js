import { api } from "./client.js";

export const getAiStatus = () => api.get("/ai/status");

export const summarizeChat = (chatId) =>
  api.post(`/ai/summarize/${encodeURIComponent(chatId)}`, {});

export const generateDraft = (messageId) =>
  api.post("/ai/draft", { messageId });

/**
 * Ask WAAA anything via the JARVIS router.
 * @param {string} query - Natural language question
 * @param {object} [opts]
 * @param {string} [opts.mode] - "SMART_AUTO" | "NORMAL_AI" | "MY_CONTEXT"
 * @param {string} [opts.sessionId]
 * @param {string} [opts.chatId]
 * @param {boolean} [opts.forceGemini]
 */
export const askWAAA = (query, opts = {}) =>
  api.post("/ai/ask", { query, ...opts });
