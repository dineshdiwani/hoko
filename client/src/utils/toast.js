import { toast as showToast, icons } from "sonner";
import { buildAlertStyle } from "./alertStyles";

export const toast = {
  success: (message, options = {}) => {
    showToast(message, {
      ...options,
      style: {
        ...buildAlertStyle({
          pathname: typeof window !== "undefined" ? window.location?.pathname : "",
          title: "Success",
          message
        }),
        borderLeft: "5px solid #22c55e"
      }
    });
  },
  error: (message, options = {}) => {
    showToast(message, {
      ...options,
      style: buildAlertStyle({
        pathname: typeof window !== "undefined" ? window.location?.pathname : "",
        title: "Error",
        message
      })
    });
  },
  warning: (message, options = {}) => {
    showToast(message, {
      ...options,
      style: {
        ...buildAlertStyle({
          pathname: typeof window !== "undefined" ? window.location?.pathname : "",
          title: "Warning",
          message
        }),
        borderLeft: "5px solid #f59e0b"
      }
    });
  },
  info: (message, options = {}) => {
    showToast(message, {
      ...options,
      style: buildAlertStyle({
        pathname: typeof window !== "undefined" ? window.location?.pathname : "",
        title: "Info",
        message
      })
    });
  }
};

export const toastPromise = (promise, msgs = {}) => {
  return showToast.promise(promise, {
    loading: msgs.loading || "Loading...",
    success: msgs.success || "Done!",
    error: msgs.error || "Error"
  });
};
