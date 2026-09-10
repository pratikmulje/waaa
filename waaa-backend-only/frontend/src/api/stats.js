import { api } from "./client.js";

export const getStatsSummary = () => api.get("/stats/summary");
