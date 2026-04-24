import { toast as showToast, icons } from "sonner";

export const toast = {
  success: (message, options = {}) => {
    showToast(message, { ...options, style: { background: "#22c55e", color: "#fff" } });
  },
  error: (message, options = {}) => {
    showToast(message, { ...options, style: { background: "#ef4444", color: "#fff" } });
  },
  warning: (message, options = {}) => {
    showToast(message, { ...options, style: { background: "#f59e0b", color: "#fff" } });
  },
  info: (message, options = {}) => {
    showToast(message, { ...options, style: { background: "#3b82f6", color: "#fff" } });
  }
};

export const toastPromise = (promise, msgs = {}) => {
  return showToast.promise(promise, {
    loading: msgs.loading || "Loading...",
    success: msgs.success || "Done!",
    error: msgs.error || "Error"
  });
};