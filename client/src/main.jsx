import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { showAlert } from "./utils/dialogs";

function removeGoogleOneTapUi() {
  const selectors = [
    "#credential_picker_container",
    "#credential_picker_iframe",
    "iframe[src*='accounts.google.com/gsi/']",
    "div[id*='credential_picker']"
  ];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

window.alert = showAlert;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) =>
            registration.unregister()
          )
        )
      )
      .catch(() => {});
  });
}

if (typeof window !== "undefined" && "caches" in window) {
  window.addEventListener("load", () => {
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      )
      .catch(() => {});
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    try {
      window.google?.accounts?.id?.cancel?.();
      window.google?.accounts?.id?.disableAutoSelect?.();
    } catch (_) {}
    removeGoogleOneTapUi();
    const observer = new MutationObserver(() => {
      removeGoogleOneTapUi();
      try {
        window.google?.accounts?.id?.cancel?.();
      } catch (_) {}
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });
}
