import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SellerNotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const stored =
      JSON.parse(
        localStorage.getItem("seller_notifications")
      ) || [];
    setNotifications(stored);
  }, []);

  const unreadCount = notifications.filter(
    (n) => !n.read
  ).length;

  const handleClick = () => {
    const updated = notifications.map((n) => ({
      ...n,
      read: true,
    }));

    localStorage.setItem(
      "seller_notifications",
      JSON.stringify(updated)
    );

    setNotifications(updated);

    navigate("/seller/dashboard");
  };

  return (
    <div
      className="relative cursor-pointer"
      onClick={handleClick}
    >
      🔔
      {unreadCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 rounded-full">
          {unreadCount}
        </span>
      )}
    </div>
  );
}
