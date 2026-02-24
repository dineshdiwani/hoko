import { createContext, useEffect, useState } from "react";
import socket, { connectSocket } from "../services/socket";

export const NotificationContext = createContext();

export function NotificationProvider({ userId, children }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (userId) connectSocket();

    const onNotification = (data) => {
      setNotifications((prev) => [data, ...prev]);
    };
    socket.on("notification", onNotification);

    return () => {
      socket.off("notification", onNotification);
    };
  }, [userId]);

  return (
    <NotificationContext.Provider value={{ notifications }}>
      {children}
    </NotificationContext.Provider>
  );
}
