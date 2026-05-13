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
      default: ""
    },

    address: {
      type: String,
      default: ""
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
      registeredBusinessName: { type: String },
      managerName: { type: String },
      registrationDetails: { type: String },
      businessAddress: { type: String },
      ownerName: { type: String },
      website: { type: String },
      taxId: { type: String },
      categories: [{ type: String, default: "" }]
    },

termsAccepted: {
      at: { type: Date },
      termsVersion: { type: String, default: "" },
      privacyVersion: { type: String, default: "" }
    },

    blocked: {
      type: Boolean,
      default: false
    },

    deletedAt: {
      type: Date,
      default: null
    },
    deletedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    deletedReason: {
      type: String,
      default: ""
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
      emailNotificationToggles: {
        enabled: { type: Boolean, default: true },
        newOffer: { type: Boolean, default: true }
      },
      smsNotificationToggles: {
        enabled: { type: Boolean, default: true },
        newOffer: { type: Boolean, default: true }
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
    },

    sellerSettings: {
      notificationsLeads: { type: Boolean, default: true },
      notificationsAuction: { type: Boolean, default: true },
      notificationsOffers: { type: Boolean, default: true },
      whatsappConsent: { type: Boolean, default: false },
      whatsappConsentAt: { type: Date },
      emailNotificationToggles: {
        enabled: { type: Boolean, default: true },
        requirementUpdated: { type: Boolean, default: true },
        reverseAuction: { type: Boolean, default: true }
      },
      smsNotificationToggles: {
        enabled: { type: Boolean, default: true },
        requirementMatch: { type: Boolean, default: true },
        reverseAuction: { type: Boolean, default: true }
      }
    }
  },
{ timestamps: true }
);

userSchema.index({ mobile: 1 });
userSchema.index({ email: 1 });
userSchema.index({ "roles.seller": 1 });
userSchema.index({ "sellerProfile.approved": 1 });
userSchema.index({ "sellerProfile.categories": 1 });

module.exports = mongoose.model("User", userSchema);
