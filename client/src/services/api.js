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

function getCurrentAppRoute() {
  const rawHash = String(window.location.hash || "");
  if (rawHash.startsWith("#/")) {
    const hashPath = rawHash.slice(1);
    const [pathPart, searchPart = ""] = hashPath.split("?");
    return {
      path: pathPart || "/",
      search: searchPart ? `?${searchPart}` : "",
      url: hashPath || "/",
      usesHash: true
    };
  }
  const path = window.location.pathname || "/";
  const search = window.location.search || "";
  return {
    path,
    search,
    url: `${path}${search}`,
    usesHash: false
  };
}

function navigateToAppRoute(path) {
  const target = String(path || "/").trim() || "/";
  if (String(window.location.hash || "").startsWith("#/")) {
    window.location.hash = target.startsWith("/") ? target : `/${target}`;
    return;
  }
  window.location.href = target;
}

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
        
        // Don't redirect public browsing funnels when protected side calls return 401.
        const route = getCurrentAppRoute();
        const currentPath = route.path;
        const currentSearch = route.search;
        const currentParams = new URLSearchParams(currentSearch);
        const isWhatsAppFlow = currentParams.get("from") === "wa" || currentParams.has("mobile");
        const isGuestDashboard =
          currentParams.get("guest") === "1" &&
          (currentPath === "/buyer/dashboard" || currentPath === "/seller/dashboard");
        
        if (isWhatsAppFlow || isGuestDashboard) {
          console.log("[API] 401 in public browsing flow, staying on page");
          return Promise.reject(error);
        }
        
        // Store current location for post-login redirect
        const currentUrl = route.url;
        if (currentPath.startsWith("/seller")) {
          navigateToAppRoute(`/seller/login?redirect=${encodeURIComponent(currentUrl)}`);
        } else if (currentPath.startsWith("/buyer")) {
          navigateToAppRoute(`/buyer/login?redirect=${encodeURIComponent(currentUrl)}`);
        } else if (currentPath.startsWith("/admin")) {
          navigateToAppRoute(`/admin/login?redirect=${encodeURIComponent(currentUrl)}`);
        } else {
          navigateToAppRoute("/auth");
        }
      } else if (status === 403) {
        console.warn("[API] Access denied:", error.response.data?.message);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
