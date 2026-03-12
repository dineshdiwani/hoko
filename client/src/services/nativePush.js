import { PushNotifications } from "@capacitor/push-notifications";
import api from "./api";
import { getSession } from "./storage";
import { isNativeAppRuntime } from "../utils/runtime";

let listenersBound = false;
let registrationInFlight = null;
let lastRegisteredToken = "";

function getPlatformName() {
  return "android";
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
    platform: getPlatformName()
  });
  lastRegisteredToken = trimmed;
  return true;
}

function bindListeners() {
  if (listenersBound || !isNativeAppRuntime()) return;
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
  const session = getSession();
  if (!session?.token) return false;
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    bindListeners();

    const current = await PushNotifications.checkPermissions();
    let receive = current?.receive || "prompt";
    if (receive !== "granted" && allowPermissionPrompt) {
      const requested = await PushNotifications.requestPermissions();
      receive = requested?.receive || receive;
    }
    if (receive !== "granted") {
      return false;
    }

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
  try {
    if (lastRegisteredToken) {
      await api.post("/push/native-token/unsubscribe", { token: lastRegisteredToken });
    } else {
      await api.post("/push/native-token/unsubscribe", {});
    }
  } catch {}
  try {
    await PushNotifications.unregister();
  } catch {}
  lastRegisteredToken = "";
}
