const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    cities: [{ type: String }],
    categories: [{ type: String }],
    units: [{ type: String }],
    currencies: [{ type: String }],
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
