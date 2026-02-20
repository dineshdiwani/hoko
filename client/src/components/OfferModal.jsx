import { useState, useEffect, useRef } from "react";
import api from "../services/api";
import {
  extractAttachmentFileName,
  getAttachmentDisplayName,
  isImageAttachment
} from "../utils/attachments";

export default function OfferModal({
  open,
  onClose,
  requirement,
  onSubmitted
}) {
  // SAFETY GUARD (prevents blank page)
  if (!open || !requirement) return null;

  const productName =
    requirement.product || requirement.productName || "";
  const makeBrand =
    requirement.makeBrand || requirement.brand || "";
  const typeModel = requirement.typeModel || "";
  const quantity = String(requirement.quantity || "").trim();
  const unit = String(requirement.type || requirement.unit || "").trim();
  const requirementDetails = String(
    requirement.details || requirement.description || ""
  ).trim();
  const requirementId = requirement._id || requirement.id;
  if (!requirementId) return null;
  const changedFieldSet = new Set(
    (Array.isArray(requirement?._changeHighlights)
      ? requirement._changeHighlights
      : []
    ).map((field) => String(field || "").trim())
  );
  const hasHighlights = changedFieldSet.size > 0;
  const highlightBlockClass = "rounded-lg border border-amber-300 bg-amber-50";
  const highlightTextClass = "text-amber-900";

  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [file, setFile] = useState(null);
  const documentInputRef = useRef(null);
  const [existingOffer, setExistingOffer] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const attachments = Array.isArray(requirement.attachments)
    ? requirement.attachments
    : [];

  async function openAttachment(attachment) {
    const newTab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const filename = extractAttachmentFileName(attachment);
      if (!filename) throw new Error("Invalid attachment path");
      const res = await api.get(`/buyer/attachments/${encodeURIComponent(filename)}`, {
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
      alert("Unable to open attachment.");
    }
  }

  function getDisplayName(attachment, index) {
    return getAttachmentDisplayName(attachment, index);
  }

  function isImage(attachment) {
    return isImageAttachment(attachment);
  }

  const isAuctionActive =
    requirement?.reverseAuction?.active ||
    requirement?.reverseAuctionActive ||
    false;
  const currentLowestPrice =
    requirement?.reverseAuction?.lowestPrice ??
    requirement?.currentLowestPrice ??
    null;
  const displayLowestPrice =
    typeof currentLowestPrice === "number"
      ? currentLowestPrice
      : "-";

  const formatDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  };

  // Load existing offer (edit mode)
  useEffect(() => {
    if (!open || !requirementId) return;
    api
      .get(`/seller/offer/${requirementId}`)
      .then((res) => {
        setPrice(res.data.price || "");
        setNote(res.data.message || "");
        setDeliveryTime(res.data.deliveryTime || "");
        setPaymentTerms(res.data.paymentTerms || "");
        setExistingOffer(true);
        setLastUpdatedAt(res.data.updatedAt || res.data.createdAt || "");
      })
      .catch(() => {
        setPrice("");
        setNote("");
        setDeliveryTime("");
        setPaymentTerms("");
        setExistingOffer(false);
        setLastUpdatedAt("");
      });
  }, [open, requirementId]);

  function markDeclined() {
    // Server-side handling can be added when needed
  }

  function saveAttachmentFile(fileObj) {
    if (!fileObj) return;
    const reader = new FileReader();
    reader.onload = () =>
      setFile({
        name: fileObj.name,
        data: reader.result
      });
    reader.readAsDataURL(fileObj);
  }

  function handleAttachmentPick(e) {
    const fileObj = e.target.files?.[0];
    saveAttachmentFile(fileObj);
    // Allow selecting the same file again in the next pick.
    e.target.value = "";
  }

  function openDeviceCamera() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const fileObj = input.files?.[0];
      saveAttachmentFile(fileObj);
    };
    input.click();
  }

  const submitOffer = async () => {
    if (!price) {
      alert("Please enter price");
      return;
    }

    // Auction price validation
    if (
      isAuctionActive &&
      typeof currentLowestPrice === "number" &&
      Number(price) >= currentLowestPrice
    ) {
      alert("Price must be lower than current lowest price");
      return;
    }

    try {
      await api.post("/seller/offer", {
        requirementId: requirementId,
        price: Number(price),
        message: note,
        deliveryTime,
        paymentTerms
      });
    } catch {
      alert("Failed to submit offer. Try again.");
      return;
    }
    alert(
      existingOffer
        ? "Offer updated successfully"
        : "Offer submitted successfully"
    );

    if (typeof onSubmitted === "function") {
      onSubmitted(requirementId);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 pb-24 md:pb-6 max-h-[90vh] overflow-y-auto">
        {hasHighlights && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Buyer updated this post. Changed fields are highlighted below.
          </div>
        )}
        <h2 className="text-xl font-bold mb-4">
          {existingOffer ? "Edit Offer" : "Submit Offer"}
        </h2>
        <p
          className={`text-sm text-gray-600 mb-3 ${
            changedFieldSet.has("product") ? `${highlightBlockClass} px-2 py-1 ${highlightTextClass}` : ""
          }`}
        >
          For <strong>{productName}</strong>
        </p>
        <p
          className={`text-sm text-gray-600 mb-3 ${
            changedFieldSet.has("city") || changedFieldSet.has("category")
              ? `${highlightBlockClass} px-2 py-1 ${highlightTextClass}`
              : ""
          }`}
        >
          Buyer from <strong>{requirement.city || "your city"}</strong>
        </p>
        {existingOffer && lastUpdatedAt && (
          <p className="text-xs text-gray-500 mb-3">
            Last updated: {formatDateTime(lastUpdatedAt)}
          </p>
        )}
        {(makeBrand || typeModel) && (
          <p
            className={`text-sm text-gray-600 mb-3 ${
              changedFieldSet.has("makeBrand") || changedFieldSet.has("typeModel")
                ? `${highlightBlockClass} px-2 py-1 ${highlightTextClass}`
                : ""
            }`}
          >
            {makeBrand && (
              <span>
                <span className="text-gray-500">
                  Make / Brand:
                </span>{" "}
                {makeBrand}
              </span>
            )}
            {makeBrand && typeModel ? " | " : ""}
            {typeModel && (
              <span>
                <span className="text-gray-500">
                  Type / Model:
                </span>{" "}
                {typeModel}
              </span>
            )}
          </p>
        )}
        {(quantity || unit) && (
          <p
            className={`text-sm text-gray-600 mb-3 ${
              changedFieldSet.has("quantity") || changedFieldSet.has("type")
                ? `${highlightBlockClass} px-2 py-1 ${highlightTextClass}`
                : ""
            }`}
          >
            <span className="text-gray-500">Quantity:</span>{" "}
            {quantity || "-"} {unit || ""}
          </p>
        )}
        {requirementDetails && (
          <div
            className={`mb-3 p-3 rounded-lg border ${
              changedFieldSet.has("details")
                ? "border-amber-300 bg-amber-50"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <p className="text-xs text-gray-500 mb-1">Buyer details</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {requirementDetails}
            </p>
          </div>
        )}

        {attachments.length > 0 && (
          <div
            className={`mb-4 ${
              changedFieldSet.has("attachments")
                ? `${highlightBlockClass} px-2 py-2`
                : ""
            }`}
          >
            <p className="text-sm font-medium mb-2">
              Buyer Attachments
            </p>
            <div className="space-y-2">
              {attachments.map((attachment, index) => {
                const filename = extractAttachmentFileName(attachment);
                const name = getDisplayName(attachment, index);
                return (
                  <div
                    key={`${name}-${index}`}
                    className="flex items-center gap-3"
                  >
                    {isImage(attachment) && (
                      <span className="w-12 h-12 rounded-lg border bg-gray-50 inline-flex items-center justify-center text-gray-500 text-[10px]">
                        IMG
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => openAttachment(attachment)}
                      className="text-sm text-indigo-600 hover:underline break-all"
                      title={filename || "Attachment path missing"}
                    >
                      {name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Auction warning if active */}
        {isAuctionActive && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            Reverse Auction active - your offer must be lower than current lowest price (Rs {displayLowestPrice})
          </div>
        )}

        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min={
            isAuctionActive && typeof currentLowestPrice === "number"
              ? currentLowestPrice - 1
              : 0
          }
          className="w-full border rounded-xl px-4 py-2 mb-3"
          placeholder={
            isAuctionActive && typeof currentLowestPrice === "number"
              ? `Enter price below Rs ${currentLowestPrice}`
              : "Offer price"
          }
          required
        />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 mb-3"
          placeholder="Optional note"
        />

        <input
          type="text"
          value={deliveryTime}
          onChange={(e) => setDeliveryTime(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 mb-3"
          placeholder="Delivery time (e.g., 3-5 days)"
        />

        <input
          type="text"
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 mb-3"
          placeholder="Payment terms (e.g., 50% advance, balance on delivery)"
        />

        <input
          ref={documentInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
          onChange={handleAttachmentPick}
          className="hidden"
        />
        <div className="mb-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={openDeviceCamera}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-95"
            aria-label="Capture photo"
            title="Capture photo"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M9 4h6l1.2 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.8L9 4Zm3 4.5A4.5 4.5 0 1 0 12 17a4.5 4.5 0 0 0 0-9Zm0 2A2.5 2.5 0 1 1 12 15a2.5 2.5 0 0 1 0-5Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => documentInputRef.current?.click()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:bg-emerald-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-95"
            aria-label="Share document"
            title="Share document"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5" />
            </svg>
          </button>
        </div>
        {file && (
          <p className="text-xs text-gray-600 mb-4">
            Selected attachment: {file.name}
          </p>
        )}

        <div className="hidden md:flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border rounded-xl py-2"
          >
            Cancel
          </button>

          <button
            onClick={submitOffer}
            className="flex-1 btn-brand rounded-xl py-2"
          >
            {existingOffer ? "Update Offer" : "Submit Offer"}
          </button>
          {/* "Cannot beat price" button - only show if auction active */}
          {isAuctionActive && (
            <button
              onClick={() => {
                markDeclined();
                onClose();
              }}
              className="flex-1 border rounded-xl py-2 text-gray-600 hover:bg-gray-100"
            >
              Cannot beat price
            </button>
          )}
        </div>

        <div className="md:hidden fixed left-0 right-0 bottom-0 z-50 border-t border-[var(--ui-border)] bg-white/95 backdrop-blur p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 border rounded-xl py-3 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={submitOffer}
              className="flex-1 btn-brand rounded-xl py-3 text-sm"
            >
              {existingOffer ? "Update Offer" : "Submit Offer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
