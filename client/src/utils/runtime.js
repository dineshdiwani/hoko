function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function isNativeAppRuntime() {
  if (typeof window === "undefined") return false;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  if (protocol === "capacitor:" || protocol === "ionic:") {
    return true;
  }
  const origin = String(window.location?.origin || "").toLowerCase();
  if (origin.includes("localhost")) {
    const capacitor = window.Capacitor;
    if (capacitor?.isNativePlatform && capacitor.isNativePlatform()) {
       return true;
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
    return "https://hokoapp.in/api";
  }

  return "/api";
}

export function getDefaultSocketBaseUrl() {
  const explicit = normalizeUrl(import.meta.env.VITE_SOCKET_URL || "");
  if (explicit) return explicit;

  if (isNativeAppRuntime()) {
    return "https://hokoapp.in";
  }

  if (import.meta.env.DEV) {
    return "http://localhost:8080";
  }

  return "";
}

export function getDefaultAssetBaseUrl() {
  if (isNativeAppRuntime()) {
    return "https://hokoapp.in";
  }
  return "";
}
