import { toast as showToast } from "sonner";

export function showAlert(message, title = "Notice") {
  if (typeof window === "undefined") return;
  showToast(message || "", { 
    style: { background: "#333", color: "#fff", borderRadius: "8px" },
    duration: 3000
  });
}

let confirmId = 0;
const confirmResolvers = new Map();

export function confirmDialog(message, options = {}) {
  if (typeof window === "undefined") return Promise.resolve(false);
  const id = ++confirmId;
  const payload = {
    id,
    title: options.title || "Confirm",
    message: String(message || ""),
    confirmText: options.confirmText || "Confirm",
    cancelText: options.cancelText || "Cancel"
  };

  return new Promise((resolve) => {
    confirmResolvers.set(id, resolve);
    window.dispatchEvent(new CustomEvent("app-confirm", { detail: payload }));
  });
}

export function resolveConfirm(id, value) {
  const resolver = confirmResolvers.get(id);
  if (resolver) {
    resolver(Boolean(value));
    confirmResolvers.delete(id);
  }
}
