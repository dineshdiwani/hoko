import { useState } from "react";

export default function ShareDocModal({ open, onClose }) {
  const [file, setFile] = useState(null);

  if (!open) return null;

  const handleShare = () => {
    if (!file) {
      alert("Please select a document first");
      return;
    }
    alert(`Document "${file.name}" shared successfully`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-96 rounded shadow-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-lg">Share Document</h2>
          <button onClick={onClose}>✖</button>
        </div>

        <input
          type="file"
          className="mb-3"
          onChange={(e) => setFile(e.target.files[0])}
        />

        {file && (
          <p className="text-sm text-gray-600 mb-3">
            Selected: <strong>{file.name}</strong>
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 border rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            className="px-4 py-1 bg-green-600 text-white rounded"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
