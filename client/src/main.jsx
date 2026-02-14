import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { showAlert } from "./utils/dialogs";

const shouldRedirectToWww =
  typeof window !== "undefined" &&
  window.location.hostname === "hokoapp.in";

if (shouldRedirectToWww) {
  window.location.replace(
    `https://www.hokoapp.in${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

if (!shouldRedirectToWww) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

window.alert = showAlert;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}
