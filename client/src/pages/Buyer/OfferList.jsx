import { useState } from "react";
import ChatModal from "../../components/ChatModal";
import ShareDocModal from "../../components/ShareDocModal";
import ReviewModal from "../../components/ReviewModal";
import socket from "../../socket";

function invokeReverseAuction() {
  const lowest = Math.min(
    ...filteredOffers.map((o) => Number(o.price))
  );


<select
  value={auctionDuration}
  onChange={(e) => setAuctionDuration(e.target.value)}
  className="border rounded px-3 py-2 mb-3"
>
  <option value="30">30 minutes</option>
  <option value="60">1 hour</option>
  <option value="180">3 hours</option>
  <option value="1440">1 day</option>
</select>

  const updatedRequirement = {
    ...requirement,
    reverseAuctionActive: true,
    reverseAuctionStartedAt: Date.now(),
    currentLowestPrice: lowest,
  };

  localStorage.setItem(
    "buyer_requirement",
    JSON.stringify(updatedRequirement)
  );

function autoCloseAuction(requirement) {
  if (
    requirement.reverseAuctionActive &&
    !requirement.reverseAuctionClosed &&
    Date.now() >= requirement.reverseAuctionEndsAt
  ) {
    const offers =
      JSON.parse(localStorage.getItem("offers")) || [];

    const validOffers = offers.filter(
      (o) =>
        o.requirementId === requirement.id &&
        !o.declinedAuction
    );

    if (validOffers.length > 0) {
      const winner = validOffers.reduce(
        (min, o) =>
          Number(o.price) < Number(min.price)
            ? o
            : min,
        validOffers[0]
      );

      requirement.reverseAuctionClosed = true;
      requirement.reverseAuctionActive = false;
      requirement.winningOfferId =
        winner.sellerId;
    } else {
      requirement.reverseAuctionClosed = true;
      requirement.reverseAuctionActive = false;
    }

    localStorage.setItem(
      "buyer_requirement",
      JSON.stringify(requirement)
    );
  }
}




  // 🔔 Notify all sellers
  filteredOffers.forEach((offer) => {
    socket.emit("reverse_auction_invite", {
      sellerId: offer.sellerId,
      product: requirement.product,
      lowestPrice: lowest,
    });
  });

  alert("Reverse auction started");
}


export default function OfferList() {
  const requirement = JSON.parse(
    localStorage.getItem("buyer_requirement")
  );

  const allOffers =
    JSON.parse(localStorage.getItem("offers")) || [];

  const [chatSeller, setChatSeller] = useState(null);
  const [showDoc, setShowDoc] = useState(false);
  const [reviewSeller, setReviewSeller] = useState(null);
  const canInvokeAuction = filteredOffers.length >= 3;
const [auctionDuration, setAuctionDuration] = useState("30");

const durationMs =
  Number(auctionDuration) * 60 * 1000;

const updatedRequirement = {
  ...requirement,
  reverseAuctionActive: true,
  reverseAuctionStartedAt: Date.now(),
  reverseAuctionEndsAt:
    Date.now() + durationMs,
  reverseAuctionClosed: false,
};



  if (!requirement) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Offers</h1>
        <p className="text-gray-600 mt-2">
          No buyer requirement found.
        </p>
      </div>
    );
  }

  // 🔽 Filter + sort low → high
  const offers = allOffers
    .filter(
      (o) =>
        o.requirementId === requirement.id
    )
    .sort((a, b) => a.price - b.price);



  // ✅ Mark offer as viewed
  const markViewed = (offer) => {
    const updated = allOffers.map((o) =>
      o.requirementId === offer.requirementId &&
      o.sellerId === offer.sellerId
        ? { ...o, viewedByBuyer: true }
        : o
socket.emit("buyer_viewed_offer", {
  sellerId: offer.sellerId,
  product: offer.product,
});

    );

    localStorage.setItem(
      "offers",
      JSON.stringify(updated)
    );
  };

{canInvokeAuction && !requirement.reverseAuctionActive && (
  <button
    onClick={invokeReverseAuction}
    className="mb-4 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700"
  >
    ⚡ Invoke Reverse Auction
  </button>
)}


  return (
    <>
      <div className="min-h-screen bg-gray-50 p-6">
        <h1 className="text-2xl font-bold mb-6">
          Offers Received
        </h1>

        {offers.length === 0 && (
          <p className="text-gray-600">
            No offers received yet.
          </p>
        )}

        {offers.map((offer, index) => {
  const isBestPrice = index === 0;
  const isNew = !offer.viewedByBuyer;

          return (
            <div
  key={index}
  className={`p-5 rounded-xl shadow mb-4 max-w-2xl border-2 ${
    isBestPrice
      ? "bg-green-50 border-green-500"
      : "bg-white border-transparent"
  }`}
>
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-lg font-semibold">
                    ₹ {offer.price}
                  </p>
                  <p className="text-gray-700">
                    Seller: {offer.sellerFirm}
                  </p>
                </div>

                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    isNew
                      ? "bg-green-600 text-white"
                      : "bg-gray-300 text-gray-700"
                  }`}
                >
{isBestPrice && (
  <span className="ml-2 text-xs bg-green-700 text-white px-2 py-1 rounded-full">
    🥇 BEST PRICE
  </span>
)}
                  {isNew ? "🆕 NEW" : "VIEWED"}
                </span>
              </div>

              <p className="text-gray-500 mb-3">
                City: {offer.sellerCity}
              </p>

              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                {offer.sellerMobile ? (
                  <a
                    href={`tel:${offer.sellerMobile}`}
                    onClick={() =>
                      markViewed(offer)
                    }
                    className="px-3 py-1 bg-green-600 text-white rounded"
                  >
                    📞 Call
                  </a>
                ) : (
                  <span className="px-3 py-1 bg-gray-400 text-white rounded">
                    📞 No Number
                  </span>
                )}

                <button
                  onClick={() => {
                    markViewed(offer);
                    setChatSeller(offer);
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded"
                >
                  💬 Chat
                </button>

                <button
                  onClick={() => {
                    markViewed(offer);
                    setShowDoc(true);
                  }}
                  className="px-3 py-1 bg-gray-700 text-white rounded"
                >
                  📎 Docs
                </button>

                <button
                  onClick={() => {
                    markViewed(offer);
                    setReviewSeller({
                      sellerId: offer.sellerId,
                      requirementId:
                        offer.requirementId,
                    });
                  }}
                  className="px-3 py-1 bg-yellow-500 text-white rounded"
                >
                  ⭐ Rate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chat */}
      <ChatModal
        open={!!chatSeller}
        sellerName={chatSeller?.sellerFirm}
        sellerId={chatSeller?.sellerId}
        onClose={() => setChatSeller(null)}
      />

      {/* Docs */}
      <ShareDocModal
        open={showDoc}
        onClose={() => setShowDoc(false)}
      />

      {/* Review */}
      <ReviewModal
        open={!!reviewSeller}
        sellerId={reviewSeller?.sellerId}
        requirementId={
          reviewSeller?.requirementId
        }
        onClose={() => setReviewSeller(null)}
      />
    </>
  );
}
