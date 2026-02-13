import axios from "axios";
import { getSession } from "./storage";

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function normalizeApiBaseUrl(value) {
  const base = String(value || "").trim();
  if (!base) return "/api";
  if (base.endsWith("/api")) return base;
  return `${base.replace(/\/+$/, "")}/api`;
}

const fallbackApiUrl = import.meta.env.DEV
  ? "http://localhost:5000/api"
  : "/api";

const rawBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  fallbackApiUrl;

const normalizedBaseUrl = normalizeApiBaseUrl(rawBaseUrl);

export function getAssetBaseUrl() {
  if (isAbsoluteHttpUrl(normalizedBaseUrl)) {
    return normalizedBaseUrl.replace(/\/api\/?$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

const api = axios.create({
  baseURL: normalizedBaseUrl,
});

api.interceptors.request.use((config) => {
  const session = getSession();
  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

export default api;
