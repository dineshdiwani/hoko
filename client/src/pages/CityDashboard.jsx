import { useEffect, useState } from "react";
import api from "../services/api";
import { getSession } from "../services/storage";
import {
  extractAttachmentFileName,
  getAttachmentDisplayName,
  isImageAttachment
} from "../utils/attachments";

export default function CityDashboard({
  city,
  category = "all",
  categories = [],
  onCategoryChange
}) {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState("all");
  const [auctionLoadingById, setAuctionLoadingById] = useState({});
  const session = getSession();
  const currentBuyerId = String(session?._id || session?.id || "");
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

  const appBaseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:5173";

  function getShareText(req) {
    const product = req.product || req.productName || "Requirement";
    const quantity = req.quantity ? `${req.quantity} ${req.unit || ""}` : "";
    const cityText = req.city || city || "";
    const category = req.category || "";
    const parts = [
      `${product}${quantity ? ` (${quantity})` : ""}`,
      category ? `Category: ${category}` : "",
      cityText ? `City: ${cityText}` : ""
    ].filter(Boolean);
    return `${parts.join(" | ")}\nJoin hoko to respond: ${appBaseUrl}/seller/login`;
  }

  function getShareLinks(req) {
    const shareText = getShareText(req);
    const shareUrl = `${appBaseUrl}/seller/login`;
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(shareUrl);
    return {
      whatsapp: `https://wa.me/?text=${encodedText}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
        "Buyer requirement on hoko"
      )}&body=${encodedText}`
    };
  }

  useEffect(() => {
    if (!city) return;

    async function load() {
      setLoading(true);
      try {
        const res = await api.get(
          `/dashboard/city/${encodeURIComponent(city)}`
        );
        setRequirements(res.data || []);
      } catch (err) {
        console.error(err);
        setRequirements([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [city]);

  const timeOptions = [
    { key: "all", label: "All Posts" },
    { key: "today", label: "Today's Posts" },
    { key: "week", label: "Last Week Posts" },
    { key: "month", label: "Last Month Posts" }
  ];

  const isToday = (value) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date.toDateString() === new Date().toDateString();
  };

  const isWithinDays = (value, days) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return date.getTime() >= cutoff;
  };

  const matchesTimeFilter = (req) => {
    if (timeFilter === "all") return true;
    const createdAt = req.createdAt || req.created_at;
    if (!createdAt) return false;
    if (timeFilter === "today") return isToday(createdAt);
    if (timeFilter === "week") return isWithinDays(createdAt, 7);
    if (timeFilter === "month") return isWithinDays(createdAt, 30);
    return true;
  };

  const matchesCategoryFilter = (req) => {
    if (!category || category === "all") return true;
    const reqCategory = String(req.category || "").trim().toLowerCase();
    return reqCategory === String(category).trim().toLowerCase();
  };

  /* ---------------- EMPTY STATE ---------------- */
  if (!city) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500">
          Select a city to view marketplace activity.
        </p>
      </div>
    );
  }

  /* ---------------- LOADING ---------------- */
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-24 bg-gray-200 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  /* ---------------- NO DATA ---------------- */
  if (!requirements) {
    return (
      <div className="text-center py-10 text-gray-500">
        No activity data available for {city}.
      </div>
    );
  }

  const filteredRequirements = requirements.filter(
    (req) => matchesTimeFilter(req) && matchesCategoryFilter(req)
  );
  const totalRequirements = filteredRequirements.length;
  const liveAuctions = filteredRequirements.filter(
    (req) => req.reverseAuction?.active || req.reverseAuctionActive
  ).length;

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

  /* ---------------- DASHBOARD ---------------- */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">
          Category
        </span>
        <select
          value={category}
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

      <div className="flex flex-wrap gap-2">
        {timeOptions.map((option) => (
          <button
            key={option.key}
            onClick={() => setTimeFilter(option.key)}
            className={`app-chip ${timeFilter === option.key ? "app-chip-active" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="app-stat">
          <p className="text-xs text-[var(--ui-muted)]">
            Active Requirements
          </p>
          <p className="text-xl font-bold text-hoko-brand">
            {totalRequirements}
          </p>
        </div>

        <div className="app-stat">
          <p className="text-xs text-[var(--ui-muted)]">
            Live Auctions
          </p>
          <p className="text-2xl font-bold text-red-600">
            {liveAuctions}
          </p>
        </div>
      </div>

      {totalRequirements === 0 && (
        <div className="text-center py-10 text-gray-500">
          No requirements posted for {city} yet.
        </div>
      )}

      {totalRequirements > 0 && (
        <div className="space-y-4">
          {filteredRequirements.map((req) => {
            const isAuction =
              req.reverseAuction?.active ||
              req.reverseAuctionActive;
            const reqId = String(req._id || req.id || "");
            const offerCount = Number(req.offerCount || 0);
            const isOwnPost =
              currentBuyerId &&
              String(req.buyerId || "") === currentBuyerId;
            const isAuctionBusy = Boolean(auctionLoadingById[reqId]);
            const attachments = Array.isArray(req.attachments)
              ? req.attachments
              : [];
            const shareLinks = getShareLinks(req);

            return (
              <div
                key={req._id || req.id}
                className="app-card"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-base text-[var(--ui-text)]">
                    {req.product || req.productName}
                  </h3>
                  {isAuction && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                      AUCTION
                    </span>
                  )}
                </div>

                <p className="text-sm text-[var(--ui-muted)]">
                  {req.quantity || "-"} {req.unit || ""} ·{" "}
                  {req.category}
                </p>

                <p className="text-xs text-gray-400 mt-1">
                  Posted{" "}
                  {new Date(
                    req.createdAt || Date.now()
                  ).toLocaleDateString()}
                </p>

                {isOwnPost && (
                  <div className="mt-3">
                    <button
                      onClick={() => toggleReverseAuction(req)}
                      disabled={
                        isAuctionBusy ||
                        (!isAuction && offerCount < 3)
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isAuction
                          ? "bg-red-600 text-white"
                          : offerCount >= 3
                          ? "btn-primary text-white"
                          : "bg-gray-300 text-gray-600 cursor-not-allowed"
                      }`}
                      title={
                        !isAuction && offerCount < 3
                          ? "Requires 3 or more offers"
                          : isAuction
                          ? "Stop reverse auction"
                          : "Invoke reverse auction"
                      }
                    >
                      {isAuctionBusy
                        ? isAuction
                          ? "Stopping..."
                          : "Invoking..."
                        : isAuction
                        ? "Stop Reverse Auction"
                        : "Invoke Reverse Auction"}
                    </button>
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

                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs text-gray-500 mr-1">
                    Share:
                  </span>
                  <a
                    href={shareLinks.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Share on WhatsApp"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-green-200 text-green-700 hover:bg-green-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
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
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.41c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.45h-1.26c-1.24 0-1.62.77-1.62 1.56v1.87h2.76l-.44 2.91h-2.32v7.03C18.34 21.24 22 17.08 22 12.06Z" />
                    </svg>
                  </a>
                  <a
                    href={shareLinks.gmail}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Share via Gmail"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M20 4H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h4V9.7l4 3 4-3V20h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4.2-8 6-8-6V6l8 6 8-6v2.2Z" />
                    </svg>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

