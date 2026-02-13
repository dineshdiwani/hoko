import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchNotifications,
  markAsRead,
} from "../services/notifications";

export default function SellerNotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchNotifications()
      .then((data) => setNotifications(data))
      .catch(() => setNotifications([]));
  }, []);

  const unreadCount = notifications.filter(
    (n) => !n.read
  ).length;

  const handleClick = () => {
    const unread = notifications.filter((n) => !n.read);
    Promise.all(
      unread.map((n) => markAsRead(n._id || n.id))
    ).finally(() => {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      );
    });

    navigate("/seller/dashboard");
  };

  return (
    <div
      className="relative cursor-pointer"
      onClick={handleClick}
    >
      !
      {unreadCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 rounded-full">
          {unreadCount}
        </span>
      )}
    </div>
  );
}
