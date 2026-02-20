const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    cities: [{ type: String }],
    categories: [{ type: String }],
    units: [{ type: String }],
    currencies: [{ type: String }],
    defaults: {
      city: { type: String, default: "user_default" },
      category: { type: String, default: "user_default" }
    },
    notifications: {
      enabled: { type: Boolean, default: true },
      cities: [{ type: String }],
      categories: [{ type: String }]
    },
    emailNotifications: {
      enabled: { type: Boolean, default: false },
      adminCopy: { type: Boolean, default: true },
      events: {
        newOfferToBuyer: { type: Boolean, default: true },
        requirementUpdatedToSellers: { type: Boolean, default: true },
        reverseAuctionToSellers: { type: Boolean, default: true }
      }
    },
    whatsAppCampaign: {
      enabled: { type: Boolean, default: false },
      cities: [{ type: String }],
      categories: [{ type: String }]
    },
    moderationRules: {
      enabled: { type: Boolean, default: true },
      keywords: [{ type: String }],
      blockPhone: { type: Boolean, default: true },
      blockLinks: { type: Boolean, default: true }
    },
    termsAndConditions: {
      content: { type: String, default: "" }
    },
    privacyPolicy: {
      content: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PlatformSettings",
  platformSettingsSchema
);
