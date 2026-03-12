const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let cachedApp = null;
let initAttempted = false;

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function readServiceAccountFromEnv() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey
    };
  }

  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: normalizePrivateKey(parsed.private_key)
        };
      }
    } catch {}
  }

  return null;
}

function readServiceAccountFromDisk() {
  const explicitPath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  const candidates = [
    explicitPath,
    path.join(__dirname, "..", "firebase-service-account.json"),
    path.join(__dirname, "..", "firebase-service-account..json"),
    path.join(process.cwd(), "server", "firebase-service-account.json"),
    path.join(process.cwd(), "server", "firebase-service-account..json"),
    path.join(process.cwd(), "firebase-service-account.json")
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: normalizePrivateKey(parsed.private_key)
        };
      }
    } catch {}
  }

  return null;
}

function getFirebaseApp() {
  if (cachedApp) return cachedApp;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    const serviceAccount = readServiceAccountFromEnv() || readServiceAccountFromDisk();
    if (serviceAccount) {
      cachedApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      return cachedApp;
    }

    if (String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim()) {
      cachedApp = admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      return cachedApp;
    }
  } catch (error) {
    console.warn("Firebase admin init failed:", error?.message || error);
  }

  return null;
}

function getFirebaseMessaging() {
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    return admin.messaging(app);
  } catch {
    return null;
  }
}

function isFirebaseMessagingConfigured() {
  return Boolean(getFirebaseMessaging());
}

module.exports = {
  getFirebaseMessaging,
  isFirebaseMessagingConfigured
};
