import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { showAlert } from "./utils/dialogs";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
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
