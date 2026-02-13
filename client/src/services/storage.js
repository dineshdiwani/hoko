// storage.js
const SESSION_KEY = "hoko_session";
const SELLER_DASHBOARD_CATEGORIES_KEY =
  "seller_dashboard_categories";
const SETTINGS_KEY = "hoko_settings";

export function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
}

export function updateSession(partial) {
  const current = getSession();
  if (!current) return;
  setSession({ ...current, ...partial });
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
