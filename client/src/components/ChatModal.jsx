import { useEffect, useMemo, useRef, useState } from "react";
import socket from "../services/socket";
import api from "../services/api";
import { getSession } from "../services/storage";

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric"
  });
}

function toMessageShape(msg, currentUserId) {
  const fromSelf = String(msg.fromUserId) === String(currentUserId);
  const isRead = Boolean(msg.isRead);
  const messageType = msg.messageType === "file" ? "file" : "text";
  return {
    id: msg._id || msg.id || null,
    tempId: msg.tempId || null,
    message: msg.message || "",
    requirementId: msg.requirementId || null,
    fromUserId: msg.fromUserId || msg.from || null,
    toUserId: msg.toUserId || null,
    messageType,
    attachment: msg.attachment || null,
    createdAt: msg.createdAt || msg.time || new Date().toISOString(),
    isRead,
    readAt: msg.readAt || null,
    fromSelf,
    status: fromSelf ? (isRead ? "read" : "sent") : null
  };
}

function isNearDuplicate(a, b) {
  if (!a || !b) return false;
  const sameId = a.id && b.id && String(a.id) === String(b.id);
  if (sameId) return true;
  const sameTempId =
    a.tempId && b.tempId && String(a.tempId) === String(b.tempId);
  if (sameTempId) return true;

  const sameCore =
    String(a.message || "").trim() === String(b.message || "").trim() &&
    String(a.fromUserId || "") === String(b.fromUserId || "") &&
    String(a.toUserId || "") === String(b.toUserId || "") &&
    String(a.requirementId || "") === String(b.requirementId || "") &&
    String(a.messageType || "text") === String(b.messageType || "text");
  if (!sameCore) return false;

  const timeA = new Date(a.createdAt || 0).getTime();
  const timeB = new Date(b.createdAt || 0).getTime();
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB)) return false;
  return Math.abs(timeA - timeB) <= 2000;
}

function appendUniqueMessage(prev, nextMsg) {
  if (!nextMsg) return prev;
  if (
    (nextMsg.id && prev.some((m) => String(m.id) === String(nextMsg.id))) ||
    (nextMsg.tempId &&
      prev.some((m) => String(m.tempId) === String(nextMsg.tempId)))
  ) {
    return prev;
  }

  const last = prev[prev.length - 1];
  if (isNearDuplicate(last, nextMsg)) {
    return prev;
  }
  return [...prev, nextMsg];
}

function dedupeMessagesForDisplay(items) {
  const list = Array.isArray(items) ? items : [];
  const deduped = [];

  for (const msg of list) {
    const existingIndex = deduped.findIndex((item) => isNearDuplicate(item, msg));
    if (existingIndex < 0) {
      deduped.push(msg);
      continue;
    }

    const existing = deduped[existingIndex];
    const preferIncoming =
      (!existing?.id && !!msg?.id) ||
      (existing?.status === "sending" && msg?.status !== "sending");
    if (preferIncoming) {
      deduped[existingIndex] = {
        ...existing,
        ...msg
      };
    }
  }

  return deduped;
}

export default function ChatModal({
  open,
  onClose,
  sellerId,
  sellerName,
  requirementId
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [counterPrice, setCounterPrice] = useState("");
  const [deliveryBy, setDeliveryBy] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const sendInFlightRef = useRef(false);
  const lastSendRef = useRef({ key: "", at: 0 });

  const session = getSession();
  const currentUserId =
    session?._id || session?.userId || session?.id || null;
  const peerUserId = sellerId ? String(sellerId) : null;

  const groupedMessages = useMemo(() => {
    const normalized = dedupeMessagesForDisplay(messages);
    const groups = [];
    const groupMap = new Map();
    for (const msg of normalized) {
      const key = new Date(msg.createdAt).toDateString();
      if (!groupMap.has(key)) {
        const next = { key, label: formatDate(msg.createdAt), items: [] };
        groupMap.set(key, next);
        groups.push(next);
      }
      groupMap.get(key).items.push(msg);
    }
    return groups;
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (!open || !peerUserId || !currentUserId || !requirementId) return;

    socket.emit("join", currentUserId);
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      try {
        const res = await api.get("/chat/history", {
          params: {
            requirementId,
            userId: currentUserId,
            peerId: peerUserId
          }
        });
        if (cancelled) return;
        const history = Array.isArray(res.data) ? res.data : [];
        setMessages(history.map((m) => toMessageShape(m, currentUserId)));
      } catch {
        if (!cancelled) {
          console.warn("Chat history unavailable");
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();

    const onReceiveMessage = (incoming) => {
      const sameRequirement =
        String(incoming?.requirementId) === String(requirementId);
      const samePair =
        String(incoming?.fromUserId) === String(peerUserId) &&
        String(incoming?.toUserId) === String(currentUserId);
      if (!sameRequirement || !samePair) return;

      setMessages((prev) => {
        const nextMsg = toMessageShape(incoming, currentUserId);
        if (nextMsg.id && prev.some((m) => String(m.id) === String(nextMsg.id))) {
          return prev;
        }
        return [...prev, nextMsg];
      });

      socket.emit("mark_messages_read", {
        requirementId,
        readerUserId: currentUserId,
        peerUserId: peerUserId
      });
    };

    const onMessagesRead = (payload) => {
      const sameRequirement =
        String(payload?.requirementId) === String(requirementId);
      const readByPeer = String(payload?.byUserId) === String(peerUserId);
      if (!sameRequirement || !readByPeer) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (!m.fromSelf || String(m.toUserId) !== String(peerUserId)) return m;
          return {
            ...m,
            isRead: true,
            readAt: payload.readAt || m.readAt,
            status: "read"
          };
        })
      );
    };

    socket.on("receive_message", onReceiveMessage);
    socket.on("messages_read", onMessagesRead);

    socket.emit("mark_messages_read", {
      requirementId,
      readerUserId: currentUserId,
      peerUserId: peerUserId
    });

    return () => {
      cancelled = true;
      socket.off("receive_message", onReceiveMessage);
      socket.off("messages_read", onMessagesRead);
    };
  }, [open, peerUserId, currentUserId, requirementId]);

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
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setText((prev) => (prev ? `${prev} ${transcript}`.trim() : transcript));
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [open]);

  if (!open) return null;

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
    if (!currentUserId || !peerUserId) {
      alert("Chat users not ready yet.");
      return;
    }
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const allowed = [".jpg", ".jpeg", ".png", ".pdf", ".doc", ".docs", ".xls", ".xlsx"];
    const valid = files.filter((file) => {
      const name = String(file.name || "").toLowerCase();
      return allowed.some((ext) => name.endsWith(ext));
    });

    if (valid.length !== files.length) {
      alert("Only jpg, jpeg, png, pdf, doc, docs, xls, xlsx files are allowed");
    }
    if (!valid.length) return;

    try {
      setUploading(true);
      for (const file of valid) {
        const formData = new FormData();
        formData.append("from", currentUserId);
        formData.append("to", peerUserId);
        formData.append("requirementId", requirementId);
        formData.append("file", file);
        const res = await api.post("/chat-files/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        const message = res?.data?.message;
        if (message) {
          setMessages((prev) => {
            const nextMsg = toMessageShape(message, currentUserId);
            return appendUniqueMessage(prev, nextMsg);
          });
        }
      }
      alert("Document(s) uploaded");
    } catch (err) {
      const serverError = err?.response?.data?.error;
      const status = err?.response?.status;
      alert(serverError || (status ? `Upload failed (${status})` : "Failed to upload document(s)."));
    } finally {
      setUploading(false);
    }
  }

  function sendMessage() {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    if (!currentUserId || !peerUserId || !requirementId) return;

    const now = Date.now();
    const sendKey = `${currentUserId}:${peerUserId}:${requirementId}:${trimmed}`;
    if (sendInFlightRef.current) return;
    if (
      lastSendRef.current.key === sendKey &&
      now - Number(lastSendRef.current.at || 0) < 1200
    ) {
      return;
    }

    sendInFlightRef.current = true;
    lastSendRef.current = { key: sendKey, at: now };

    const tempId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingMessage = {
      id: null,
      tempId,
      message: trimmed,
      requirementId,
      fromUserId: currentUserId,
      toUserId: peerUserId,
      createdAt: new Date().toISOString(),
      isRead: false,
      readAt: null,
      fromSelf: true,
      status: "sending"
    };

    setMessages((prev) => appendUniqueMessage(prev, pendingMessage));
    setText("");

    const unlockTimer = setTimeout(() => {
      sendInFlightRef.current = false;
    }, 8000);

    socket.emit(
      "send_message",
      {
        fromUserId: currentUserId,
        toUserId: peerUserId,
        requirementId,
        message: trimmed,
        tempId
      },
      (result) => {
        clearTimeout(unlockTimer);
        sendInFlightRef.current = false;
        if (!result?.ok) {
          setMessages((prev) =>
            prev.map((m) =>
              m.tempId === tempId ? { ...m, status: "failed" } : m
            )
          );
          return;
        }

        const saved = toMessageShape(result.message || {}, currentUserId);
        setMessages((prev) => {
          let matched = false;
          const updated = prev.map((m) => {
            if (m.tempId !== tempId) return m;
            matched = true;
            return {
              ...m,
              id: saved.id,
              createdAt: saved.createdAt,
              status: saved.isRead ? "read" : "sent",
              isRead: saved.isRead,
              readAt: saved.readAt
            };
          });
          if (matched) return updated;
          return appendUniqueMessage(updated, {
            ...saved,
            fromSelf: true,
            status: saved.isRead ? "read" : "sent"
          });
        });
      }
    );
  }

  async function openAttachment(message) {
    const filename = String(message?.attachment?.filename || "").trim();
    if (!filename) {
      alert("Unable to open file.");
      return;
    }
    const newTab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const res = await api.get(`/chat-files/file/${encodeURIComponent(filename)}`, {
        responseType: "blob"
      });
      const blobUrl = window.URL.createObjectURL(res.data);
      if (newTab) {
        newTab.location.href = blobUrl;
      } else {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
      }
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      if (newTab) newTab.close();
      alert("Unable to open file.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className={`bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] ${
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
        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-blue-600 to-green-600 text-white">
          <h2 className="font-semibold">Chat with {sellerName}</h2>
          <button onClick={onClose} className="text-sm underline underline-offset-2">
            Close
          </button>
        </div>

        <div className="flex-1 p-3 md:p-4 overflow-y-auto space-y-2 h-[66vh] md:h-[68vh] bg-gray-50">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Loading messages...
            </div>
          ) : groupedMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              No messages yet. Start the conversation.
            </div>
          ) : (
            groupedMessages.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex justify-center py-2">
                  <span className="text-[11px] bg-gray-200 text-gray-600 px-3 py-1 rounded-full">
                    {group.label}
                  </span>
                </div>

                {group.items.map((m) => (
                  <div
                    key={m.id || m.tempId}
                    className={`px-3 py-2 rounded-2xl max-w-[92%] md:max-w-[80%] text-sm ${
                      m.fromSelf ? "bg-green-600 text-white ml-auto" : "bg-white border"
                    }`}
                  >
                    {m.messageType === "file" ? (
                      <button
                        type="button"
                        onClick={() => openAttachment(m)}
                        className={`text-left underline underline-offset-2 break-all ${
                          m.fromSelf ? "text-white" : "text-blue-700"
                        }`}
                      >
                        {(m.attachment?.originalName || m.message || "Attachment")}
                      </button>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{m.message}</div>
                    )}
                    <div
                      className={`text-[10px] mt-1 flex items-center gap-2 ${
                        m.fromSelf ? "justify-end text-green-100" : "text-gray-500"
                      }`}
                    >
                      <span>{formatTime(m.createdAt)}</span>
                      {m.fromSelf && (
                        <span>
                          {m.status === "sending" && "Sending..."}
                          {m.status === "sent" && "Sent"}
                          {m.status === "read" && "Read"}
                          {m.status === "failed" && "Failed"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 mb-2">Quick counter</p>
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
                setText(`Can you do Rs ${price} with delivery by ${date}?`);
              }}
              className="px-3 bg-gray-900 text-white rounded text-sm"
            >
              Insert
            </button>
          </div>
        </div>

        <div className="px-4 pt-3">
          <p
            className="text-xs"
            style={{ color: "#dc2626", fontWeight: 700 }}
          >
            Note: Buyer and Seller may share personal mobile and emails contacts on their discretion.
          </p>
        </div>

        <div className="p-4 border-t flex gap-3 items-end">
          <div className="flex-1">
            <textarea
              rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type message..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <button
              className={`w-11 h-11 border rounded-lg flex items-center justify-center ${
                isListening ? "bg-green-600 border-green-600" : ""
              }`}
              onClick={toggleMic}
              title="Speech to text"
              aria-label="Speech to text"
            >
              <svg
                viewBox="0 0 24 24"
                className={`w-5 h-5 ${isListening ? "text-white" : "text-gray-600"}`}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V20H9v2h6v-2h-2v-2.08A7 7 0 0 0 19 11h-2z" />
              </svg>
            </button>

            <button
              onClick={sendMessage}
              className="w-11 h-11 bg-green-600 text-white rounded-lg text-xs font-semibold"
              title="Send"
              aria-label="Send"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
