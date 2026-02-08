import { useState, useEffect } from "react";

function markDeclined() {
  const offers =
    JSON.parse(localStorage.getItem("offers")) || [];

  const index = offers.findIndex(
    (o) =>
      o.requirementId === requirement.id &&
      o.sellerId === seller.mobile
  );

  if (index >= 0) {
    offers[index].declinedAuction = true;
    offers[index].respondedToAuction = true;
    localStorage.setItem(
      "offers",
      JSON.stringify(offers)
    );
  }
}

export default function OfferModal({ open, onClose, requirement }) {
  const seller = JSON.parse(
    localStorage.getItem("seller_profile")
  );

  // 🛑 SAFETY GUARD (prevents blank page)
  if (!open || !requirement || !seller) return null;

  const requirementKey = `${requirement.product}_${requirement.city}`;

  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
const isAuction =
  requirement.reverseAuctionActive;


  // 🔄 Load existing offer (edit mode)
  useEffect(() => {
    const offers =
      JSON.parse(localStorage.getItem("offers")) || [];

    const existing = offers.find(
      (o) =>
        o.requirementKey === requirementKey &&
        o.sellerId === seller.mobile
    );

    if (existing) {
      setPrice(existing.price);
      setNote(existing.note || "");
      setFile(existing.file || null);
    } else {
      setPrice("");
      setNote("");
      setFile(null);
<input
  type="number"
  min={isAuction ? requirement.currentLowestPrice - 1 : 0}
  placeholder={
    isAuction
      ? `Enter price below ₹${requirement.currentLowestPrice}`
      : "Offer price"
  }
/>


    }
  }, [open, requirementKey, seller.mobile]);

  const submitOffer = () => {
    if (!price) {
      alert("Please enter price");
      return;
if (
  requirement.reverseAuctionActive &&
  Number(price) >=
    requirement.currentLowestPrice
) {
  alert(
    "Price must be lower than current lowest price"
  );
  return;
}

    }

    const offers =
      JSON.parse(localStorage.getItem("offers")) || [];

    const index = offers.findIndex(
      (o) =>
        o.requirementKey === requirementKey &&
        o.sellerId === seller.mobile
    );

    const offerData = {
      requirementKey,
      product: requirement.product,
      category: requirement.category,
      price,
      note,
      file,
      sellerFirm: seller.firmName,
      sellerCity: seller.city,
      sellerMobile: seller.mobile,
      sellerId: seller.mobile,
      updatedAt: Date.now(),
    };

    if (index >= 0) {
      offers[index] = offerData; // ✏️ edit
    } else {
      offers.push(offerData); // 💰 new
    }

    localStorage.setItem("offers", JSON.stringify(offers));

    // 🔔 Notify buyer
    const buyerNotifications =
      JSON.parse(
        localStorage.getItem("buyer_notifications")
      ) || [];

    buyerNotifications.push({
      message: `Seller ${seller.firmName} ${
        index >= 0 ? "updated" : "submitted"
      } an offer for ${requirement.product}`,
      timestamp: Date.now(),
      read: false,
    });

    localStorage.setItem(
      "buyer_notifications",
      JSON.stringify(buyerNotifications)
    );

    alert(
      index >= 0
        ? "Offer updated successfully"
        : "Offer submitted successfully"
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4">
          {price ? "Edit Offer" : "Submit Offer"}
        </h2>

        <p className="text-sm text-gray-600 mb-3">
          For <strong>{requirement.product}</strong>
        </p>

        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 mb-3"
          placeholder="Offer price"
        />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border rounded-xl px-4 py-2 mb-3"
          placeholder="Optional note"
        />

        <input
          type="file"
          onChange={(e) => {
            const fileObj = e.target.files[0];
            if (!fileObj) return;

            const reader = new FileReader();
            reader.onload = () =>
              setFile({
                name: fileObj.name,
                data: reader.result,
              });
            reader.readAsDataURL(fileObj);
          }}
          className="mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border rounded-xl py-2"
          >
            Cancel
          </button>
          <button
            onClick={submitOffer}
            className="flex-1 bg-indigo-600 text-white rounded-xl py-2"
          >
            {price ? "Update Offer" : "Submit Offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

{isAuction && (
  <button
    onClick={() => {
      markDeclined();
      onClose();
    }}
    className="flex-1 border rounded-xl py-2 text-gray-600"
  >
    ❌ Cannot beat price
  </button>
)}

