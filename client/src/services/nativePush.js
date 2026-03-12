import api from "./api";
import { getNativePushToken, getSession, setNativePushToken } from "./storage";
import { isNativeAppRuntime } from "../utils/runtime";
import { registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

let listenersBound = false;
let registrationInFlight = null;
let lastRegisteredToken = "";
let listenerBindingPromise = null;
let pendingRegistrationResolve = null;
const FcmBridge = registerPlugin("FcmBridge");

function resolvePendingRegistration(success) {
  if (typeof pendingRegistrationResolve === "function") {
    pendingRegistrationResolve(Boolean(success));
    pendingRegistrationResolve = null;
  }
}

export function isNativePushEnabled() {
  const raw = String(import.meta.env.VITE_ENABLE_NATIVE_PUSH || "").trim().toLowerCase();
  if (!raw) return true;
  return raw === "true" || raw === "1" || raw === "yes";
}

async function getDirectNativeFcmToken() {
  if (!isNativeAppRuntime()) return "";
  try {
    const result = await FcmBridge.getToken();
    return String(result?.token || "").trim();
  } catch {
    return "";
  }
}

export async function getNativePushPermissionState() {
  if (!isNativeAppRuntime() || !isNativePushEnabled()) return "unsupported";
  try {
    const current = await PushNotifications.checkPermissions();
    return String(current?.receive || "prompt");
  } catch {
    return "unsupported";
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
  if (!trimmed) {
    resolvePendingRegistration(false);
    return false;
  }
  setNativePushToken(trimmed);
  if (trimmed === lastRegisteredToken) {
    resolvePendingRegistration(true);
    return true;
  }
  await api.post("/push/native-token", {
    token: trimmed,
    platform: "android"
  });
  lastRegisteredToken = trimmed;
  resolvePendingRegistration(true);
  return true;
}

async function bindListeners() {
  if (listenersBound || !isNativeAppRuntime()) return;
  if (listenerBindingPromise) return listenerBindingPromise;
  listenerBindingPromise = Promise.all([
    PushNotifications.addListener("registration", (token) => {
      registerNativeToken(token?.value || "").catch(() => {
        resolvePendingRegistration(false);
      });
    }),
    PushNotifications.addListener("registrationError", () => {
      resolvePendingRegistration(false);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
      openNotificationUrl(notification);
    })
  ])
    .then(() => {
      listenersBound = true;
    })
    .finally(() => {
      listenerBindingPromise = null;
    });
  return listenerBindingPromise;
}

export async function ensureNativePushRegistration(allowPermissionPrompt = false) {
  if (!isNativeAppRuntime()) return false;
  if (!isNativePushEnabled()) return false;
  const session = getSession();
  if (!session?.token) return false;
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    await bindListeners();

    const cachedToken = getNativePushToken();
    if (cachedToken) {
      try {
        await registerNativeToken(cachedToken);
        return true;
      } catch {}
    }

    let receive = "prompt";
    try {
      const current = await PushNotifications.checkPermissions();
      receive = current?.receive || "prompt";
    } catch {}

    if (receive !== "granted" && allowPermissionPrompt) {
      const requested = await PushNotifications.requestPermissions();
      receive = requested?.receive || receive;
    }
    if (receive !== "granted") return false;

    const directToken = await getDirectNativeFcmToken();
    if (directToken) {
      await registerNativeToken(directToken);
      return true;
    }

    const registrationResult = new Promise((resolve) => {
      pendingRegistrationResolve = resolve;
      window.setTimeout(() => {
        resolvePendingRegistration(false);
      }, 8000);
    });

    await PushNotifications.register();
    return registrationResult;
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
    await PushNotifications.unregister();
  } catch {}
  lastRegisteredToken = "";
  setNativePushToken("");
}
