// auth.js
import { getSession, clearSession } from "./storage";

export { getSession };

export function isLoggedIn() {
  const session = getSession();
  return Boolean(session?.token);
}

export function getRole() {
  const session = getSession();
  return session?.role || null;
}

export function getUser() {
  const session = getSession();
  return session || null;
}

export function requireAuth(role) {
  const session = getSession();

  if (!session || !session.token) return false;
  if (role && session.role !== role) return false;

  return true;
}

export function logout(navigate) {
  clearSession();
  navigate("/");
}
