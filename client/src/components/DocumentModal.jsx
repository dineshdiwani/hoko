import { useEffect, useState } from "react";
import api, { getAssetBaseUrl } from "../services/api";

export default function DocumentModal({
  open,
  onClose,
  sellerId,
  buyerId
}) {
  const [docs, setDocs] = useState([]);
  const baseUrl = getAssetBaseUrl();

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
              const url = `${baseUrl}/uploads/chat/${filename}`;
              return (
                <li
                  key={`${filename}-${i}`}
                  className="flex justify-between items-center border p-2 rounded"
                >
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline text-sm break-all"
                  >
                    {filename}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
