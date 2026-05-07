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
import EmptyState from "../../components/EmptyState";

export default function MyPosts({
  city = "",
  selectedCategory = "all",
  cities = [],
  categories = [],
  refreshToken = 0,
  onCityChange,
  onCategoryChange,
  onVisibleCountChange
}) {
  const navigate = useNavigate();
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerDetails, setSellerDetails] = useState(null);
  const [auctionLoadingById, setAuctionLoadingById] = useState({});
  const [auctionHintReqId, setAuctionHintReqId] = useState("");
  const [compareHintReqId, setCompareHintReqId] = useState("");
  const modalRef = useRef(null);
  const loadMoreRef = useRef(null);
  const loadedCountRef = useRef(0);
  const PAGE_SIZE = 50;
  const getDialableMobile = (value) =>
    String(value || "").trim().replace(/[^\d+]/g, "");
  const normalizeRequirementStatus = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (["closed", "fulfilled", "cancelled", "expired"].includes(normalized)) {
      return normalized;
    }
    return "open";
  };
  const compactText = (value, fallback = "-") => {
    const text = String(value || "").trim();
    return text || fallback;
  };
  const getRequirementStatusMeta = (value) => {
    const status = normalizeRequirementStatus(value);
    if (status === "fulfilled") {
      return { label: "FULFILLED", className: "app-badge app-badge-danger" };
    }
    if (status === "cancelled") {
      return { label: "CANCELLED", className: "app-badge app-badge-muted" };
    }
    if (status === "expired") {
      return { label: "EXPIRED", className: "app-badge app-badge-muted" };
    }
    if (status === "closed") {
      return { label: "CLOSED", className: "app-badge app-badge-muted" };
    }
    return { label: "OPEN", className: "app-badge app-badge-new" };
  };

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
    let cancelled = false;

    async function loadRequirements({ nextPage = 1, append = false } = {}) {
      const session = getSession();
      if (!session?._id) {
        loadedCountRef.current = 0;
        setRequirements([]);
        setTotalCount(0);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = {
          page: nextPage,
          limit: PAGE_SIZE
        };
        const selectedCity = String(city || "").trim();
        const selectedCat = String(selectedCategory || "all").trim();
        if (selectedCity && selectedCity.toLowerCase() !== "all") {
          params.city = selectedCity;
        }
        if (selectedCat && selectedCat.toLowerCase() !== "all") {
          params.category = selectedCat;
        }

        const res = await api.get(`/buyer/my-posts/${session._id}`, { params });
        if (cancelled) return;

        const rows = Array.isArray(res.data) ? res.data : [];
        const nextTotal = Number(res?.headers?.["x-total-count"] || rows.length || 0);
        const nextLoadedCount = append
          ? loadedCountRef.current + rows.length
          : rows.length;
        if (!append) {
          setRequirements(rows);
        } else {
          setRequirements((prev) => {
            const next = [...prev, ...rows];
            return next;
          });
        }
        loadedCountRef.current = nextLoadedCount;
        setTotalCount(Number.isFinite(nextTotal) ? nextTotal : 0);
        setPage(nextPage);
        setHasMore(nextLoadedCount < nextTotal);
      } catch {
        if (!append) {
          setRequirements([]);
          setTotalCount(0);
          loadedCountRef.current = 0;
        }
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    }

    loadedCountRef.current = 0;
    setPage(1);
    setHasMore(false);
    setTotalCount(0);
    setRequirements([]);
    loadRequirements({ nextPage: 1, append: false });

    return () => {
      cancelled = true;
    };
  }, [city, selectedCategory, refreshToken]);

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

  const filteredRequirements = requirements;

  useEffect(() => {
    onVisibleCountChange?.(totalCount);
  }, [onVisibleCountChange, totalCount]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return undefined;
    const node = loadMoreRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && !loadingMore && !loading && hasMore) {
          setLoadingMore(true);
          const session = getSession();
          if (!session?._id) return;
          const params = {
            page: page + 1,
            limit: PAGE_SIZE
          };
          const selectedCity = String(city || "").trim();
          const selectedCat = String(selectedCategory || "all").trim();
          if (selectedCity && selectedCity.toLowerCase() !== "all") {
            params.city = selectedCity;
          }
          if (selectedCat && selectedCat.toLowerCase() !== "all") {
            params.category = selectedCat;
          }
          api
            .get(`/buyer/my-posts/${session._id}`, { params })
            .then((res) => {
              const rows = Array.isArray(res.data) ? res.data : [];
              const nextTotal = Number(res?.headers?.["x-total-count"] || rows.length || 0);
              const nextLoadedCount = loadedCountRef.current + rows.length;
              setRequirements((prev) => {
                const next = [...prev, ...rows];
                return next;
              });
              loadedCountRef.current = nextLoadedCount;
              setTotalCount(Number.isFinite(nextTotal) ? nextTotal : 0);
              setPage((prevPage) => prevPage + 1);
              setHasMore(nextLoadedCount < nextTotal);
            })
            .catch(() => {
              setHasMore(false);
            })
            .finally(() => {
              setLoadingMore(false);
            });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [PAGE_SIZE, city, hasMore, loading, loadingMore, page, selectedCategory]);

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
      loadedCountRef.current = Math.max(loadedCountRef.current - 1, 0);
      setTotalCount((prev) => Math.max(prev - 1, 0));
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
  async function updateRequirementStatus(reqId, status) {
    try {
      const res = await api.post(`/buyer/requirement/${reqId}/status`, {
        status
      });
      const updatedRequirement = res?.data?.requirement || {};
      setRequirements((prev) =>
        prev.map((item) =>
          String(item._id || item.id) === String(reqId)
            ? {
                ...item,
                ...updatedRequirement,
                offerCount: item.offerCount,
                sellerFirms: item.sellerFirms
              }
            : item
        )
      );
    } catch (err) {
      alert(
        err?.response?.data?.message || "Failed to update requirement status"
      );
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

  /* ---------------- LIST ---------------- */
  return (
    <>
      <div className="mb-4 rounded-2xl border border-[var(--ui-border)] bg-white p-3 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label text-gray-700">City</span>
            <select
              value={city}
              onChange={(e) => onCityChange?.(e.target.value)}
              className="w-full max-w-full px-4 py-2.5 rounded-xl border text-sm bg-white"
            >
              <option value="all">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label text-gray-700">Category</span>
            <select
              value={selectedCategory}
              onChange={(e) => onCategoryChange?.(e.target.value)}
              className="w-full max-w-full px-4 py-2.5 rounded-xl border text-sm bg-white"
            >
              <option value="all">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>Total posts: {totalCount}</span>
          <span>
            {requirements.length < totalCount
              ? `Showing ${requirements.length} loaded. Scroll to load more.`
              : `Showing all ${totalCount} posts.`}
          </span>
        </div>
      </div>

      {totalCount === 0 && (
        <EmptyState
          icon="clipboard"
          title="No requirements posted yet"
          description="Start by posting your first requirement and connect with sellers across India."
          action={() => navigate("/buyer/requirement/new")}
          actionLabel="Post your first requirement"
        />
      )}

      {totalCount > 0 && filteredRequirements.length === 0 && (
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
        const normalizedStatus = normalizeRequirementStatus(req.status);
        const auctionLive = offerCount >= 3;
        const auctionActive = req.reverseAuction?.active === true;
        const reqId = String(req._id || req.id || "");
        const isAuctionBusy = Boolean(auctionLoadingById[reqId]);
        const showDisabledInvokeHint =
          !auctionActive && offerCount < 3;
        const statusMeta = getRequirementStatusMeta(normalizedStatus);
        const statusText = normalizedStatus === "open" && auctionLive
          ? auctionActive
            ? "AUCTION LIVE"
            : "AUCTION READY"
          : statusMeta.label;
        const statusClass = normalizedStatus === "open" && auctionLive
          ? auctionActive
            ? "app-badge app-badge-danger"
            : "app-badge app-badge-warning"
          : statusMeta.className;

        return (
          <div
            key={req._id || req.id}
            id={`req-${reqId}`}
            onClick={() =>
              navigate(
                `/buyer/requirement/${req._id || req.id}/offers`
              )
            }
            className="relative app-card active:scale-[0.99] transition flex flex-col gap-4"
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
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-base text-[var(--ui-text)] break-words">
                    {compactText(req.productName || req.product)}
                  </h3>
                  <p className="text-sm text-[var(--ui-muted)] mt-1">
                    {compactText(req.city)} · {compactText(req.category)}
                  </p>
                </div>
                <span className={`${statusClass} shrink-0`}>{statusText}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Brand: {compactText(req.makeBrand || req.brand)}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Model: {compactText(req.typeModel || req.type)}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Qty: {compactText(req.quantity)} {compactText(req.unit || req.type, "")}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Posted: {new Date(req.createdAt || Date.now()).toLocaleDateString()}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${offerCount > 0 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  {offerCount > 0 ? `${offerCount} offers` : "No offers yet"}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-slate-50/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Requirement preview
                  </p>
                  <p className="text-sm text-[var(--ui-text)] whitespace-pre-line break-words">
                    {requirementDetails || "No extra details added yet."}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3 md:min-w-[220px]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Quick status
                  </p>
                  {auctionActive && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      Lowest price: Rs{" "}
                      {req.reverseAuction?.lowestPrice ??
                        req.currentLowestPrice ??
                        "-"}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-3">
                    Tap the card or the button below to manage offers.
                  </p>
                </div>
              </div>

              {attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Attachments
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((attachment, index) => {
                      const filename = extractAttachmentFileName(attachment);
                      const name = getDisplayName(attachment, index);
                      const typeMeta = getAttachmentTypeMeta(attachment, index);
                      return (
                        <button
                          key={`${name}-${index}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAttachment(attachment);
                          }}
                          className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--ui-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ui-text)] hover:bg-slate-50"
                          title={filename || "Attachment path missing"}
                        >
                          <span
                            className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                          >
                            {typeMeta.label}
                          </span>
                          <span className="truncate max-w-[11rem]">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {Array.isArray(req.sellerFirms) &&
                req.sellerFirms.length > 0 && (
                  <div
                    className="flex flex-wrap gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-xs text-gray-500 self-center">
                      Sellers
                    </span>
                    {req.sellerFirms.map((seller) => (
                      <button
                        key={seller.id}
                        onClick={() =>
                          openSellerDetails(seller.id)
                        }
                        className="inline-flex max-w-full items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        <span className="truncate max-w-[11rem]">
                          {seller.registeredBusinessName}
                        </span>
                      </button>
                    ))}
                  </div>
              )}

              <div
                className="grid grid-cols-2 gap-2 md:grid-cols-3"
                onClick={(e) => e.stopPropagation()}
              >
              <button
                onClick={() =>
                  navigate(`/buyer/requirement/${reqId}/edit`)
                }
                disabled={normalizedStatus !== "open"}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--ui-border)] px-4 text-xs font-semibold text-[var(--ui-text)]"
              >
                Edit Post
              </button>
              <button
                onClick={() =>
                  navigate(`/buyer/requirement/${reqId}/offers`)
                }
                disabled={offerCount < 1}
                className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-xs font-semibold ${
                  offerCount < 1
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "btn-primary text-white"
                }`}
                title={
                  offerCount < 1
                    ? "No offers yet"
                    : "Open offers and manage responses"
                }
              >
                View Offers
              </button>
              <div
                className="relative inline-flex"
                onMouseEnter={() => {
                  if (offerCount < 2) {
                    setCompareHintReqId(reqId);
                  }
                }}
                onMouseLeave={() => {
                  if (compareHintReqId === reqId) {
                    setCompareHintReqId("");
                  }
                }}
                onClick={(e) => {
                  if (offerCount >= 2) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setCompareHintReqId(reqId);
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (offerCount < 2) {
                      setCompareHintReqId(reqId);
                      return;
                    }
                    navigate(`/buyer/requirement/${reqId}/compare`);
                  }}
                  className={`inline-flex h-10 w-full items-center justify-center rounded-xl px-4 text-xs font-semibold ${
                    offerCount < 2
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                  aria-disabled={offerCount < 2}
                  title={
                    offerCount < 2
                      ? "You must have 2 or more offer to compare"
                      : "Compare offers"
                  }
                >
                  Compare Offers
                </button>
                {offerCount < 2 && compareHintReqId === reqId && (
                  <div className="absolute left-1/2 top-full z-20 mt-2 w-[min(90vw,22rem)] -translate-x-1/2 rounded-lg bg-black px-3 py-2 text-center text-xs text-white shadow-lg whitespace-normal break-words">
                    You must have 2 or more offer to compare
                  </div>
                )}
              </div>
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
                    if (normalizedStatus !== "open") {
                      return;
                    }
                    if (showDisabledInvokeHint) {
                      setAuctionHintReqId(reqId);
                      return;
                    }
                    toggleReverseAuction(req);
                  }}
                  aria-disabled={showDisabledInvokeHint || isAuctionBusy}
                  disabled={isAuctionBusy}
                  className={`inline-flex h-10 min-w-[160px] items-center justify-center px-4 rounded-lg text-xs font-semibold transition ${
                    normalizedStatus !== "open"
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : auctionActive
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
                  <div className="absolute left-1/2 top-full z-20 mt-2 w-[min(90vw,22rem)] -translate-x-1/2 rounded-lg bg-black px-3 py-2 text-center text-xs text-white shadow-lg whitespace-normal break-words">
                    You must receive 3 or more offers before you invoke reverse auction.
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 col-span-2 md:col-span-3">
                {normalizedStatus !== "open" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateRequirementStatus(reqId, "open");
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-300 px-3 text-xs font-semibold text-emerald-700"
                  >
                    Reopen
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateRequirementStatus(reqId, "closed");
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    >
                      Close
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateRequirementStatus(reqId, "fulfilled");
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-green-300 px-3 text-xs font-semibold text-green-700"
                    >
                      Fulfilled
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateRequirementStatus(reqId, "cancelled");
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-red-300 px-3 text-xs font-semibold text-red-600"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              </div>
            </div>
          </div>
        );
        })}
        {hasMore && (
          <div
            ref={loadMoreRef}
            className="py-4 text-center text-sm text-gray-500"
          >
            {loadingMore ? "Loading more posts..." : "Scroll to load more posts"}
          </div>
        )}
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
                    Registered Business Name:
                  </span>{" "}
                  {sellerDetails.registeredBusinessName || "-"}
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

