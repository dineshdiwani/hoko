import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/api";
import socket from "../../services/socket";
import ChatModal from "../../components/ChatModal";
import ReviewModal from "../../components/ReviewModal";
import ReportModal from "../../components/ReportModal";
import {
  extractAttachmentFileName,
  getAttachmentDisplayName,
  getAttachmentTypeMeta
} from "../../utils/attachments";

export default function OfferList() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [requirement, setRequirement] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeller, setChatSeller] = useState(null);
  const [startingAuction, setStartingAuction] = useState(false);
  const [showAuctionHint, setShowAuctionHint] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerDetails, setSellerDetails] = useState(null);
  const sellerModalRef = useRef(null);

  /* ---------------- FETCH DATA ---------------- */
  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(
          `/buyer/requirements/${id}/offers`
        );
        setRequirement(res.data.requirement);
        const nextOffers = (res.data.offers || []).sort(
          (a, b) => a.price - b.price
        );
        setOffers(nextOffers);
      } catch (err) {
        setRequirement(null);
        setOffers([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        sellerModalRef.current &&
        !sellerModalRef.current.contains(event.target)
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

  /* ---------------- SOCKET UPDATES ---------------- */
  useEffect(() => {
    function onPriceUpdate(update) {
      if (update.requirementId !== id) return;

      setOffers((prev) =>
        prev
          .map((o) =>
            o._id === update.offerId
              ? { ...o, price: update.price }
              : o
          )
          .sort((a, b) => a.price - b.price)
      );
    }

    socket.on("auction_price_update", onPriceUpdate);
    return () =>
      socket.off("auction_price_update", onPriceUpdate);
  }, [id]);

  /* ---------------- VIEWED ---------------- */
  async function markViewed(offerId) {
    const target = offers.find(
      (o) => o._id === offerId || o.id === offerId
    );
    const sellerId = target?.sellerId;
    const canNotifySeller =
      typeof sellerId === "string" &&
      /^[a-f\\d]{24}$/i.test(sellerId);
    try {
      await api.post(
        `/buyer/offers/${offerId}/view`
      );
      if (canNotifySeller && requirement) {
        socket.emit("buyer_viewed_offer", {
          sellerId,
          product:
            requirement.product ||
            requirement.productName ||
            "Product"
        });
      }
      setOffers((prev) =>
        prev.map((o) =>
          o._id === offerId
            ? { ...o, viewedByBuyer: true }
            : o
        )
      );
    } catch {
      if (canNotifySeller && requirement) {
        socket.emit("buyer_viewed_offer", {
          sellerId,
          product:
            requirement.product ||
            requirement.productName ||
            "Product"
        });
      }
    }
  }

  /* ---------------- LOADING ---------------- */
  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-gray-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!requirement) {
    return (
      <p className="p-6 text-gray-600">
        Requirement not found.
      </p>
    );
  }

  const productName =
    requirement.product || requirement.productName || "Product";
  const requirementDetails = String(
    requirement.details || requirement.description || ""
  ).trim();
  const bestOffer = offers[0];
  const auctionActive =
    requirement.reverseAuction?.active === true;
  const targetPrice =
    typeof requirement.reverseAuction?.targetPrice === "number"
      ? requirement.reverseAuction.targetPrice
      : null;
  const hasMinimumOffers = offers.length >= 3;
  const canInvokeAuction = hasMinimumOffers && !auctionActive && !startingAuction;
  const canStopAuction = auctionActive && !startingAuction;
  const showDisabledInvokeHint = !auctionActive && !hasMinimumOffers;

  async function startReverseAuction() {
    if (!canInvokeAuction) {
      if (!hasMinimumOffers) {
        alert("Reverse auction can be invoked only after 3 or more offers.");
      }
      return;
    }
    if (!hasMinimumOffers) {
      alert("Reverse auction can be invoked only after 3 or more offers.");
      return;
    }
    try {
      setStartingAuction(true);
      const lowestPrice = bestOffer ? bestOffer.price : null;
      const res = await api.post(
        `/buyer/requirement/${id}/reverse-auction/start`,
        { lowestPrice }
      );
      setRequirement(res.data);
    } catch (err) {
      const message = err?.response?.data?.message;
      alert(message || "Unable to start reverse auction. Try again.");
    } finally {
      setStartingAuction(false);
    }
  }

  async function stopReverseAuction() {
    if (!canStopAuction) return;
    try {
      setStartingAuction(true);
      const res = await api.post(
        `/buyer/requirement/${id}/reverse-auction/stop`
      );
      setRequirement(res.data);
    } catch (err) {
      const message = err?.response?.data?.message;
      alert(message || "Unable to stop reverse auction. Try again.");
    } finally {
      setStartingAuction(false);
    }
  }

  async function enableContact(offerId) {
    try {
      await api.post(`/buyer/requirements/${id}/enable-contact`, {
        offerId
      });
      setOffers((prev) =>
        prev.map((offer) => ({
          ...offer,
          contactEnabledByBuyer:
            String(offer._id || offer.id) === String(offerId)
              ? true
              : offer.contactEnabledByBuyer
        }))
      );
    } catch (err) {
      const message = err?.response?.data?.message;
      alert(message || "Unable to enable chat right now.");
    }
  }

  async function disableContact(offerId) {
    try {
      await api.post(`/buyer/requirements/${id}/disable-contact`, {
        offerId
      });
      setChatOpen(false);
      setOffers((prev) =>
        prev.map((offer) => ({
          ...offer,
          contactEnabledByBuyer:
            String(offer._id || offer.id) === String(offerId)
              ? false
              : offer.contactEnabledByBuyer
        }))
      );
    } catch (err) {
      const message = err?.response?.data?.message;
      alert(message || "Unable to stop chat right now.");
    }
  }

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

  async function openOfferAttachment(attachment, index = 0) {
    const newTab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const filename = extractAttachmentFileName(attachment, index);
      if (!filename) throw new Error("Invalid attachment path");
      const res = await api.get(
        `/seller/offer-attachments/${encodeURIComponent(filename)}`,
        { responseType: "blob" }
      );
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

  return (
    <div className="page">
      {/* ================= HEADER ================= */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-[var(--ui-border)]">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-hoko-brand mb-1"
          >
            {"<- Back"}
          </button>

          <h1 className="text-lg font-bold">
            Offers for {productName}
          </h1>
          {requirementDetails && (
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">
              {requirementDetails}
            </p>
          )}

        {requirement.reverseAuction?.active === true && (
          <p className="text-sm text-red-600 mt-1">
            Reverse auction live
            {typeof targetPrice === "number"
              ? ` * Auto-close at Rs ${targetPrice}`
              : ""}
          </p>
        )}
        <div
          className="relative inline-flex"
          onMouseEnter={() => {
            if (showDisabledInvokeHint) setShowAuctionHint(true);
          }}
          onMouseLeave={() => setShowAuctionHint(false)}
        >
          <button
            onClick={(e) => {
              if (showDisabledInvokeHint) {
                e.preventDefault();
                e.stopPropagation();
                setShowAuctionHint(true);
                return;
              }
              if (auctionActive) {
                stopReverseAuction();
              } else {
                startReverseAuction();
              }
            }}
            className={`mt-3 ml-2 text-sm rounded-xl px-4 py-2 font-semibold transition ${
              auctionActive
                ? canStopAuction
                  ? "bg-red-600 text-white"
                  : "bg-gray-300 text-gray-600 cursor-not-allowed"
                : canInvokeAuction
                ? "btn-primary"
                : "bg-gray-300 text-gray-600 cursor-not-allowed"
            }`}
            aria-disabled={showDisabledInvokeHint || (auctionActive ? !canStopAuction : startingAuction)}
            disabled={auctionActive ? !canStopAuction : startingAuction}
            title={
              showDisabledInvokeHint
                ? "You must receive 3 or more offers before you invoke reverse auction."
                : auctionActive
                ? "Stop reverse auction"
                : "Invoke reverse auction"
            }
          >
            {startingAuction
              ? auctionActive
                ? "Stopping..."
                : "Invoking..."
              : auctionActive
              ? "Stop Reverse Auction"
              : "Invoke Reverse Auction"}
          </button>
          {showDisabledInvokeHint && showAuctionHint && (
            <div className="absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black px-3 py-2 text-xs text-white shadow-lg">
              You must receive 3 or more offers before you invoke reverse auction.
            </div>
          )}
        </div>
      </div>
      </div>

      {/* ================= BEST PRICE ================= */}
      {bestOffer && (
        <div className="bg-[var(--ui-success)] text-white">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <p className="text-xs opacity-90">
              Best Price
            </p>
            <p className="text-2xl font-bold">
              Rs {bestOffer.price}
            </p>
            <p className="text-sm opacity-90">
              {bestOffer.sellerFirm}
            </p>
          </div>
        </div>
      )}

      {/* ================= OFFERS ================= */}
      <div className="page-shell pt-6 pb-24">
        {offers.length === 0 && (
          <div className="app-card-muted text-center text-gray-600">
            No offers yet. You'll see chat options once a seller submits
            an offer.
          </div>
        )}
        <div className="space-y-4">
        {offers.map((offer, index) => {
          const isBest = index === 0;
          const offerDetails = String(
            offer.message || offer.note || offer.details || offer.description || ""
          ).trim();

          return (
            <div
              key={offer._id || offer.id}
              onClick={() =>
                markViewed(offer._id || offer.id)
              }
              className={`app-card active:scale-[0.99] transition ${
                isBest
                  ? "border-green-500"
                  : ""
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-xl font-semibold">
                    Rs {offer.price}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openSellerDetails(offer.sellerId);
                    }}
                    className="text-sm font-bold text-indigo-700 hover:underline"
                  >
                    {offer.sellerFirm}
                  </button>
                  <p className="text-xs text-indigo-700 mt-1">
                    Tap seller name to view full seller details
                  </p>
                  <p className="text-sm text-[var(--ui-muted)] mt-1">
                    Delivery: {offer.deliveryTime || "-"}
                  </p>
                  <p className="text-sm text-[var(--ui-muted)]">
                    Payment: {offer.paymentTerms || "-"}
                  </p>
                </div>

                <span
                  className={`app-badge ${
                    offer.viewedByBuyer
                      ? "app-badge-muted"
                      : "app-badge-new"
                  }`}
                >
                  {offer.viewedByBuyer
                    ? "Viewed"
                    : "New"}
                </span>
              </div>

              {offerDetails && (
                <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-white p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Details</p>
                  <p className="text-sm text-[var(--ui-text)] whitespace-pre-line break-words">
                    {offerDetails}
                  </p>
                </div>
              )}

              {Array.isArray(offer.attachments) && offer.attachments.length > 0 && (
                <div className="mt-3 rounded-xl border border-[var(--ui-border)] p-3">
                  <p className="text-sm font-medium mb-2">Attachments</p>
                  <div className="space-y-2">
                    {offer.attachments.map((attachment, attachmentIndex) => {
                      const filename = extractAttachmentFileName(
                        attachment,
                        attachmentIndex
                      );
                      const displayName = getAttachmentDisplayName(
                        attachment,
                        attachmentIndex
                      );
                      const typeMeta = getAttachmentTypeMeta(
                        attachment,
                        attachmentIndex
                      );
                      return (
                        <div
                          key={`${displayName}-${attachmentIndex}`}
                          className="flex items-center gap-3"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openOfferAttachment(attachment, attachmentIndex);
                            }}
                            className="text-sm text-indigo-600 hover:underline break-all inline-flex items-center gap-2"
                            title={filename || "Attachment path missing"}
                          >
                            <span
                              className={`inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${typeMeta.className}`}
                            >
                              {typeMeta.label}
                            </span>
                            {displayName}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CTA icons */}
              <div className="flex flex-wrap items-center justify-start gap-2 mt-4">
                {offer.sellerId &&
                  offer.contactEnabledByBuyer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatSeller({
                        id: offer.sellerId,
                        name: offer.sellerFirm || "Seller"
                      });
                      setChatOpen(true);
                    }}
                    className="inline-flex w-fit items-center justify-center px-3 py-2 btn-brand rounded-xl font-semibold"
                  >
                    Chat
                  </button>
                )}

                {offer.sellerId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const offerId = String(offer._id || offer.id || "");
                      if (!offerId) return;
                      if (offer.contactEnabledByBuyer) {
                        disableContact(offerId);
                        return;
                      }
                      enableContact(offerId);
                    }}
                    className={`inline-flex w-fit items-center justify-center px-3 py-2 rounded-xl font-semibold ${
                      offer.contactEnabledByBuyer
                        ? "bg-red-600 text-white"
                        : "btn-primary"
                    }`}
                  >
                    {offer.contactEnabledByBuyer
                      ? "Stop Chat"
                      : "Enable Chat"}
                  </button>
                )}
              </div>

              {offer.sellerId && (
                <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setReviewTarget(offer.sellerId);
                      setReviewOpen(true);
                    }}
                    className="inline-flex w-fit items-center justify-center px-3 py-2 border border-[var(--ui-border)] rounded-xl text-sm font-semibold text-[var(--ui-text)]"
                  >
                    Rate Seller
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setReportTarget(offer.sellerId);
                      setReportOpen(true);
                    }}
                    className="inline-flex w-fit items-center justify-center px-3 py-2 border border-red-300 text-red-600 rounded-xl text-sm font-semibold"
                  >
                    Report Seller
                  </button>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>

      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        sellerId={chatSeller?.id}
        sellerName={chatSeller?.name}
        requirementId={id}
      />

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        reviewedUserId={reviewTarget}
        requirementId={id}
        targetRole="seller"
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={reportTarget}
        requirementId={id}
      />

      {sellerModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            ref={sellerModalRef}
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
    </div>
  );
}

