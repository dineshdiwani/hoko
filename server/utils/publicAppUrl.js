const FALLBACK_APP_URL = "https://hokoapp.in";
const PLACEHOLDER_HOSTS = new Set(["your-client-app.vercel.app"]);

function firstEnvUrl(raw) {
  return String(raw || "")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
}

function normalizeToHttpsUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://${raw}`.replace(/\/+$/, "");
}

function isPlaceholderHost(value) {
  try {
    const parsed = new URL(value);
    return PLACEHOLDER_HOSTS.has(String(parsed.hostname || "").toLowerCase());
  } catch {
    return false;
  }
}

function resolvePublicAppUrl() {
  const candidate = normalizeToHttpsUrl(
    firstEnvUrl(process.env.APP_PUBLIC_URL || process.env.CLIENT_URL)
  );
  if (!candidate || isPlaceholderHost(candidate)) {
    return FALLBACK_APP_URL;
  }
  return candidate;
}

module.exports = {
  resolvePublicAppUrl
};

