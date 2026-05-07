// storage.js
const SESSION_KEY = "hoko_session";
const SELLER_DASHBOARD_CATEGORIES_KEY =
  "seller_dashboard_categories";
const SETTINGS_KEY = "hoko_settings";
const SEEN_NOTIFICATION_IDS_KEY = "hoko_seen_notification_ids";
const NATIVE_PUSH_TOKEN_KEY = "hoko_native_push_token";
const UI_CITY_SELECTION_KEY = "hoko_ui_city_selection";
const SESSION_UPDATED_EVENT = "hoko_session_updated";
const UI_CITY_SELECTION_EVENT = "hoko_ui_city_selection_updated";
let uiCitySelection = "";

function getSessionStorageValue(key) {
  if (typeof window === "undefined") return "";
  try {
    return String(window.sessionStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function setSessionStorageValue(key, value) {
  if (typeof window === "undefined") return;
  try {
    const next = String(value || "").trim();
    if (next) {
      window.sessionStorage.setItem(key, next);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {}
}

function notifySessionUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT));
}

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notifySessionUpdated();
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  notifySessionUpdated();
}

export function updateSession(partial) {
  const current = getSession();
  if (!current) return;
  setSession({ ...current, ...partial });
}

export function onSessionUpdated(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SESSION_UPDATED_EVENT, handler);
  return () => window.removeEventListener(SESSION_UPDATED_EVENT, handler);
}

export function getUiCitySelection(fallback = "") {
  const shared = String(
    getSessionStorageValue(UI_CITY_SELECTION_KEY) || uiCitySelection || ""
  ).trim();
  if (shared) return shared;
  return String(fallback || "").trim();
}

export function setUiCitySelection(city) {
  const next = String(city || "").trim();
  if (next === uiCitySelection) return uiCitySelection;
  uiCitySelection = next;
  setSessionStorageValue(UI_CITY_SELECTION_KEY, next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UI_CITY_SELECTION_EVENT, { detail: { city: next } }));
  }
  return uiCitySelection;
}

export function clearUiCitySelection() {
  uiCitySelection = "";
  setSessionStorageValue(UI_CITY_SELECTION_KEY, "");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UI_CITY_SELECTION_EVENT, { detail: { city: "" } }));
  }
}

export function onUiCitySelectionUpdated(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UI_CITY_SELECTION_EVENT, handler);
  return () => window.removeEventListener(UI_CITY_SELECTION_EVENT, handler);
}

export function getSellerDashboardCategories() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(SELLER_DASHBOARD_CATEGORIES_KEY)
    );
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function setSellerDashboardCategories(categories) {
  const normalized = Array.isArray(categories)
    ? categories
        .map((c) => String(c || "").toLowerCase().trim())
        .filter(Boolean)
    : [];
  localStorage.setItem(
    SELLER_DASHBOARD_CATEGORIES_KEY,
    JSON.stringify(normalized)
  );
}

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

export function updateSettings(partial) {
  const current = getSettings();
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ ...current, ...partial })
  );
}

export function getSeenNotificationIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_NOTIFICATION_IDS_KEY));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function rememberSeenNotificationIds(ids) {
  const next = Array.from(
    new Set([
      ...getSeenNotificationIds(),
      ...(Array.isArray(ids) ? ids : []).map((item) => String(item || "")).filter(Boolean)
    ])
  ).slice(-200);
  localStorage.setItem(SEEN_NOTIFICATION_IDS_KEY, JSON.stringify(next));
}

export function getNativePushToken() {
  return String(localStorage.getItem(NATIVE_PUSH_TOKEN_KEY) || "").trim();
}

export function setNativePushToken(token) {
  const value = String(token || "").trim();
  if (!value) {
    localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY);
    return;
  }
  localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, value);
}
