import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getSession } from "../../services/storage";
import { confirmDialog } from "../../utils/dialogs";

export default function MyPosts() {
  const navigate = useNavigate();
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerDetails, setSellerDetails] = useState(null);
  const [auctionLoadingById, setAuctionLoadingById] = useState({});
  const modalRef = useRef(null);

  function parseAttachment(attachment) {
    if (attachment && typeof attachment === "object") {
      return {
        url: String(attachment.url || attachment.path || attachment.filename || "").trim(),
        originalName: String(attachment.originalName || attachment.name || "").trim()
      };
    }
    return {
      url: String(attachment || "").trim(),
      originalName: ""
    };
  }

  function extractAttachmentFileName(attachment) {
    const { url } = parseAttachment(attachment);
    if (!url) return "";

    if (url.startsWith("http://") || url.startsWith("https://")) {
      try {
        const parsed = new URL(url);
        return decodeURIComponent(String(parsed.pathname || "").split("/").pop() || "");
      } catch {
        return "";
      }
    }

    return decodeURIComponent(url.split("/").pop() || "");
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
    const parsed = parseAttachment(attachment);
    if (parsed.originalName) return parsed.originalName;
    const raw = parsed.url.split("?")[0].split("#")[0];
    const tail = decodeURIComponent(raw.split("/").pop() || "").trim();
    if (!tail) return `Attachment ${index + 1}`;
    return tail.replace(/^[^_]+_\d+_/, "");
  }

  function isImage(attachment) {
    const lower = String(parseAttachment(attachment).url || "").toLowerCase();
    return (
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png")
    );
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
      <div className="space-y-4">
        {requirements.map((req) => {
        const attachments = Array.isArray(req.attachments)
          ? req.attachments
          : [];
        const offerCount = Number(req.offerCount || 0);
        const normalizedStatus = req.status?.toUpperCase() || "OPEN";
        const auctionLive = offerCount >= 3;
        const auctionActive = req.reverseAuction?.active === true;
        const reqId = String(req._id || req.id || "");
        const isAuctionBusy = Boolean(auctionLoadingById[reqId]);
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
                {req.product}
              </h3>

              <span
                className={`${statusClass} mr-10`}
              >
                {statusText}
              </span>
            </div>

            {/* Meta */}
            <p className="text-sm text-[var(--ui-muted)]">
              {req.quantity} {req.unit} · {req.category}
            </p>

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
                    return (
                      <div
                        key={`${name}-${index}`}
                        className="flex items-center gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isImage(attachment) && (
                          <span className="w-10 h-10 rounded-lg border bg-gray-50 inline-flex items-center justify-center text-gray-500 text-[10px]">
                            IMG
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openAttachment(attachment)}
                          className="text-xs text-amber-700 hover:underline break-all"
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
                      className="px-2 py-1 text-xs rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      {seller.firmName}
                    </button>
                  ))}
                </div>
              )}

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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleReverseAuction(req);
                }}
                disabled={
                  isAuctionBusy ||
                  (!auctionActive && offerCount < 3)
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  auctionActive
                    ? "bg-red-600 text-white"
                    : offerCount >= 3
                    ? "btn-primary text-white"
                    : "bg-gray-300 text-gray-600 cursor-not-allowed"
                }`}
                title={
                  !auctionActive && offerCount < 3
                    ? "Requires 3 or more offers"
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
            </div>

            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() =>
                  navigate(`/buyer/requirement/${reqId}/edit`)
                }
                className="inline-flex w-fit items-center justify-center px-3 py-2 border border-[var(--ui-border)] rounded-lg text-xs font-semibold text-[var(--ui-text)]"
              >
                Edit Post
              </button>
              <button
                onClick={() =>
                  navigate(`/buyer/requirement/${reqId}/offers`)
                }
                disabled={offerCount < 1}
                className={`inline-flex w-fit items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold ${
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
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

