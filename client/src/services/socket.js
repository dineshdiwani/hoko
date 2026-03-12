import { io } from "socket.io-client";
import { getSession } from "./storage";
import { getDefaultSocketBaseUrl } from "../utils/runtime";

function resolveSocketUrl() {
  return getDefaultSocketBaseUrl();
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
