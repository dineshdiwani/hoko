const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true
    },

    passwordHash: {
      type: String
    },

    googleProfile: {
      sub: { type: String },
      name: { type: String },
      picture: { type: String }
    },

    name: {
      type: String,
      default: ""
    },

    mobile: {
      type: String,
      default: ""
    },

    city: {
      type: String,
      required: true
    },

    preferredCurrency: {
      type: String,
      default: "INR"
    },

    roles: {
      buyer: { type: Boolean, default: true },
      seller: { type: Boolean, default: false },
      admin: { type: Boolean, default: false }
    },

    sellerProfile: {
      firmName: { type: String },
      managerName: { type: String },
      categories: [{ type: String }],
      approved: { type: Boolean, default: false },
      businessName: { type: String },
      registrationDetails: { type: String },
      businessAddress: { type: String },
      ownerName: { type: String },
      website: { type: String },
      taxId: { type: String }
    },

    termsAccepted: {
      at: { type: Date }
    },

    blocked: {
      type: Boolean,
      default: false
    },

    tokenVersion: {
      type: Number,
      default: 0
    },

    chatDisabled: {
      type: Boolean,
      default: false
    },
    chatDisabledReason: {
      type: String,
      default: ""
    },

    buyerSettings: {
      defaultCity: { type: String, default: "" },
      defaultCategory: { type: String, default: "" },
      defaultUnit: { type: String, default: "" },
      hideProfileUntilApproved: { type: Boolean, default: true },
      hideEmail: { type: Boolean, default: false },
      hidePhone: { type: Boolean, default: false },
      chatOnlyAfterOfferAcceptance: { type: Boolean, default: true },
      postAutoExpiryDays: { type: Number, default: 30 },
      documentAutoDeleteDays: { type: Number, default: 30 },
      notificationToggles: {
        pushEnabled: { type: Boolean, default: true },
        newOffer: { type: Boolean, default: true },
        chat: { type: Boolean, default: true },
        statusUpdate: { type: Boolean, default: true },
        reminder: { type: Boolean, default: true }
      },
      documents: [
        {
          filename: { type: String, default: "" },
          originalName: { type: String, default: "" },
          url: { type: String, default: "" },
          size: { type: Number, default: 0 },
          mimetype: { type: String, default: "" },
          requirementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Requirement",
            default: null
          },
          visibleToSellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
          },
          autoDeleteDays: { type: Number, default: 30 },
          createdAt: { type: Date, default: Date.now }
        }
      ]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
