import { api } from "./client.js";

export const getBehaviorPatterns = () => api.get("/behavior/patterns");
