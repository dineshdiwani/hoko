let confirmId = 0;
const confirmResolvers = new Map();

export function showAlert(message, title = "Notice") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app-alert", {
      detail: { title, message: String(message || "") }
    })
  );
}

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
