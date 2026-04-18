import { useEffect, useMemo, useState } from "react";
import { confirmDialog, showAlert } from "../utils/dialogs";
import {
  buildNotificationHelpText,
  getPushPermissionState,
  getResolvedPushPermissionState,
  requestPushPermissionAndSubscribe
} from "../services/pushNotifications";
import { getSession } from "../services/storage";

export default function NotificationPermissionPrompt() {
  const [state, setState] = useState(() => getPushPermissionState());
  const [busy, setBusy] = useState(false);
  const session = getSession();

  useEffect(() => {
    const update = () => {
      getResolvedPushPermissionState().then(setState).catch(() => {
        setState(getPushPermissionState());
      });
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);

  const isLoggedIn = Boolean(session?.token);
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  const shouldRender =
    !isAdminRoute &&
    (state === "default" || state === "prompt");

  const helpText = useMemo(() => buildNotificationHelpText(), []);

  async function enableNotifications() {
    const proceed = await confirmDialog(
      "Enable push notifications for offers, chat, and updates even when app is in background?",
      {
        title: "Enable Notifications",
        confirmText: "Continue",
        cancelText: "Not now"
      }
    );
    if (!proceed) return;

    setBusy(true);
    try {
      const ok = await requestPushPermissionAndSubscribe();
      const next = await getResolvedPushPermissionState();
      setState(next);
      if (ok || next === "granted") {
        showAlert("Notifications enabled successfully.");
      } else if (next === "denied") {
        showAlert(`Notification permission is blocked.\n\n${helpText}`, "Permission Blocked");
      } else {
        showAlert("Notification permission was not granted.");
      }
    } finally {
      setBusy(false);
    }
  }

  function showHelp() {
    showAlert(helpText, "Enable Notifications");
  }

  if (!shouldRender) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 md:left-auto md:w-[28rem] z-[65] rounded-xl border border-amber-200 bg-amber-50 shadow-lg p-3">
      <p className="text-sm font-semibold text-amber-900">
        {state === "default"
          ? "Turn on notifications to receive updates in background."
          : "Notifications are blocked for this site."}
      </p>
      <p className="mt-1 text-xs text-amber-800">
        {state === "default"
          ? "Tap Enable and allow the notification permission prompt."
          : "Tap How to Enable to open notification permission steps."}
      </p>
      <div className="mt-3 flex gap-2">
        {state === "default" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => enableNotifications().catch(() => {})}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-amber-700 disabled:opacity-60"
          >
            {busy ? "Enabling..." : "Enable Notifications"}
          </button>
        ) : (
          <button
            type="button"
            onClick={showHelp}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-amber-700"
          >
            How to Enable
          </button>
        )}
      </div>
    </div>
  );
}
