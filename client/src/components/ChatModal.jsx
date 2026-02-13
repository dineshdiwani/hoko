import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";
import api from "../services/api";
import { getSession } from "../services/storage";

export default function ChatModal({ open, onClose, sellerId, sellerName, requirementId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [counterPrice, setCounterPrice] = useState("");
  const [deliveryBy, setDeliveryBy] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const session = getSession();
  const buyerId = session?._id;

  useEffect(() => {
    if (!open || !sellerId || !buyerId || !requirementId) return;

    socket.emit("join", buyerId);

    // Load chat history
    api
      .get("/chat/history", {
        params: {
          requirementId,
          userId: buyerId,
        },
      })
      .then((res) => {
        const history = res.data || [];
        setMessages(
          history.map((m) => ({
            message: m.message,
            fromSelf: String(m.fromUserId) === String(buyerId),
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
  }, [open, sellerId, buyerId, requirementId]);

  if (!open) return null;

  useEffect(() => {
    if (!open) return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript =
        event.results?.[0]?.[0]?.transcript || "";
      setText((prev) =>
        prev ? `${prev} ${transcript}`.trim() : transcript
      );
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [open]);

  function toggleMic() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert("Speech to text is not supported in this browser.");
      return;
    }
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }

  async function uploadFiles(fileList) {
    if (!buyerId || !sellerId) {
      alert("Chat users not ready yet.");
      return;
    }
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const allowed = [
      ".jpg",
      ".jpeg",
      ".png",
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx"
    ];

    const valid = files.filter((file) => {
      const name = String(file.name || "").toLowerCase();
      return allowed.some((ext) => name.endsWith(ext));
    });

    if (valid.length !== files.length) {
      alert("Only jpg, png, pdf, docx, doc, xlsx, xls files are allowed");
    }
    if (!valid.length) return;

    try {
      setUploading(true);
      for (const file of valid) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("from", buyerId);
        formData.append("to", sellerId);
        await api.post("/chat-files/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      }
      alert("Document(s) uploaded");
    } catch {
      alert("Failed to upload document(s).");
    } finally {
      setUploading(false);
    }
  }

  function sendMessage() {
    if (!text.trim()) return;

    socket.emit("send_message", {
      fromUserId: buyerId,
      toUserId: sellerId,
      requirementId,
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
        <div
          className={`bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] ${
            isDragging ? "ring-2 ring-indigo-500" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            uploadFiles(e.dataTransfer.files);
          }}
        >
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="font-semibold">
              Chat with {sellerName}
            </h2>
            <button onClick={onClose}>Close</button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-2 h-[60vh] bg-gray-50">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-2xl max-w-[80%] text-sm ${
                  m.fromSelf
                    ? "bg-green-600 text-white ml-auto"
                    : "bg-white border"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">
                  {m.message}
                </div>
                {m.fromSelf && (
                  <div className="text-[10px] opacity-80 text-right mt-1">
                    ✓✓
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-4 pb-3">
            <p className="text-xs text-gray-500 mb-2">
              Quick counter
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                value={counterPrice}
                onChange={(e) => setCounterPrice(e.target.value)}
                placeholder="Rs X"
                className="flex-1 border rounded px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={deliveryBy}
                onChange={(e) => setDeliveryBy(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
              <button
                onClick={() => {
                  const price = String(counterPrice || "").trim();
                  const date = String(deliveryBy || "").trim();
                  if (!price || !date) {
                    alert("Please enter price and delivery date");
                    return;
                  }
                  setText(
                    `Can you do Rs ${price} with delivery by ${date}?`
                  );
                }}
                className="px-3 bg-gray-900 text-white rounded text-sm"
              >
                Insert
              </button>
            </div>
          </div>

          <div className="p-4 border-t flex gap-2 items-center">
            <button
              className="px-3 py-2 border rounded-lg text-sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading..." : "Share doc"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files)}
            />

            <textarea
              rows={3}
              className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type message..."
            />

            <button
              className={`w-10 h-10 border rounded-full flex items-center justify-center ${
                isListening ? "bg-green-600 border-green-600" : ""
              }`}
              onClick={toggleMic}
              title="Speech to text"
              aria-label="Speech to text"
            >
              <svg
                viewBox="0 0 24 24"
                className={`w-5 h-5 ${
                  isListening ? "text-white" : "text-gray-600"
                }`}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V20H9v2h6v-2h-2v-2.08A7 7 0 0 0 19 11h-2z" />
              </svg>
            </button>

            <button
              onClick={sendMessage}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
