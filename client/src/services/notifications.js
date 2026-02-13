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
