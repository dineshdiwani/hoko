import api from "./api";
import { getSession, setSession } from "./storage";

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function shouldRefreshSoon(token, thresholdMs = 24 * 60 * 60 * 1000) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0) * 1000;
  if (!exp) return false;
  return exp - Date.now() <= thresholdMs;
}

export async function refreshSessionIfNeeded() {
  const session = getSession();
  if (!session?.token || !shouldRefreshSoon(session.token)) {
    return null;
  }

  const response = await api.post("/auth/refresh");
  const nextUser = response?.data?.user || {};
  const nextToken = String(response?.data?.token || "").trim();
  if (!nextToken) {
    return null;
  }

  setSession({
    ...session,
    ...nextUser,
    token: nextToken,
    role: nextUser.role || session.role,
    roles: nextUser.roles || session.roles,
    sellerProfile: nextUser.sellerProfile || session.sellerProfile || {},
    mobile: nextUser.mobile || session.mobile || "",
    city: nextUser.city || session.city || "",
    address: nextUser.address || session.address || "",
    name: nextUser.displayName || nextUser.name || session.name || ""
  });

  return response.data;
}

export async function refreshSession() {
  const session = getSession();
  if (!session?.token) {
    return null;
  }

  const response = await api.post("/auth/refresh");
  const nextUser = response?.data?.user || {};
  const nextToken = String(response?.data?.token || "").trim();
  if (!nextToken) {
    return null;
  }

  setSession({
    ...session,
    ...nextUser,
    token: nextToken,
    role: nextUser.role || session.role,
    roles: nextUser.roles || session.roles,
    sellerProfile: nextUser.sellerProfile || session.sellerProfile || {},
    mobile: nextUser.mobile || session.mobile || "",
    city: nextUser.city || session.city || "",
    address: nextUser.address || session.address || "",
    name: nextUser.displayName || nextUser.name || session.name || ""
  });

  return response.data;
}
