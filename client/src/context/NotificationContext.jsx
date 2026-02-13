import { createContext, useEffect, useState } from "react";
import socket from "../services/socket";

export const NotificationContext = createContext();

export function NotificationProvider({ userId, children }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (userId) socket.emit("join", userId);

    socket.on("notification", (data) => {
      setNotifications((prev) => [data, ...prev]);
    });

    return () => {
      socket.off("notification");
    };
  }, [userId]);

  return (
    <NotificationContext.Provider value={{ notifications }}>
      {children}
    </NotificationContext.Provider>
  );
}
