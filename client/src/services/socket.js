import { io } from "socket.io-client";

/**
 * Socket.io client instance
 * Connects to backend server
 */
const socket = io("http://localhost:5000", {
  transports: ["websocket"],
  autoConnect: true
});

export default socket;
