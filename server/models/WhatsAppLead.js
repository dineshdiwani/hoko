const mongoose = require("mongoose");

const whatsAppLeadSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true,
      index: true
    },
    provider: {
      type: String,
      default: "unknown"
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null
    },
    latestCampaignRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppCampaignRun",
      default: null
    },
    profile: {
      firmName: { type: String, default: "" },
      managerName: { type: String, default: "" },
      city: { type: String, default: "" },
      category: { type: String, default: "" },
      email: { type: String, default: "" }
    },
    lastInboundText: {
      type: String,
      default: ""
    },
    lastInboundAt: {
      type: Date,
      default: null
    },
    lastProviderMessageId: {
      type: String,
      default: ""
    },
    lastIntent: {
      type: {
        kind: { type: String, default: "unknown" },
        keyword: { type: String, default: "" },
        normalizedText: { type: String, default: "" },
        detectedPrice: { type: Number, default: null },
        detectedDeliveryDays: { type: Number, default: null }
      },
      default: () => ({})
    },
    onboardingStatus: {
      type: String,
      default: "new"
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhatsAppLead", whatsAppLeadSchema);
