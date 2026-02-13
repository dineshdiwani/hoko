import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";
import {
  fetchNotifications,
  markAsRead,
} from "../services/notifications";
import { getSession } from "../services/storage";

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const menuRef = useRef(null);

  useEffect(() => {
    const session = getSession();
    const roomId =
      session?._id ||
      session?.userId ||
      session?.id ||
      session?.mobile;
    if (roomId) {
      socket.emit("join", roomId);
    }
    load();

    socket.on("notification", (notif) => {
      setNotifications((prev) => [
        notif,
        ...prev,
      ]);
    });

    return () =>
      socket.off("notification");
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

  async function handleRead(id) {
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
  }

  const unreadCount = notifications.filter(
    (n) => !n.read
  ).length;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-10 h-10 inline-flex items-center justify-center rounded-full border border-amber-200 bg-white hover:bg-amber-50"
        aria-label="Notifications"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5 text-amber-500"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs px-1 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white shadow-lg rounded-lg border z-50 max-h-96 overflow-auto">
          {notifications.length === 0 && (
            <p className="p-4 text-gray-500">
              No notifications
            </p>
          )}

          {notifications.map((n, i) => (
            <div
              key={n._id || n.id || i}
              onClick={() => handleRead(n._id || n.id)}
              className={`px-4 py-3 border-b cursor-pointer ${
                n.read
                  ? "bg-white"
                  : "bg-indigo-50"
              }`}
            >
              <p className="text-sm">
                {n.message}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(
                  n.createdAt || n.timestamp || Date.now()
                ).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
