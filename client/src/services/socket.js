import { io } from "socket.io-client";

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
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ["websocket", "polling"],
  withCredentials: true
});

export default socket;
