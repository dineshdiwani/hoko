import api from "./api";
import { getSession } from "./storage";
import { isNativeAppRuntime } from "../utils/runtime";
import {
  getNativeNotificationPermissionState,
  requestNativeNotificationPermission
} from "./runtimeNotifications";
import { ensureNativePushRegistration } from "./nativePush";

let inFlight = null;

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function upsertSubscription(subscription) {
  await api.post("/push/subscribe", {
    subscription: subscription?.toJSON ? subscription.toJSON() : subscription
  });
}

function hasValidSubscriptionKeys(subscription) {
  const endpoint = String(subscription?.endpoint || "").trim();
  const auth = String(subscription?.toJSON?.().keys?.auth || subscription?.keys?.auth || "").trim();
  const p256dh = String(subscription?.toJSON?.().keys?.p256dh || subscription?.keys?.p256dh || "").trim();
  return Boolean(endpoint && auth && p256dh);
}

async function ensurePushSubscriptionInternal(allowPermissionPrompt = false) {
  const session = getSession();
  if (!session?.token) return false;
  if (typeof window === "undefined") return false;
  if (isNativeAppRuntime()) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) return false;

  let permission = Notification.permission;
  if (permission === "default" && allowPermissionPrompt) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  const keyResponse = await api.get("/push/public-key");
  const publicKey = String(keyResponse?.data?.publicKey || "").trim();
  if (!publicKey) return false;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (!hasValidSubscriptionKeys(existing)) {
      try {
        await existing.unsubscribe();
      } catch {}
    } else {
      try {
        await upsertSubscription(existing);
        return true;
      } catch {
        // Fall through and re-create subscription if server upsert fails.
        try {
          await existing.unsubscribe();
        } catch {}
      }
    }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
  await upsertSubscription(subscription);
  return true;
}

export function getPushPermissionState() {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeAppRuntime()) return "native_app";
  if (!("Notification" in window)) return "unsupported";
  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) return "blocked_context";
  return String(Notification.permission || "default");
}

export async function requestPushPermissionAndSubscribe() {
  if (isNativeAppRuntime()) {
    const granted = await requestNativeNotificationPermission();
    if (!granted) return false;
    return ensureNativePushRegistration(true);
  }
  const ok = await ensurePushSubscriptionInternal(true);
  return Boolean(ok);
}

export async function getResolvedPushPermissionState() {
  if (isNativeAppRuntime()) {
    return getNativeNotificationPermissionState();
  }
  return getPushPermissionState();
}

export function ensurePushSubscription() {
  if (inFlight) return inFlight;
  inFlight = ensurePushSubscriptionInternal(false)
    .then(async (result) => {
      if (isNativeAppRuntime()) {
        return ensureNativePushRegistration(false);
      }
      return result;
    })
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function buildNotificationHelpText() {
  const origin = typeof window !== "undefined" ? window.location.origin : "this site";
  const ua = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
  const isAndroid = /android/i.test(ua);
  const isChrome = /chrome/i.test(ua) && !/edg|opr|opera/i.test(ua);
  const lines = [];

  if (isAndroid && isChrome) {
    lines.push("Android Chrome: Tap lock icon > Permissions > Notifications > Allow.");
    lines.push("If lock icon is hidden: Chrome menu > Site settings > Notifications > Allow.");
  } else {
    lines.push("Open your browser site permissions for this website and allow Notifications.");
  }
  lines.push(`Site: ${origin}`);
  lines.push("After enabling, reload the app once.");
  return lines.join("\n");
}
