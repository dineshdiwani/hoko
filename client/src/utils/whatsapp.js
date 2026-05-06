function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function isAndroidBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(String(navigator.userAgent || ""));
}

function buildBrowserUrl(phone, text) {
  const message = String(text || "").trim();
  const encodedText = encodeURIComponent(message);
  const digits = normalizePhone(phone);
  if (digits) {
    return `https://wa.me/${digits}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

function parseWhatsAppUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) {
    return { phone: "", text: "" };
  }

  try {
    const parsed = new URL(input);
    const protocol = String(parsed.protocol || "").toLowerCase();
    const hostname = String(parsed.hostname || "").toLowerCase();
    const pathname = String(parsed.pathname || "").trim();

    let phone = "";
    if (hostname.includes("wa.me")) {
      phone = pathname.replace(/^\//, "");
    } else if (hostname.includes("api.whatsapp.com")) {
      phone = parsed.searchParams.get("phone") || "";
    } else if (protocol === "whatsapp:" || protocol === "intent:") {
      phone = parsed.searchParams.get("phone") || "";
      if (!phone && pathname) {
        phone = pathname.replace(/^\//, "").replace(/send\/?/i, "");
      }
    }

    const text = parsed.searchParams.get("text") || "";
    return {
      phone: normalizePhone(phone),
      text
    };
  } catch {
    const digits = normalizePhone(input);
    return { phone: digits, text: "" };
  }
}

export function buildWhatsAppBrowserLink({ phone = "", text = "" } = {}) {
  return buildBrowserUrl(phone, text);
}

export function resolveWhatsAppLaunchUrl(rawUrl, fallbackText = "") {
  const { phone, text } = parseWhatsAppUrl(rawUrl);
  const message = String(text || fallbackText || "").trim();
  const browserUrl = buildBrowserUrl(phone, message);

  if (!isAndroidBrowser()) {
    return browserUrl;
  }

  const params = new URLSearchParams();
  if (phone) {
    params.set("phone", phone);
  }
  if (message) {
    params.set("text", message);
  }

  return `intent://send/?${params.toString()}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(browserUrl)};end`;
}

export function launchWhatsAppLink(rawUrl, fallbackText = "") {
  if (typeof window === "undefined") return;
  const target = resolveWhatsAppLaunchUrl(rawUrl, fallbackText);
  if (!target) return;
  window.location.assign(target);
}
