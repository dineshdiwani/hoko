import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { showAlert } from "./utils/dialogs";
import { Toaster } from "sonner";
import "./services/sentry";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <Toaster 
      position="top-center" 
      toastOptions={{ 
        style: { 
          background: "#333", 
          color: "#fff",
          borderRadius: "8px",
          fontSize: "14px"
        },
        duration: 3000
      }}
    />
  </React.StrictMode>
);

window.alert = showAlert;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then((registration) => {
          registration.update().catch(() => {});
        })
        .catch(() => {});
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(registerServiceWorker, { timeout: 3000 });
      return;
    }

    window.setTimeout(registerServiceWorker, 1200);
  });
}
