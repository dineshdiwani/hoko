import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const stored =
      JSON.parse(localStorage.getItem("notifications")) || [];
    setNotifications(stored);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
const notifications =
  JSON.parse(localStorage.getItem("seller_notifications")) || [];

  const handleClick = () => {
    const updated = notifications.map(n => ({
      ...n,
      read: true
    }));
    localStorage.setItem("notifications", JSON.stringify(updated));
    setNotifications(updated);
    navigate("/buyer/offers");

{notifications.map((n, i) => (
  <div key={i} className="p-2 border-b text-sm">
    {n.message}
  </div>
))}


  };

  return (
    <div className="relative cursor-pointer" onClick={handleClick}>
      🔔
      {unreadCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 rounded-full">
          {unreadCount}
        </span>
      )}
    </div>
  );
}
