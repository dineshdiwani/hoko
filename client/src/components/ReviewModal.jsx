import { useState } from "react";
import api from "../services/api";
import { getSession } from "../services/auth";

export default function ReviewModal({
  open,
  onClose,
  reviewedUserId,
  requirementId,
  targetRole
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const session = getSession();

  if (!open) return null;

  async function submitReview() {
    let submitted = false;
    if (!session?.token) {
      alert("Please login again");
      return;
    }
    if (!reviewedUserId || !requirementId) {
      alert("Missing review details");
      return;
    }
    try {
      setSubmitting(true);
      await api.post("/reviews", {
        reviewedUserId,
        requirementId,
        rating,
        comment,
        targetRole
      });
      submitted = true;
      alert("Review submitted");
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          "Unable to submit review"
      );
    } finally {
      setSubmitting(false);
      if (submitted && typeof onClose === "function") {
        onClose();
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center">
      <div className="bg-white p-4 rounded w-80 max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold mb-2">Submit Review</h2>

        <div className="flex items-center gap-2 mb-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`text-2xl ${
                n <= rating ? "text-yellow-400" : "text-gray-300"
              }`}
              aria-label={`${n} star`}
            >
              ★
            </button>
          ))}
        </div>

        <textarea
          placeholder="Optional comment"
          className="w-full border mb-2"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <button
          className="btn-primary w-full"
          onClick={submitReview}
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>

        <button className="mt-2 text-red-600 w-full" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
