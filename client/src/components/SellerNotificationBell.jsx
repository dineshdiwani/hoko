import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchNotifications,
  markAsRead,
  markNotificationsReadByContext,
  deleteNotification,
  clearNotifications
} from "../services/notifications";
import socket, { connectSocket } from "../services/socket";
import { getSession } from "../services/storage";

function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

function getNavUrl(notif) {
  const data = notif?.data || {};
  if (data.url) return data.url;
  if (data.requirementId) return `/seller/requirement/${data.requirementId}`;
  if (data.offerId) return `/seller/offers`;
  if (data.chatId) return `/seller/chat/${data.chatId}`;
  return "/seller/dashboard";
}

export default function SellerNotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const session = getSession();
    if (session?.token) {
      connectSocket();
    }
    fetchNotifications()
      .then((data) => setNotifications(data))
      .catch(() => setNotifications([]));

    const onNotification = (notif) => {
      setNotifications((prev) => [notif, ...prev]);
    };
    socket.on("notification", onNotification);

    return () => {
      socket.off("notification", onNotification);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function handleItemClick(notif) {
    if (!notif.read) {
      await markAsRead(notif._id || notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, read: true } : n))
      );
    }
    setOpen(false);
    navigate(getNavUrl(notif));
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    await deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n._id !== id));
  }

  async function handleMarkAllRead() {
    await markNotificationsReadByContext({});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function handleClearAll() {
    await clearNotifications();
    setNotifications([]);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="relative cursor-pointer p-2 rounded-lg hover:bg-gray-100"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Notifications</h3>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded"
                  onClick={handleMarkAllRead}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded"
                  onClick={handleClearAll}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`flex items-start gap-3 p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer group transition-colors ${
                    !notif.read ? "bg-blue-50" : ""
                  }`}
                  onClick={() => handleItemClick(notif)}
                >
                  {!notif.read && (
                    <span className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {notif.title || "Notification"}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                      {notif.body || notif.message || ""}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatTime(notif.createdAt)}
                    </p>
                  </div>
                  <button
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1"
                    onClick={(e) => handleDelete(notif._id, e)}
                    aria-label="Delete notification"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
