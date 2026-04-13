const mongoose = require("mongoose");

const pendingOfferDraftSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true,
      index: true
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null,
      index: true
    },
    source: {
      provider: { type: String, default: "unknown" },
      providerMessageId: { type: String, default: "" }
    },
    price: {
      type: Number,
      default: null
    },
    deliveryDays: {
      type: String,
      default: ""
    },
    note: {
      type: String,
      default: ""
    },
    rawMessage: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      default: "pending"
    },
    sellerName: {
      type: String,
      default: ""
    },
    sellerEmail: {
      type: String,
      default: ""
    },
    sellerFirmName: {
      type: String,
      default: ""
    },
    sellerCity: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PendingOfferDraft", pendingOfferDraftSchema);
