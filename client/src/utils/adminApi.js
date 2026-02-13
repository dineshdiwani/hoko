import axios from "axios";

const fallbackApiUrl = import.meta.env.DEV
  ? "http://localhost:5000/api"
  : "/api";

const rawApiUrl = import.meta.env.VITE_API_URL || fallbackApiUrl;
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

export default adminApi;
