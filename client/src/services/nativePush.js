import api from "./api";
import { getSession } from "./storage";
import { isNativeAppRuntime } from "../utils/runtime";

let listenersBound = false;
let registrationInFlight = null;
let lastRegisteredToken = "";

export function isNativePushEnabled() {
  const raw = String(import.meta.env.VITE_ENABLE_NATIVE_PUSH || "").trim().toLowerCase();
  if (!raw) return true;
  return raw === "true" || raw === "1" || raw === "yes";
}

async function getPushNotificationsPlugin() {
  if (!isNativeAppRuntime()) return null;
  try {
    const module = await import("@capacitor/push-notifications");
    return module?.PushNotifications || null;
  } catch {
    return null;
  }
}

function getNotificationUrl(notification) {
  const directUrl = notification?.data?.url || notification?.notification?.data?.url;
  return String(directUrl || "").trim();
}

function openNotificationUrl(notification) {
  const url = getNotificationUrl(notification);
  if (!url || typeof window === "undefined") return;
  if (/^https?:\/\//i.test(url)) {
    window.location.href = url;
    return;
  }
  window.location.href = url.startsWith("/") ? url : `/${url}`;
}

async function registerNativeToken(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed || trimmed === lastRegisteredToken) return true;
  await api.post("/push/native-token", {
    token: trimmed,
    platform: "android"
  });
  lastRegisteredToken = trimmed;
  return true;
}

async function bindListeners() {
  if (listenersBound || !isNativeAppRuntime()) return;
  const PushNotifications = await getPushNotificationsPlugin();
  if (!PushNotifications) return;
  listenersBound = true;

  PushNotifications.addListener("registration", (token) => {
    registerNativeToken(token?.value || "").catch(() => {});
  });

  PushNotifications.addListener("registrationError", () => {});

  PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
    openNotificationUrl(notification);
  });
}

export async function ensureNativePushRegistration(allowPermissionPrompt = false) {
  if (!isNativeAppRuntime()) return false;
  if (!isNativePushEnabled()) return false;
  const session = getSession();
  if (!session?.token) return false;
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    const PushNotifications = await getPushNotificationsPlugin();
    if (!PushNotifications) return false;
    await bindListeners();

    const current = await PushNotifications.checkPermissions();
    let receive = current?.receive || "prompt";
    if (receive !== "granted" && allowPermissionPrompt) {
      const requested = await PushNotifications.requestPermissions();
      receive = requested?.receive || receive;
    }
    if (receive !== "granted") return false;

    await PushNotifications.register();
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      registrationInFlight = null;
    });

  return registrationInFlight;
}

export async function unregisterNativePushToken() {
  if (!isNativeAppRuntime()) return;
  if (!isNativePushEnabled()) return;
  try {
    if (lastRegisteredToken) {
      await api.post("/push/native-token/unsubscribe", { token: lastRegisteredToken });
    } else {
      await api.post("/push/native-token/unsubscribe", {});
    }
  } catch {}

  try {
    const PushNotifications = await getPushNotificationsPlugin();
    if (PushNotifications) {
      await PushNotifications.unregister();
    }
  } catch {}
  lastRegisteredToken = "";
}
