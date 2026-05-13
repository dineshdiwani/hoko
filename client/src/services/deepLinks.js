import api from "./api";
import { getSession } from "./storage";

const DEFERRED_DEEPLINK_KEY = "hoko_deferred_deeplink";
const DEFERRED_DEEPLINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeInternalPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  return "";
}

function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function clearDeferredDeepLink() {
  const record = readJsonStorage(DEFERRED_DEEPLINK_KEY);
  try {
    localStorage.removeItem(DEFERRED_DEEPLINK_KEY);
  } catch {}
  if (record) {
    clearServerDeferredDeepLink(record).catch(() => null);
  }
}

async function syncDeferredDeepLinkToServer(record) {
  const session = getSession();
  if (!session?.token || !record?.path) return null;
  try {
    const response = await api.post("/deep-links/context", {
      path: record.path,
      source: record.source || "",
      role: record.role || "",
      query: record.query || {},
      metadata: record.metadata || {},
      actionType: record.actionType || "generic",
      identityKey: String(session.email || session.mobile || session._id || "").trim(),
      expiresInMs: Math.max(60 * 1000, Number(record.expiresAt || 0) - Date.now()) || DEFERRED_DEEPLINK_TTL_MS
    });
    return response?.data?.context || null;
  } catch {
    return null;
  }
}

export async function clearServerDeferredDeepLink(record = null) {
  const session = getSession();
  if (!session?.token) return null;
  const target = record || getDeferredDeepLink();
  if (!target?.path) return null;
  try {
    const response = await api.post("/deep-links/context/consume", {
      path: target.path,
      actionType: target.actionType || "generic"
    });
    return response?.data || null;
  } catch {
    return null;
  }
}

export async function syncStoredDeferredDeepLinkToServer() {
  const record = getDeferredDeepLink();
  if (!record) return null;
  return syncDeferredDeepLinkToServer(record);
}

export function saveDeferredDeepLink({
  path,
  source = "",
  role = "",
  query = {},
  metadata = {},
  actionType = "generic",
  expiresInMs = DEFERRED_DEEPLINK_TTL_MS
}) {
  const nextPath = normalizeInternalPath(path);
  if (!nextPath) return null;

  const payload = {
    path: nextPath,
    source: String(source || "").trim(),
    role: String(role || "").trim(),
    query: query && typeof query === "object" ? query : {},
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    actionType: String(actionType || "generic").trim() || "generic",
    createdAt: Date.now(),
    expiresAt: Date.now() + Math.max(60 * 1000, Number(expiresInMs) || DEFERRED_DEEPLINK_TTL_MS)
  };

  writeJsonStorage(DEFERRED_DEEPLINK_KEY, payload);
  syncDeferredDeepLinkToServer(payload).catch(() => null);
  return payload;
}

export async function fetchServerDeferredDeepLink() {
  const session = getSession();
  if (!session?.token) return null;
  try {
    const response = await api.get("/deep-links/context/active");
    const contexts = Array.isArray(response?.data?.contexts) ? response.data.contexts : [];
    const latest = contexts[0];
    if (!latest?.path) return null;
    return {
      path: normalizeInternalPath(latest.path),
      source: String(latest.source || "").trim(),
      role: String(latest.role || "").trim(),
      query: latest.query && typeof latest.query === "object" ? latest.query : {},
      metadata: latest.metadata && typeof latest.metadata === "object" ? latest.metadata : {},
      actionType: String(latest.actionType || "generic").trim() || "generic",
      createdAt: latest.createdAt || Date.now(),
      expiresAt: latest.expiresAt || (Date.now() + DEFERRED_DEEPLINK_TTL_MS)
    };
  } catch {
    return null;
  }
}

export function getDeferredDeepLink() {
  const record = readJsonStorage(DEFERRED_DEEPLINK_KEY);
  if (!record) return null;
  if (Number(record.expiresAt || 0) < Date.now()) {
    clearDeferredDeepLink();
    return null;
  }
  const path = normalizeInternalPath(record.path);
  if (!path) {
    clearDeferredDeepLink();
    return null;
  }
  return {
    ...record,
    path
  };
}

export function buildDeferredDeepLinkUrl(record) {
  if (!record?.path) return "";
  const params = new URLSearchParams();
  const query = record.query && typeof record.query === "object" ? record.query : {};
  Object.entries(query).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (normalizedKey && normalizedValue) {
      params.set(normalizedKey, normalizedValue);
    }
  });
  return `${record.path}${params.toString() ? `?${params.toString()}` : ""}`;
}
