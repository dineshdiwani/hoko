const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      sparse: true
    },
    cities: [{ type: String }],
    dummyRequirementSettings: {
      running: { type: Boolean, default: true },
      intervalHours: { type: Number, default: 12 },
      quantity: { type: Number, default: 3 },
      maxQuantity: { type: Number, default: 10 }
    },
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
    sampleCityPostsEnabled: {
      type: Boolean,
      default: true
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
    },
    adminNotifications: {
      enabled: { type: Boolean, default: true },
      mobileNumbers: [{ type: String }],
      instantEnabled: { type: Boolean, default: true },
      batchEnabled: { type: Boolean, default: true },
      batchIntervalMinutes: { type: Number, default: 60 },
      minOfferValue: { type: Number, default: 10000 },
      events: {
        newBuyer: { type: Boolean, default: true },
        newSeller: { type: Boolean, default: true },
        newRequirement: { type: Boolean, default: true },
        newOffer: { type: Boolean, default: true },
        highValueOffer: { type: Boolean, default: true },
        reverseAuction: { type: Boolean, default: true },
        whatsappInteraction: { type: Boolean, default: true },
        userReport: { type: Boolean, default: true },
        sellerApproved: { type: Boolean, default: false },
        moderationAlert: { type: Boolean, default: true }
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PlatformSettings",
  platformSettingsSchema
);
