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
      type: Number,
      default: null
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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PendingOfferDraft", pendingOfferDraftSchema);
