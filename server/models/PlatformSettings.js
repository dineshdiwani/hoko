const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    cities: [{ type: String }],
    categories: [{ type: String }],
    units: [{ type: String }],
    currencies: [{ type: String }],
    defaults: {
      city: { type: String, default: "user_default" },
      category: { type: String, default: "" },
      unit: { type: String, default: "" },
      currency: { type: String, default: "" },
      loginCity: { type: String, default: "" },
      sellerRegisterCity: { type: String, default: "" },
      sellerRegisterCategory: { type: String, default: "" },
      sellerDashboardCity: { type: String, default: "all" },
      sellerDashboardCategory: { type: String, default: "all" },
      buyerDashboardCity: { type: String, default: "" },
      buyerDashboardCategory: { type: String, default: "all" }
    },
    notifications: {
      enabled: { type: Boolean, default: true },
      cities: [{ type: String }],
      categories: [{ type: String }]
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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PlatformSettings",
  platformSettingsSchema
);
