const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      required: true
    },

    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    price: {
      type: Number,
      required: true
    },

    message: {
      type: String
    },
    deliveryTime: {
      type: String,
      default: ""
    },
    paymentTerms: {
      type: String,
      default: ""
    },

    viewedByBuyer: {
      type: Boolean,
      default: false
    },
    contactEnabledByBuyer: {
      type: Boolean,
      default: false
    },

    declinedAuction: {
      type: Boolean,
      default: false
    },

    respondedToAuction: {
      type: Boolean,
      default: false
    },

    moderation: {
      removed: { type: Boolean, default: false },
      removedAt: { type: Date, default: null },
      removedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
      },
      reason: { type: String, default: "" },
      flagged: { type: Boolean, default: false },
      flaggedAt: { type: Date, default: null },
      flaggedReason: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Offer", offerSchema);
