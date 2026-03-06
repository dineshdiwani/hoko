import api from "./api";
import { getSession } from "./storage";

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

async function ensurePushSubscriptionInternal() {
  const session = getSession();
  if (!session?.token) return false;
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) return false;

  let permission = Notification.permission;
  if (permission === "default") {
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

export function ensurePushSubscription() {
  if (inFlight) return inFlight;
  inFlight = ensurePushSubscriptionInternal()
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
