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
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        registration.update().catch(() => {});
        registration.addEventListener("updatefound", () => {
          const nextWorker = registration.installing;
          if (!nextWorker) return;
          nextWorker.addEventListener("statechange", () => {
            if (
              nextWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {});
  });
}
