import axios from "axios";
import { getDefaultApiBaseUrl } from "./runtime";

const rawApiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || "http://localhost:5000/api"
  : getDefaultApiBaseUrl();
const normalizedApiUrl = String(rawApiUrl).endsWith("/api")
  ? String(rawApiUrl)
  : `${String(rawApiUrl).replace(/\/+$/, "")}/api`;

const adminApi = axios.create({
  baseURL: normalizedApiUrl,
});

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      localStorage.removeItem("admin_token");
      if (window.location.pathname !== "/admin/login") {
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(error);
  }
);

export default adminApi;
