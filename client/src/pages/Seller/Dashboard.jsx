import { useState } from "react";
import OfferModal from "../../components/OfferModal";
import socket from "../../socket";



export default function SellerDashboard() {
  const seller = JSON.parse(
    localStorage.getItem("seller_profile")
  );

  const requirement = JSON.parse(
    localStorage.getItem("buyer_requirement")
  );

  const [showOffer, setShowOffer] = useState(false);
const isAuctionActive =
  requirement?.reverseAuctionActive;


useEffect(() => {
  const handler = (notif) => {
    console.log("🔔 Seller notification:", notif);

    const existing =
      JSON.parse(localStorage.getItem("seller_notifications")) || [];

    existing.unshift({
      ...notif,
      read: false,
    });
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

const [timeLeft, setTimeLeft] = useState(0);

useEffect(() => {
  if (!requirement?.reverseAuctionActive) return;

  const interval = setInterval(() => {
    setTimeLeft(
      Math.max(
        0,
        requirement.reverseAuctionEndsAt -
          Date.now()
      )
    );
  }, 1000);

  return () => clearInterval(interval);
}, [requirement]);

<p className="text-sm text-red-600">
  ⏳ Auction ends in{" "}
  {Math.ceil(timeLeft / 60000)} minutes
</p>



    localStorage.setItem(
      "seller_notifications",
      JSON.stringify(existing)
    );
  };

  socket.on("seller_notification", handler);

  return () => {
    socket.off("seller_notification", handler);
  };
}, []);
{isAuctionActive && (
  <div className="mb-4 p-4 rounded-xl bg-red-100 text-red-800">
    ⚡ Reverse Auction Active  
    <br />
    Current lowest price: ₹
    {requirement.currentLowestPrice}
  </div>
)}


  // ✅ EARLY RETURN — INSIDE FUNCTION
  if (!seller || !requirement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600 text-lg">
          Seller profile or buyer requirement not found.
        </p>
      </div>
    );
  }

  const matches =
    seller.city === requirement.city &&
    seller.categories.includes(
      requirement.category.charAt(0).toUpperCase() +
        requirement.category.slice(1)
    );

const offers =
  JSON.parse(localStorage.getItem("offers")) || [];

const offers =
  JSON.parse(localStorage.getItem("offers")) || [];

const myOffer = offers.find(
  (o) =>
    o.requirementId === requirement.id &&
    o.sellerId === seller.mobile
);


const existingOffer = offers.find(
  (o) =>
    o.requirementId === requirement.id &&
    o.sellerId === seller.mobile
);



  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <h1 className="text-3xl font-bold text-white mb-6">
          Seller Dashboard
        </h1>
<div
  className={`border rounded-xl p-4 ${
    myOffer?.viewedByBuyer
      ? "border-blue-400 bg-blue-50"
      : ""
  }`}
>
        {!matches ? (
          <div className="bg-white/90 rounded-2xl p-6 text-center">
            <p className="text-gray-600">
              No matching buyer requirements found
            </p>
          </div>
        ) : (
          <div className="bg-white/90 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">
              Matching Buyer Requirement
            </h2>

            <p>
              <strong>Product:</strong>{" "}
              {requirement.product}
            </p>
            <p>
              <strong>City:</strong>{" "}
              {requirement.city}
            </p>

            <button
  onClick={() => setShowOffer(true)}
  className={`mt-4 px-4 py-2 rounded-xl transition font-semibold ${
    existingOffer
      ? "bg-green-600 hover:bg-green-700 text-white"
      : "bg-indigo-600 hover:bg-indigo-700 text-white"
  }`}
>
  {existingOffer ? "✏️ Offer Submitted / Edit Offer" : "💰 Submit Offer"}
</button>

{myOffer && (
  <div className="mt-3">
    {myOffer.viewedByBuyer ? (
      <span className="inline-block text-sm px-3 py-1 rounded-full bg-blue-100 text-blue-700">
        👀 Buyer viewed your offer
      </span>
    ) : (
      <span className="inline-block text-sm px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
        ⏳ Awaiting buyer
      </span>
    )}
  </div>
)}

          </div>
        )}
      </div>

      {/* ✅ MODAL MUST BE INSIDE RETURN */}
      {showOffer && (
        <OfferModal
          open={showOffer}
          onClose={() => setShowOffer(false)}
          requirement={requirement}
        />
      )}
    </div>
  );
}
