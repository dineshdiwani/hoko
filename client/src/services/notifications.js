import api from "./api";

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
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId) {
  await api.delete(`/notifications/${notificationId}`);
}

/**
 * Delete all notifications for current user
 */
export async function clearNotifications() {
  await api.delete("/notifications");
}
