import api from "./api";

function notifyNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("notifications:changed"));
}

/**
 * Fetch notifications for logged-in user
 */
export async function fetchNotifications() {
  const res = await api.get("/notifications");
  return res.data;
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId) {
  await api.post(`/notifications/${notificationId}/read`);
  notifyNotificationsChanged();
}

export async function markNotificationsReadByContext(payload) {
  await api.post("/notifications/read-context", payload || {});
  notifyNotificationsChanged();
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId) {
  await api.delete(`/notifications/${notificationId}`);
  notifyNotificationsChanged();
}

/**
 * Delete all notifications for current user
 */
export async function clearNotifications() {
  await api.delete("/notifications");
  notifyNotificationsChanged();
}
