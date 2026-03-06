import { useEffect, useRef, useState } from "react";
import socket, { connectSocket } from "../services/socket";
import {
  fetchNotifications,
  markAsRead,
  deleteNotification,
  clearNotifications
} from "../services/notifications";
import { getSession } from "../services/storage";

export default function NotificationCenter({ onNotificationClick }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const menuRef = useRef(null);

  useEffect(() => {
    const session = getSession();
    if (session?.token) {
      connectSocket();
    }
    load();

    const onNotification = (notif) => {
      setNotifications((prev) => [
        notif,
        ...prev,
      ]);
    };
    socket.on("notification", onNotification);

    return () =>
      socket.off("notification", onNotification);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  async function load() {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch {
      setNotifications([]);
    }
  }

  async function handleRead(id, notification) {
    setOpen(false);
    try {
      await markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === id ? { ...n, read: true } : n
        )
      );
    } catch {
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === id ? { ...n, read: true } : n
        )
      );
    }
    if (typeof onNotificationClick === "function") {
      onNotificationClick(notification);
    }
  }

  async function handleDelete(event, id) {
    event.stopPropagation();
    const notifId = String(id || "").trim();
    if (!notifId) return;
    try {
      await deleteNotification(notifId);
    } catch {}
    setNotifications((prev) => prev.filter((n) => String(n._id || n.id) !== notifId));
  }

  async function handleClearAll() {
    try {
      await clearNotifications();
    } catch {}
    setNotifications([]);
  }

  const unreadCount = notifications.filter(
    (n) => !n.read
  ).length;

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="ui-icon-button"
        aria-label="Notifications"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5 ui-icon-tone"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 ui-dot-danger text-xs px-1 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed top-16 left-2 right-2 w-auto sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:w-80 mt-2 bg-white shadow-lg rounded-lg border z-50 max-h-96 overflow-auto">
          {notifications.length > 0 && (
            <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => handleClearAll().catch(() => {})}
                className="text-xs font-semibold text-red-700 hover:text-red-800"
              >
                Clear all
              </button>
            </div>
          )}

          {notifications.length === 0 && (
            <p className="p-4 text-gray-500">
              No notifications
            </p>
          )}

          {notifications.map((n, i) => (
            <div
              key={n._id || n.id || i}
              onClick={() => handleRead(n._id || n.id, n)}
              className={`px-4 py-3 border-b cursor-pointer ${
                n.read
                  ? "bg-white"
                  : "ui-surface-info"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm break-words">{n.message}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(
                      n.createdAt || n.timestamp || Date.now()
                    ).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete notification"
                  title="Delete notification"
                  onClick={(event) => handleDelete(event, n._id || n.id)}
                  className="shrink-0 text-gray-500 hover:text-red-700 text-sm leading-none px-1"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
