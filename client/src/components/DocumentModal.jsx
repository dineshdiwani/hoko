import { useEffect, useState } from "react";
import api from "../services/api";
import {
  getAttachmentDisplayName,
  getAttachmentTypeMeta
} from "../utils/attachments";

export default function DocumentModal({
  open,
  onClose,
  sellerId,
  buyerId
}) {
  const [docs, setDocs] = useState([]);

  async function openFile(filename) {
    try {
      const res = await api.get(
        `/chat-files/file/${encodeURIComponent(filename)}`,
        { responseType: "blob" }
      );
      const blobUrl = window.URL.createObjectURL(res.data);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      alert("Unable to open file.");
    }
  }

  useEffect(() => {
    if (!open || !sellerId || !buyerId) return;

    api
      .get("/chat-files/list", {
        params: { from: buyerId, to: sellerId }
      })
      .then((res) => setDocs(res.data || []))
      .catch(() => setDocs([]));
  }, [open, sellerId, buyerId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Shared Documents</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {docs.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No documents shared yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {docs.map((filename, i) => {
              const typeMeta = getAttachmentTypeMeta(filename, i);
              const displayName = getAttachmentDisplayName(filename, i);
              return (
                <li
                  key={`${filename}-${i}`}
                  className="flex justify-between items-center border p-2 rounded"
                >
                  <button
                    type="button"
                    onClick={() => openFile(filename)}
                    className="text-blue-600 underline text-sm break-all inline-flex items-center gap-2"
                  >
                    <span
                      className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                    >
                      {typeMeta.label}
                    </span>
                    {displayName}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
