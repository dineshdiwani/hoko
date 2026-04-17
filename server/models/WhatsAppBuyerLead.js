const mongoose = require("mongoose");

const whatsAppBuyerLeadSchema = new mongoose.Schema(
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
    product: {
      type: String,
      default: ""
    },
    city: {
      type: String,
      default: ""
    },
    quantity: {
      type: String,
      default: ""
    },
    unit: {
      type: String,
      default: ""
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null
    },
    tempRequirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TempRequirement",
      default: null
    },
    deepLinkClicked: {
      type: Boolean,
      default: false
    },
    deepLinkClickedAt: {
      type: Date,
      default: null
    },
    reminderSent: {
      type: Boolean,
      default: false
    },
    reminderSentAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ["pending", "converted", "expired"],
      default: "pending"
    },
    conversionSource: {
      type: String,
      default: ""
    },
    source: {
      type: String,
      default: "whatsapp_welcome"
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

whatsAppBuyerLeadSchema.index({ mobileE164: 1, createdAt: -1 });
whatsAppBuyerLeadSchema.index({ status: 1, deepLinkClicked: 1 });

module.exports = mongoose.model("WhatsAppBuyerLead", whatsAppBuyerLeadSchema);
