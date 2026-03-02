import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getSession } from "../../services/storage";
import { confirmDialog } from "../../utils/dialogs";
import {
  extractAttachmentFileName,
  getAttachmentDisplayName,
  getAttachmentTypeMeta
} from "../../utils/attachments";

export default function MyPosts({
  city = "",
  selectedCategory = "all",
  cities = [],
  categories = [],
  onCityChange,
  onCategoryChange,
  onVisibleCountChange
}) {
  const navigate = useNavigate();
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerDetails, setSellerDetails] = useState(null);
  const [auctionLoadingById, setAuctionLoadingById] = useState({});
  const [auctionHintReqId, setAuctionHintReqId] = useState("");
  const modalRef = useRef(null);
  const appBaseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:5173";
  const getDialableMobile = (value) =>
    String(value || "").trim().replace(/[^\d+]/g, "");

  function getShareText(req) {
    const reqId = String(req?._id || req?.id || "").trim();
    if (!reqId) return "";
    const deepLink = `${appBaseUrl}/seller/deeplink/${encodeURIComponent(
      reqId
    )}?city=${encodeURIComponent(req?.city || "")}&postId=${encodeURIComponent(reqId)}`;
    const product = req.product || req.productName || "Requirement";
    const qty = req.quantity ? `${req.quantity} ${req.unit || req.type || ""}` : "";
    const parts = [
      `${product}${qty ? ` (${qty})` : ""}`,
      req.category ? `Category: ${req.category}` : "",
      req.city ? `City: ${req.city}` : ""
    ].filter(Boolean);
    return `${parts.join(" | ")}\nSubmit offer on hoko: ${deepLink}`;
  }

  function getShareLinks(req) {
    const reqId = String(req?._id || req?.id || "").trim();
    const deepLink = `${appBaseUrl}/seller/deeplink/${encodeURIComponent(
      reqId
    )}?city=${encodeURIComponent(req?.city || "")}&postId=${encodeURIComponent(reqId)}`;
    const shareText = getShareText(req);
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(deepLink);
    return {
      whatsapp: `https://wa.me/?text=${encodedText}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      mail: `mailto:?subject=${encodeURIComponent("Requirement on hoko")}&body=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    };
  }

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

  useEffect(() => {
    async function load() {
      try {
        const session = getSession();
        if (session?._id) {
          const res = await api.get(
            `/buyer/my-posts/${session._id}`
          );
          setRequirements(res.data || []);
        } else {
          setRequirements([]);
        }
      } catch (err) {
        setRequirements([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target)
      ) {
        setSellerModalOpen(false);
      }
    }
    if (sellerModalOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, [sellerModalOpen]);

  const filteredRequirements = requirements.filter((req) => {
    const cityMatch =
      !city ||
      String(req.city || "").trim().toLowerCase() ===
        String(city).trim().toLowerCase();
    const categoryMatch =
      !selectedCategory ||
      selectedCategory === "all" ||
      String(req.category || "").trim().toLowerCase() ===
        String(selectedCategory).trim().toLowerCase();
    return cityMatch && categoryMatch;
  });

  useEffect(() => {
    onVisibleCountChange?.(filteredRequirements.length);
  }, [filteredRequirements.length, onVisibleCountChange]);

  async function openSellerDetails(sellerId) {
    if (!sellerId) return;
    setSellerModalOpen(true);
    setSellerLoading(true);
    setSellerDetails(null);
    try {
      const res = await api.get(`/buyer/seller/${sellerId}`);
      setSellerDetails(res.data || null);
    } catch {
      setSellerDetails(null);
    } finally {
      setSellerLoading(false);
    }
  }

  async function handleDelete(reqId) {
    const ok = await confirmDialog(
      "Delete this requirement? This cannot be undone.",
      {
        title: "Delete Requirement",
        confirmText: "Delete",
        cancelText: "Cancel"
      }
    );
    if (!ok) return;
    try {
      await api.delete(`/buyer/requirement/${reqId}`);
      setRequirements((prev) =>
        prev.filter((req) => String(req._id || req.id) !== String(reqId))
      );
    } catch {
      alert("Failed to delete requirement");
    }
  }

  async function toggleReverseAuction(req) {
    const reqId = String(req._id || req.id || "");
    if (!reqId) return;
    const offerCount = Number(req.offerCount || 0);
    const auctionActive = req.reverseAuction?.active || req.reverseAuctionActive;
    if (!auctionActive && offerCount < 3) return;

    setAuctionLoadingById((prev) => ({ ...prev, [reqId]: true }));
    try {
      const endpoint = auctionActive
        ? `/buyer/requirement/${reqId}/reverse-auction/stop`
        : `/buyer/requirement/${reqId}/reverse-auction/start`;
      const res = await api.post(endpoint);
      const updated = res.data || {};
      setRequirements((prev) =>
        prev.map((item) => {
          const itemId = String(item._id || item.id || "");
          if (itemId !== reqId) return item;
          return {
            ...item,
            ...updated,
            offerCount: item.offerCount
          };
        })
      );
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          `Unable to ${auctionActive ? "stop" : "start"} reverse auction`
      );
    } finally {
      setAuctionLoadingById((prev) => ({ ...prev, [reqId]: false }));
    }
  }

  /* ---------------- LOADING STATE ---------------- */
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-gray-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  /* ---------------- EMPTY STATE ---------------- */
  if (requirements.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">
          You haven't posted any requirements yet.
        </p>
        <button
          onClick={() => navigate("/buyer/requirement/new")}
          className="px-6 py-3 btn-brand rounded-xl font-semibold"
        >
          Post your first requirement
        </button>
      </div>
    );
  }

  /* ---------------- LIST ---------------- */
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="ui-label text-gray-700">City</span>
        <select
          value={city}
          onChange={(e) => onCityChange?.(e.target.value)}
          className="w-full sm:w-auto max-w-full px-4 py-2.5 rounded-xl border text-sm bg-white"
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="ui-label text-gray-700 sm:ml-2">Category</span>
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange?.(e.target.value)}
          className="w-full sm:w-auto max-w-full px-4 py-2.5 rounded-xl border text-sm bg-white"
        >
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {filteredRequirements.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No posts match the selected city/category filters.
        </div>
      )}

      <div className="space-y-4">
        {filteredRequirements.map((req) => {
        const attachments = Array.isArray(req.attachments)
          ? req.attachments
          : [];
        const offerCount = Number(req.offerCount || 0);
        const requirementDetails = String(
          req.details || req.description || ""
        ).trim();
        const normalizedStatus = req.status?.toUpperCase() || "OPEN";
        const auctionLive = offerCount >= 3;
        const auctionActive = req.reverseAuction?.active === true;
        const reqId = String(req._id || req.id || "");
        const isAuctionBusy = Boolean(auctionLoadingById[reqId]);
        const showDisabledInvokeHint =
          !auctionActive && offerCount < 3;
        const shareLinks = getShareLinks(req);
        const statusText = auctionLive
          ? auctionActive
            ? "AUCTION LIVE"
            : "AUCTION READY"
          : normalizedStatus;
        const statusClass = auctionLive
          ? auctionActive
            ? "app-badge app-badge-danger"
            : "app-badge app-badge-warning"
          : normalizedStatus === "CLOSED"
          ? "app-badge app-badge-muted"
          : "app-badge app-badge-new";

        return (
          <div
            key={req._id || req.id}
            onClick={() =>
              navigate(
                `/buyer/requirement/${req._id || req.id}/offers`
              )
            }
            className="relative app-card active:scale-[0.99] transition"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(req._id || req.id);
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center"
              aria-label="Delete post"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM7 10h2v8H7v-8Z" />
              </svg>
            </button>
            {/* Top row */}
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-base text-[var(--ui-text)]">
                {req.product || req.productName || "-"}
              </h3>

              <span
                className={`${statusClass} mr-10`}
              >
                {statusText}
              </span>
            </div>

            {/* Meta */}
            <p className="text-sm text-[var(--ui-muted)]">
              {req.city || "-"} | {req.category || "-"}
            </p>
            <p className="text-sm text-[var(--ui-muted)]">
              Make/Brand: {req.makeBrand || req.brand || "-"} | Type/Model: {req.typeModel || req.type || "-"}
            </p>
            <p className="text-sm text-[var(--ui-muted)]">
              Quantity: {req.quantity || "-"} {req.unit || req.type || ""}
            </p>

            {requirementDetails && (
              <p className="text-sm text-[var(--ui-text)] mt-1 whitespace-pre-line">
                {requirementDetails}
              </p>
            )}

            <p className="text-xs text-gray-400 mt-1">
              Posted{" "}
              {new Date(
                req.createdAt || Date.now()
              ).toLocaleDateString()}
            </p>

            {/* Auction info */}
            {auctionActive && (
              <div className="mt-3 text-sm text-red-700">
                Lowest price: Rs{" "}
                {req.reverseAuction?.lowestPrice ??
                  req.currentLowestPrice ??
                  "-"}
              </div>
            )}

            {attachments.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Attachments
                </p>
                <div className="space-y-2">
                  {attachments.map((attachment, index) => {
                    const filename = extractAttachmentFileName(attachment);
                    const name = getDisplayName(attachment, index);
                    const typeMeta = getAttachmentTypeMeta(attachment, index);
                    return (
                      <div
                        key={`${name}-${index}`}
                        className="flex items-center gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openAttachment(attachment)}
                          className="text-xs text-amber-700 hover:underline break-all inline-flex items-center gap-2"
                          title={filename || "Attachment path missing"}
                        >
                          <span
                            className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                          >
                            {typeMeta.label}
                          </span>
                          {name}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {Array.isArray(req.sellerFirms) &&
              req.sellerFirms.length > 0 && (
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-gray-500">
                    Sellers:
                  </span>
                  {req.sellerFirms.map((seller) => (
                    <button
                      key={seller.id}
                      onClick={() =>
                        openSellerDetails(seller.id)
                      }
                      className="px-2 py-1 text-xs font-bold rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      {seller.firmName}
                    </button>
                  ))}
                </div>
            )}

            <div
              className="mt-4 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs text-gray-500 mr-1">Share:</span>
              <a
                href={shareLinks.whatsapp}
                target="_blank"
                rel="noreferrer"
                aria-label="Share on WhatsApp"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-green-200 text-green-700 hover:bg-green-50"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.93.51 3.77 1.49 5.4L2 22l4.85-1.58a9.85 9.85 0 0 0 5.19 1.46h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.74 14.1c-.24.69-1.19 1.27-1.82 1.36-.6.08-1.35.11-2.2-.14-.51-.16-1.16-.38-2.01-.73-3.54-1.53-5.85-5.09-6.03-5.34-.17-.25-1.45-1.93-1.45-3.68 0-1.75.92-2.62 1.24-2.98.32-.36.69-.45.92-.45.23 0 .46 0 .66.01.22 0 .51-.08.8.6.29.69.98 2.42 1.06 2.59.08.17.14.37.02.6-.11.23-.17.37-.34.57-.17.2-.36.45-.51.61-.17.17-.35.35-.15.69.2.34.89 1.47 1.92 2.38 1.32 1.18 2.43 1.55 2.78 1.72.34.17.55.14.75-.08.2-.23.86-1 1.08-1.35.23-.34.45-.29.75-.17.31.11 1.94.92 2.28 1.08.34.17.57.26.66.4.09.14.09.8-.15 1.49Z" />
                </svg>
              </a>
              <a
                href={shareLinks.facebook}
                target="_blank"
                rel="noreferrer"
                aria-label="Share on Facebook"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.41c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.26c-1.24 0-1.62.77-1.62 1.56v1.87h2.76l-.44 2.91h-2.32v7.03C18.34 21.24 22 17.08 22 12.06Z" />
                </svg>
              </a>
              <a
                href={shareLinks.mail}
                aria-label="Share via Mail"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-red-200 text-red-600 hover:bg-red-50"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M20 4H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4.2-8 6-8-6V6l8 6 8-6v2.2Z" />
                </svg>
              </a>
              <a
                href={shareLinks.linkedin}
                target="_blank"
                rel="noreferrer"
                aria-label="Share on LinkedIn"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-sky-200 text-sky-700 hover:bg-sky-50"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M6.94 8.5a1.56 1.56 0 1 1 0-3.12 1.56 1.56 0 0 1 0 3.12ZM5.5 9.75h2.88V19H5.5V9.75Zm4.63 0h2.75v1.26h.04c.38-.72 1.32-1.48 2.72-1.48 2.9 0 3.44 1.91 3.44 4.39V19h-2.87v-4.5c0-1.07-.02-2.45-1.5-2.45-1.5 0-1.73 1.17-1.73 2.38V19h-2.85V9.75Z" />
                </svg>
              </a>
            </div>

            {/* CTA */}
            <div className="mt-4 flex items-center justify-between">
              <span
                className={`text-sm font-semibold transition ${
                  offerCount > 0
                    ? "text-blue-600 underline hover:animate-pulse cursor-pointer"
                    : "text-gray-500"
                }`}
              >
                {offerCount > 0
                  ? `${offerCount} offer received`
                  : "No offers received yet"}
              </span>
            </div>

            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() =>
                  navigate(`/buyer/requirement/${reqId}/edit`)
                }
                className="inline-flex h-10 min-w-[120px] items-center justify-center px-4 rounded-lg text-xs font-semibold border border-[var(--ui-border)] text-[var(--ui-text)]"
              >
                Edit Post
              </button>
              <button
                onClick={() =>
                  navigate(`/buyer/requirement/${reqId}/offers`)
                }
                disabled={offerCount < 1}
                className={`inline-flex h-10 min-w-[120px] items-center justify-center px-4 rounded-lg text-xs font-semibold ${
                  offerCount < 1
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "btn-primary text-white"
                }`}
                title={
                  offerCount < 1
                    ? "No offers yet"
                    : "Open offers and enable chat"
                }
              >
                Enable Chat
              </button>
              <button
                onClick={() =>
                  navigate(`/buyer/requirement/${reqId}/compare`)
                }
                disabled={offerCount < 2}
                className={`inline-flex h-10 min-w-[120px] items-center justify-center px-4 rounded-lg text-xs font-semibold ${
                  offerCount < 2
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
                title={
                  offerCount < 2
                    ? "At least 2 offers are required"
                    : "Compare offers"
                }
              >
                Compare Offers
              </button>
              <div
                className="relative inline-flex"
                onMouseEnter={() => {
                  if (showDisabledInvokeHint) {
                    setAuctionHintReqId(reqId);
                  }
                }}
                onMouseLeave={() => {
                  if (auctionHintReqId === reqId) {
                    setAuctionHintReqId("");
                  }
                }}
                onClick={(e) => {
                  if (!showDisabledInvokeHint) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setAuctionHintReqId(reqId);
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showDisabledInvokeHint) {
                      setAuctionHintReqId(reqId);
                      return;
                    }
                    toggleReverseAuction(req);
                  }}
                  aria-disabled={showDisabledInvokeHint || isAuctionBusy}
                  disabled={isAuctionBusy}
                  className={`inline-flex h-10 min-w-[160px] items-center justify-center px-4 rounded-lg text-xs font-semibold transition ${
                    auctionActive
                      ? "bg-red-600 text-white"
                      : offerCount >= 3
                      ? "btn-primary text-white"
                      : "bg-gray-300 text-gray-600 cursor-not-allowed"
                  }`}
                  title={
                    !auctionActive && offerCount < 3
                      ? "You must receive 3 or more offers before you invoke reverse auction."
                      : auctionActive
                      ? "Stop reverse auction"
                      : "Invoke reverse auction"
                  }
                >
                  {isAuctionBusy
                    ? auctionActive
                      ? "Stopping..."
                      : "Invoking..."
                    : auctionActive
                    ? "Stop Reverse Auction"
                    : "Invoke Reverse Auction"}
                </button>
                {showDisabledInvokeHint && auctionHintReqId === reqId && (
                  <div className="absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-lg bg-black px-3 py-2 text-xs text-white shadow-lg">
                    You must receive 3 or more offers before you invoke reverse auction.
                  </div>
                )}
              </div>
            </div>
          </div>
        );
        })}
      </div>

      {sellerModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            ref={modalRef}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                Seller Details
              </h2>
              <button
                onClick={() => setSellerModalOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>

            {sellerLoading && (
              <div className="text-sm text-gray-600">
                Loading details...
              </div>
            )}

            {!sellerLoading && !sellerDetails && (
              <div className="text-sm text-gray-600">
                Seller details not available.
              </div>
            )}

            {!sellerLoading && sellerDetails && (
              <div className="space-y-2 text-sm text-gray-700">
                <div>
                  <span className="text-gray-500">
                    Firm Name:
                  </span>{" "}
                  {sellerDetails.sellerProfile?.firmName ||
                    "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Business Name:
                  </span>{" "}
                  {sellerDetails.sellerProfile?.businessName ||
                    "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Owner:
                  </span>{" "}
                  {sellerDetails.sellerProfile?.ownerName ||
                    "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Registration:
                  </span>{" "}
                  {sellerDetails.sellerProfile
                    ?.registrationDetails || "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Address:
                  </span>{" "}
                  {sellerDetails.sellerProfile
                    ?.businessAddress || "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Website:
                  </span>{" "}
                  {sellerDetails.sellerProfile?.website ||
                    "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Tax ID:
                  </span>{" "}
                  {sellerDetails.sellerProfile?.taxId || "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    City:
                  </span>{" "}
                  {sellerDetails.city || "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Email:
                  </span>{" "}
                  {sellerDetails.email || "-"}
                </div>
                <div>
                  <span className="text-gray-500">
                    Mobile:
                  </span>{" "}
                  {getDialableMobile(sellerDetails.mobile) ? (
                    <a
                      href={`tel:${getDialableMobile(sellerDetails.mobile)}`}
                      className="text-indigo-700 hover:underline"
                    >
                      {sellerDetails.mobile}
                    </a>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

