import { useEffect, useState } from "react";
import socket from "../socket";
import api from "../utils/api";
import DocumentModal from "./DocumentModal";

export default function ChatModal({ open, onClose, sellerId, sellerName }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [showDocs, setShowDocs] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    if (!open || !sellerId || !user) return;

    // 🔄 Load chat history
    api
      .get("/chat/history", {
        params: {
          user1: user.mobile,
          user2: sellerId,
        },
      })
      .then((res) => {
        const history = res.data || [];
        setMessages(
          history.map((m) => ({
            message: m.message,
            fromSelf: m.from === user.mobile,
          }))
        );
      })
      .catch(() => {
        console.warn("Chat history unavailable");
      });

    const handler = (msg) => {
      setMessages((prev) => [
        ...prev,
        { message: msg.message, fromSelf: false },
      ]);
    };

    socket.on("receive_message", handler);

    return () => {
      socket.off("receive_message", handler);
    };
  }, [open, sellerId]);

  if (!open) return null;

  function sendMessage() {
    if (!text.trim()) return;

    socket.emit("send_message", {
      from: user.mobile,
      to: sellerId,
      message: text,
    });

    setMessages((prev) => [
      ...prev,
      { message: text, fromSelf: true },
    ]);

    setText("");
  }

  return (
    <>
      {/* Chat UI */}
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white w-96 rounded shadow-lg flex flex-col">
          <div className="p-3 border-b flex justify-between items-center">
            <h2 className="font-semibold">
              Chat with {sellerName}
            </h2>
            <button onClick={onClose}>✖</button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-2 rounded max-w-[80%] ${
                  m.fromSelf
                    ? "bg-blue-500 text-white ml-auto"
                    : "bg-gray-200"
                }`}
              >
                {m.message}
              </div>
            ))}
          </div>

          <div className="p-3 border-t flex gap-2">
            <button
              className="px-2 bg-gray-700 text-white rounded"
              onClick={() => setShowDocs(true)}
            >
              📎
            </button>

            <input
              className="flex-1 border rounded px-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type message…"
            />

            <button
              onClick={sendMessage}
              className="px-3 bg-blue-600 text-white rounded"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Documents Modal */}
      <DocumentModal
        open={showDocs}
        onClose={() => setShowDocs(false)}
        sellerId={sellerId}
      />
    </>
  );
}
