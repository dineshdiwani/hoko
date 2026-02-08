import { useEffect, useState } from "react";
import api from "../services/api";

export default function EditRequirementModal({
  open,
  requirement,
  onClose,
  onUpdated
}) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (requirement) setForm(requirement);
  }, [requirement]);

  if (!open) return null;

  const updatePost = async () => {
    await api.put(`/buyer/requirement/${form._id}`, form);
    alert("Post updated");
    onUpdated();
    onClose();
  };

  const deletePost = async () => {
    if (!confirm("Delete this post?")) return;
    await api.delete(`/buyer/requirement/${form._id}`);
    alert("Post deleted");
    onUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-xl p-5 relative">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-500"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold mb-3">Edit Requirement</h2>

        <input
          value={form.brand || ""}
          onChange={e => setForm({ ...form, brand: e.target.value })}
          placeholder="Brand / Make"
          className="input"
        />

        <input
          value={form.quantity || ""}
          onChange={e => setForm({ ...form, quantity: e.target.value })}
          placeholder="Quantity"
          className="input"
        />

        <input
          value={form.type || ""}
          onChange={e => setForm({ ...form, type: e.target.value })}
          placeholder="Type"
          className="input"
        />

        <textarea
          value={form.details || ""}
          onChange={e => setForm({ ...form, details: e.target.value })}
          placeholder="Details"
          className="input"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={updatePost}
            className="bg-green-600 text-white flex-1 py-2 rounded"
          >
            Update
          </button>

          <button
            onClick={deletePost}
            className="bg-red-600 text-white flex-1 py-2 rounded"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
