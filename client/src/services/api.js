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
  }
  return config;
});

export default api;
