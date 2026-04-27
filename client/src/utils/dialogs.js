import { toast as showToast } from "sonner";
import { buildAlertStyle } from "./alertStyles";

export function showAlert(message, title = "Notice") {
  if (typeof window === "undefined") return;
  const pathname = String(window.location?.pathname || "");
  const content =
    title && title !== "Notice" ? `${title}: ${String(message || "")}` : String(message || "");
  showToast(content, {
    style: buildAlertStyle({ pathname, title, message }),
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
