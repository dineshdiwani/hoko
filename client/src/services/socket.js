import { io } from "socket.io-client";
import { getSession } from "./storage";

function resolveSocketUrl() {
  const explicitSocketUrl = String(
    import.meta.env.VITE_SOCKET_URL || ""
  ).trim();
  if (explicitSocketUrl) {
    return explicitSocketUrl.replace(/\/+$/, "");
  }

  const apiUrl = String(import.meta.env.VITE_API_URL || "").trim();
  if (/^https?:\/\//i.test(apiUrl)) {
    return apiUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return "http://localhost:8080";
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

const socket = io(resolveSocketUrl(), {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ["websocket", "polling"],
  withCredentials: true,
  auth: {
    token: ""
  }
});

function resolveSessionToken() {
  const session = getSession();
  if (session?.token) return String(session.token);
  return String(localStorage.getItem("token") || "");
}

export function connectSocket() {
  const token = resolveSessionToken();
  if (!token) return;
  socket.auth = { token };
  if (!socket.connected) {
    socket.connect();
  }
}

export function refreshSocketAuth() {
  const token = resolveSessionToken();
  socket.auth = { token };
  if (socket.connected) {
    socket.disconnect();
  }
  if (token) {
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}

export default socket;
