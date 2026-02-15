import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/api";
import socket from "../../services/socket";
import ChatModal from "../../components/ChatModal";
import ReviewModal from "../../components/ReviewModal";
import ReportModal from "../../components/ReportModal";

export default function OfferList() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [requirement, setRequirement] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeller, setChatSeller] = useState(null);
  const [contactEnabled, setContactEnabled] = useState(false);
  const [startingAuction, setStartingAuction] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  /* ---------------- FETCH DATA ---------------- */
  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(
          `/buyer/requirements/${id}/offers`
        );
        setRequirement(res.data.requirement);
        setOffers(
          res.data.offers.sort(
            (a, b) => a.price - b.price
          )
        );
      } catch (err) {
        setRequirement(null);
        setOffers([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

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
  const bestOffer = offers[0];
  const auctionActive =
    requirement.reverseAuction?.active ||
    requirement.reverseAuctionActive;
  const targetPrice =
    typeof requirement.reverseAuction?.targetPrice === "number"
      ? requirement.reverseAuction.targetPrice
      : null;
  const canShowAuctionButton = offers.length >= 3;
  const canInvokeAuction = canShowAuctionButton && !auctionActive && !startingAuction;

  async function enableReverseAuction() {
    if (!canInvokeAuction) return;
    if (offers.length < 3) {
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

        {(requirement.reverseAuction?.active ||
          requirement.reverseAuctionActive) && (
          <p className="text-sm text-red-600 mt-1">
            Reverse auction live
            {typeof targetPrice === "number"
              ? ` * Auto-close at Rs ${targetPrice}`
              : ""}
          </p>
        )}
        {canShowAuctionButton && (
          <button
            onClick={enableReverseAuction}
            className={`mt-3 ml-2 text-sm rounded-xl px-4 py-2 font-semibold transition ${
              canInvokeAuction
                ? "btn-primary"
                : "bg-gray-300 text-gray-600 cursor-not-allowed"
            }`}
            disabled={!canInvokeAuction}
          >
            {startingAuction ? "Invoking..." : "Invoke Reverse Auction"}
          </button>
        )}
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
                  <p className="text-sm text-[var(--ui-muted)]">
                    {offer.sellerFirm}
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

              {/* CTA icons */}
              <div className="flex gap-4 mt-4">
                {offer.sellerId && contactEnabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatSeller({
                        id: offer.sellerId,
                        name: offer.sellerFirm || "Seller"
                      });
                      setChatOpen(true);
                    }}
                    className="flex-1 text-center py-3 btn-brand rounded-xl font-semibold"
                  >
                    Chat
                  </button>
                )}

                {!contactEnabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setContactEnabled(true);
                    }}
                    className="flex-1 text-center py-3 btn-primary rounded-xl font-semibold"
                  >
                    Enable Contact
                  </button>
                )}
              </div>

              {offer.sellerId && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setReviewTarget(offer.sellerId);
                      setReviewOpen(true);
                    }}
                    className="w-full text-center py-2 border border-[var(--ui-border)] rounded-xl text-sm font-semibold text-[var(--ui-text)]"
                  >
                    Rate Seller
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setReportTarget(offer.sellerId);
                      setReportOpen(true);
                    }}
                    className="w-full text-center py-2 border border-red-300 text-red-600 rounded-xl text-sm font-semibold"
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
    </div>
  );
}

