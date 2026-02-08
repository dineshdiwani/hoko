import { useEffect, useState } from "react";
import api from "../utils/api";

export default function DocumentModal({ open, onClose, sellerId }) {
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    if (!open || !sellerId) return;

    api
      .get(`/chat/documents`, { params: { sellerId } })
      .then((res) => setDocs(res.data || []))
      .catch(() => setDocs([]));
  }, [open, sellerId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-96 rounded shadow p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Shared Documents</h2>
          <button onClick={onClose}>✖</button>
        </div>

        {docs.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No documents shared yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc, i) => (
              <li
                key={i}
                className="flex justify-between items-center border p-2 rounded"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline text-sm"
                >
                  {doc.name}
                </a>

                <button
                  className="text-red-600 text-xs"
                  onClick={() =>
                    api.delete(`/chat/documents/${doc._id}`).then(() =>
                      setDocs((prev) =>
                        prev.filter((d) => d._id !== doc._id)
                      )
                    )
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
