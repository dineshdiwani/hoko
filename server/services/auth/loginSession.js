const crypto = require("crypto");

const sessionStore = new Map();

const SESSION_TTL_MS = 10 * 60 * 1000;

function generateSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

function createLoginSession(mobile, otp) {
  const sessionId = generateSessionId();
  const session = {
    sessionId,
    mobile,
    otp,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    attempts: 0,
    verified: false
  };
  
  const key = `wa_login:${sessionId}`;
  sessionStore.set(key, session);
  
  const waLink = `https://wa.me/918079060554?text=SEND%20OTP`;
  
  return {
    sessionId,
    wa_link: waLink,
    expiresIn: Math.floor(SESSION_TTL_MS / 1000)
  };
}

function getSession(sessionId) {
  const key = `wa_login:${sessionId}`;
  const session = sessionStore.get(key);
  
  if (!session) {
    return null;
  }
  
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(key);
    return null;
  }
  
  return session;
}

function verifySessionOtp(sessionId, otp) {
  const session = getSession(sessionId);
  
  if (!session) {
    return { ok: false, reason: "expired" };
  }
  
  session.attempts += 1;
  
  if (session.attempts > 3) {
    sessionStore.delete(`wa_login:${sessionId}`);
    return { ok: false, reason: "locked" };
  }
  
  if (session.otp !== otp) {
    sessionStore.set(`wa_login:${sessionId}`, session);
    return { ok: false, reason: "invalid" };
  }
  
  session.verified = true;
  sessionStore.set(`wa_login:${sessionId}`, session);
  
  return { ok: true, mobile: session.mobile };
}

function markSessionVerified(sessionId) {
  const session = getSession(sessionId);
  if (session) {
    session.verified = true;
    sessionStore.set(`wa_login:${sessionId}`, session);
  }
}

function clearSession(sessionId) {
  sessionStore.delete(`wa_login:${sessionId}`);
}

function getSessionByMobile(mobile) {
  for (const [key, session] of sessionStore) {
    if (session.mobile === mobile) {
      return session;
    }
  }
  return null;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessionStore) {
    if (now > session.expiresAt) {
      sessionStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredSessions, 60 * 1000);

module.exports = {
  createLoginSession,
  getSession,
  verifySessionOtp,
  markSessionVerified,
  clearSession,
  getSessionByMobile,
  SESSION_TTL_MS
};
