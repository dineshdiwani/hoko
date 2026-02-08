import { useState } from "react";
import api from "../utils/api";

export default function ReviewModal({ open, onClose, sellerId, requirementId }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const user = JSON.parse(localStorage.getItem("user"));

  if (!open) return null;

  async function submitReview() {
    await api.post("/reviews", {
      sellerId,
      buyerId: user.mobile,
      requirementId,
      rating,
      comment,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center">
      <div className="bg-white p-4 rounded w-80">
        <h2 className="font-bold mb-2">Rate Seller</h2>

        <select
          value={rating}
          onChange={(e) => setRating(+e.target.value)}
          className="w-full border mb-2"
        >
          {[5,4,3,2,1].map(n => (
            <option key={n} value={n}>{n} ★</option>
          ))}
        </select>

        <textarea
          placeholder="Optional comment"
          className="w-full border mb-2"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <button className="btn-primary w-full" onClick={submitReview}>
          Submit
        </button>

        <button className="mt-2 text-red-600 w-full" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
