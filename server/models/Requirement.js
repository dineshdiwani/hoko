const mongoose = require("mongoose");

const requirementSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    city: {
      type: String,
      required: true
    },

    category: {
      type: String,
      required: true
    },

    productName: {
      type: String,
      required: true
    },

    // Client compatibility
    product: {
      type: String
    },

    brand: {
      type: String
    },
    makeBrand: {
      type: String
    },
    typeModel: {
      type: String
    },

    quantity: {
      type: String
    },

    type: {
      type: String
    },

    details: {
      type: String
    },

    offerInvitedFrom: {
      type: String,
      enum: ["city", "anywhere"],
      default: "city"
    },

    attachments: [
      {
        type: String
      }
    ],

    image: {
      type: String
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
    },

    chatDisabled: { type: Boolean, default: false },
    chatDisabledReason: { type: String, default: "" },

    reverseAuction: {
      active: {
        type: Boolean,
        default: false
      },
      lowestPrice: {
        type: Number,
        default: null
      },
      targetPrice: {
        type: Number,
        default: null
      },
      startedAt: {
        type: Date,
        default: null
      },
      updatedAt: {
        type: Date,
        default: null
      },
      closedAt: {
        type: Date,
        default: null
      }
    },

    // Compatibility fields used by client fallbacks
    reverseAuctionActive: {
      type: Boolean,
      default: false
    },
    currentLowestPrice: {
      type: Number,
      default: null
    }
  },
  { timestamps: true }
);

requirementSchema.pre("validate", function (next) {
  if (this.category) {
    this.category = String(this.category).toLowerCase().trim();
  }
  if (this.offerInvitedFrom) {
    const normalized = String(this.offerInvitedFrom).toLowerCase().trim();
    this.offerInvitedFrom = normalized === "anywhere" ? "anywhere" : "city";
  } else {
    this.offerInvitedFrom = "city";
  }
  if (!this.productName && this.product) {
    this.productName = this.product;
  }
  if (!this.product && this.productName) {
    this.product = this.productName;
  }
  next();
});

module.exports = mongoose.model("Requirement", requirementSchema);
