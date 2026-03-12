import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeAppRuntime } from "../utils/runtime";

let nativePermissionRequested = false;

async function ensureNativePermission() {
  if (!isNativeAppRuntime()) return false;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    if (nativePermissionRequested) return false;
    nativePermissionRequested = true;
    const next = await LocalNotifications.requestPermissions();
    return next.display === "granted";
  } catch {
    return false;
  }
}

export async function getNativeNotificationPermissionState() {
  if (!isNativeAppRuntime()) return "unsupported";
  try {
    const current = await LocalNotifications.checkPermissions();
    return String(current?.display || "prompt");
  } catch {
    return "unsupported";
  }
}

export async function requestNativeNotificationPermission() {
  if (!isNativeAppRuntime()) return false;
  try {
    nativePermissionRequested = true;
    const result = await LocalNotifications.requestPermissions();
    return result?.display === "granted";
  } catch {
    return false;
  }
}

export async function showRuntimeNotification({
  title = "HOKO",
  body = "You have a new notification",
  tag,
  data = {}
}) {
  if (isNativeAppRuntime()) {
    const granted = await ensureNativePermission();
    if (!granted) return false;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2147483000),
          title: String(title),
          body: String(body),
          extra: data,
          schedule: { at: new Date(Date.now() + 250) }
        }
      ]
    });
    return true;
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission !== "granted") {
    return false;
  }

  const options = {
    body: String(body),
    icon: "/app-icon-192.png",
    badge: "/app-icon-192.png",
    tag: String(tag || `live-${Date.now()}`),
    data
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(String(title), options);
      return true;
    }
  }

  new Notification(String(title), options);
  return true;
}
