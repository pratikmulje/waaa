import { api } from "./client.js";

export const getConnectionStatus = () => api.get("/connection/status");
