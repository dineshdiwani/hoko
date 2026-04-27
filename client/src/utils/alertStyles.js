function normalizePathname(pathname) {
  return String(pathname || "").trim().toLowerCase();
}

function inferPageTheme(pathname) {
  const path = normalizePathname(pathname);
  if (path.startsWith("/buyer")) {
    return {
      accent: "#f97316",
      accentText: "#7c2d12",
      accentSurface: "#fff7ed",
      accentBorder: "#fdba74"
    };
  }
  if (path.startsWith("/seller")) {
    return {
      accent: "#14b8a6",
      accentText: "#134e4a",
      accentSurface: "#f0fdfa",
      accentBorder: "#99f6e4"
    };
  }
  if (path.startsWith("/admin")) {
    return {
      accent: "#334155",
      accentText: "#0f172a",
      accentSurface: "#f8fafc",
      accentBorder: "#cbd5e1"
    };
  }
  if (path.startsWith("/auth") || path.startsWith("/login")) {
    return {
      accent: "#4f46e5",
      accentText: "#312e81",
      accentSurface: "#eef2ff",
      accentBorder: "#c7d2fe"
    };
  }
  return {
    accent: "#0f766e",
    accentText: "#134e4a",
    accentSurface: "#ecfeff",
    accentBorder: "#99f6e4"
  };
}

function inferAlertKind(title, message) {
  const text = `${title || ""} ${message || ""}`.toLowerCase();
  if (
    /error|failed|unable|invalid|blocked|denied|missing|required|not granted/.test(
      text
    )
  ) {
    return "error";
  }
  if (/success|saved|updated|submitted|enabled|deleted|done|verified/.test(text)) {
    return "success";
  }
  if (/warning|careful|permission|try again|retry/.test(text)) {
    return "warning";
  }
  return "info";
}

export function buildAlertStyle({ pathname, title, message }) {
  const theme = inferPageTheme(pathname);
  const kind = inferAlertKind(title, message);

  if (kind === "error") {
    return {
      background: "#fef2f2",
      color: "#991b1b",
      border: "1px solid #fecaca",
      borderLeft: "5px solid #ef4444",
      borderRadius: "14px",
      boxShadow: "0 18px 40px rgba(239, 68, 68, 0.12)"
    };
  }

  if (kind === "success") {
    return {
      background: "#f0fdf4",
      color: "#166534",
      border: "1px solid #bbf7d0",
      borderLeft: "5px solid #22c55e",
      borderRadius: "14px",
      boxShadow: "0 18px 40px rgba(34, 197, 94, 0.12)"
    };
  }

  if (kind === "warning") {
    return {
      background: "#fffbeb",
      color: "#92400e",
      border: "1px solid #fde68a",
      borderLeft: "5px solid #f59e0b",
      borderRadius: "14px",
      boxShadow: "0 18px 40px rgba(245, 158, 11, 0.12)"
    };
  }

  return {
    background: theme.accentSurface,
    color: theme.accentText,
    border: `1px solid ${theme.accentBorder}`,
    borderLeft: `5px solid ${theme.accent}`,
    borderRadius: "14px",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.10)"
  };
}
