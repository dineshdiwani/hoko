import axios from "axios";
import { getSession } from "./storage";
import {
  getDefaultApiBaseUrl,
  getDefaultAssetBaseUrl
} from "../utils/runtime";

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function normalizeApiBaseUrl(value) {
  const base = String(value || "").trim();
  if (!base) return "/api";
  const withoutTrailingSlash = base.replace(/\/+$/, "");
  if (/\/api$/i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }
  return `${withoutTrailingSlash}/api`;
}

const rawBaseUrl = getDefaultApiBaseUrl();

const normalizedBaseUrl = normalizeApiBaseUrl(rawBaseUrl);

export function getAssetBaseUrl() {
  if (isAbsoluteHttpUrl(normalizedBaseUrl)) {
    return normalizedBaseUrl.replace(/\/api\/?$/, "");
  }
  return getDefaultAssetBaseUrl();
}

const api = axios.create({
  baseURL: normalizedBaseUrl,
});

api.interceptors.request.use((config) => {
  const session = getSession();
  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  } else {
    console.warn("[API] No auth token found, proceeding without auth");
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response;
      if (status === 401) {
        localStorage.removeItem("hoko_session");
        localStorage.removeItem("session");
        
        // Don't redirect if in WhatsApp public flow (public read-only mode)
        const isWhatsAppFlow = window.location.search.includes("from=wa") || 
          window.location.search.includes("mobile=");
        
        if (isWhatsAppFlow) {
          console.log("[API] 401 in WhatsApp flow, staying on page");
          return Promise.reject(error);
        }
        
        // Store current location for post-login redirect
        const currentPath = window.location.pathname;
        const currentUrl = `${window.location.pathname}${window.location.search || ""}`;
        if (currentPath.startsWith("/seller")) {
          window.location.href = `/seller/login?redirect=${encodeURIComponent(currentUrl)}`;
        } else if (currentPath.startsWith("/buyer")) {
          window.location.href = `/buyer/login?redirect=${encodeURIComponent(currentUrl)}`;
        } else if (currentPath.startsWith("/admin")) {
          window.location.href = `/admin/login?redirect=${encodeURIComponent(currentUrl)}`;
        } else {
          window.location.href = "/auth";
        }
      } else if (status === 403) {
        console.warn("[API] Access denied:", error.response.data?.message);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
