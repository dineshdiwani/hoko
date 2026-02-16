import { useState } from "react";
import api from "../services/api";
import { getSession } from "../services/auth";

const DEFAULT_REASONS = [
  "Harassment or abuse",
  "Spam or scam",
  "Fraud or impersonation",
  "Inappropriate content",
  "Payment or delivery issue",
  "Other"
];

export default function ReportModal({
  open,
  onClose,
  reportedUserId,
  requirementId
}) {
  const session = getSession();
  const [reason, setReason] = useState(DEFAULT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submitReport() {
    if (!session?.token) {
      alert("Please login again");
      return;
    }
    if (!reportedUserId) {
      alert("Missing report details");
      return;
    }

    try {
      setSubmitting(true);
      await api.post("/reports", {
        reportedUserId,
        requirementId,
        category: reason,
        details
      });
      alert("Report submitted. Our team will review it.");
      onClose();
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          "Unable to submit report"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex justify-center items-center p-4">
      <div className="bg-white p-5 rounded-2xl w-96 max-w-[90vw] max-h-[90vh] overflow-y-auto shadow-xl">
        <h2 className="font-bold mb-2">Report Abuse</h2>
        <p className="text-xs text-gray-500 mb-4">
          hoko is a neutral platform. Transactions and communications are
          between buyers and sellers only. We review reports to keep the
          marketplace safe.
        </p>

        <label className="text-sm text-gray-600">Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-3"
        >
          {DEFAULT_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <label className="text-sm text-gray-600">
          Details (optional)
        </label>
        <textarea
          className="w-full border rounded-lg px-3 py-2 mb-4"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Explain what happened"
        />

        <button
          className="btn-primary w-full"
          onClick={submitReport}
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Submit Report"}
        </button>

        <button
          className="mt-2 text-gray-600 w-full"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
