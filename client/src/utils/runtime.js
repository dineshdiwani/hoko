function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function isNativeAppRuntime() {
  if (typeof window === "undefined") return false;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  if (protocol === "capacitor:" || protocol === "ionic:") {
    return true;
  }
  const capacitor = window.Capacitor;
  if (typeof capacitor?.isNativePlatform === "function") {
    try {
      return Boolean(capacitor.isNativePlatform());
    } catch {
      return false;
    }
  }
  return false;
}

export function getPublicAppUrl() {
  const configured = normalizeUrl(
    import.meta.env.VITE_PUBLIC_APP_URL ||
      import.meta.env.VITE_APP_URL
  );
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const origin = normalizeUrl(window.location?.origin || "");
    if (/^https?:\/\//i.test(origin) && !/localhost/i.test(origin)) {
      return origin;
    }
  }

  return "https://hokoapp.in";
}

export function getDefaultApiBaseUrl() {
  const explicit = normalizeUrl(
    import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL
  );
  if (explicit) {
    return /\/api$/i.test(explicit) ? explicit : `${explicit}/api`;
  }
  if (isNativeAppRuntime()) {
    return `${getPublicAppUrl()}/api`;
  }
  return "/api";
}

export function getDefaultSocketBaseUrl() {
  const explicit = normalizeUrl(import.meta.env.VITE_SOCKET_URL || "");
  if (explicit) return explicit;

  const apiBase = normalizeUrl(
    import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL
  );
  if (/^https?:\/\//i.test(apiBase)) {
    return apiBase.replace(/\/api\/?$/i, "");
  }

  if (import.meta.env.DEV) {
    return "http://localhost:8080";
  }

  if (isNativeAppRuntime()) {
    return getPublicAppUrl();
  }

  if (typeof window !== "undefined") {
    return normalizeUrl(window.location.origin);
  }

  return "";
}

export function getDefaultAssetBaseUrl() {
  if (isNativeAppRuntime()) {
    return getPublicAppUrl();
  }
  if (typeof window !== "undefined") {
    return normalizeUrl(window.location.origin);
  }
  return "";
}
