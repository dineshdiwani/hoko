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
  try {
    localStorage.removeItem(DEFERRED_DEEPLINK_KEY);
  } catch {}
}

export function saveDeferredDeepLink({
  path,
  source = "",
  role = "",
  query = {},
  expiresInMs = DEFERRED_DEEPLINK_TTL_MS
}) {
  const nextPath = normalizeInternalPath(path);
  if (!nextPath) return null;

  const payload = {
    path: nextPath,
    source: String(source || "").trim(),
    role: String(role || "").trim(),
    query: query && typeof query === "object" ? query : {},
    createdAt: Date.now(),
    expiresAt: Date.now() + Math.max(60 * 1000, Number(expiresInMs) || DEFERRED_DEEPLINK_TTL_MS)
  };

  writeJsonStorage(DEFERRED_DEEPLINK_KEY, payload);
  return payload;
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
