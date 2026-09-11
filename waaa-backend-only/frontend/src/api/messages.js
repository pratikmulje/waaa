import { api } from "./client.js";

export const getMessages = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/messages${qs ? `?${qs}` : ""}`);
};

/** Send a WhatsApp message to a chatId */
export const sendWhatsAppMessage = (chatId, text) =>
  api.post("/messages/send", { chatId, text });
