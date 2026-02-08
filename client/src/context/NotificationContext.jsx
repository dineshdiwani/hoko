import { createContext, useEffect, useState } from "react";
import socket from "../services/socket";

export const NotificationContext = createContext();

export function NotificationProvider({ userId, children }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (userId) socket.emit("register", userId);

    socket.on("new-offer", data => {
      setNotifications(prev => [data, ...prev]);
    });

    socket.on("new-requirement", data => {
      setNotifications(prev => [data, ...prev]);
    });

    return () => {
      socket.off("new-offer");
      socket.off("new-requirement");
    };
  }, [userId]);

  return (
    <NotificationContext.Provider value={{ notifications }}>
      {children}
    </NotificationContext.Provider>
  );
}
