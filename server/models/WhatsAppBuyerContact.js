const mongoose = require("mongoose");

const whatsAppBuyerContactSchema = new mongoose.Schema(
  {
    mobileE164: {
      type: String,
      required: true
    },
    active: {
      type: Boolean,
      default: true
    },
    optInStatus: {
      type: String,
      enum: ["opted_in", "not_opted_in"],
      default: "not_opted_in"
    },
    optInSource: {
      type: String,
      default: "admin_excel_upload"
    },
    optInAt: {
      type: Date,
      default: Date.now
    },
    pendingOptInAt: {
      type: Date,
      default: null
    },
    consentEvidence: {
      type: String,
      default: ""
    },
    unsubscribedAt: {
      type: Date,
      default: null
    },
    unsubscribeReason: {
      type: String,
      default: ""
    },
    dndStatus: {
      type: String,
      enum: ["allow", "dnd"],
      default: "allow"
    },
    dndSource: {
      type: String,
      default: ""
    },
    source: {
      type: String,
      default: "buyer_excel"
    },
    tags: [{ type: String }]
  },
  { timestamps: true }
);

whatsAppBuyerContactSchema.index({ mobileE164: 1 }, { unique: true });

module.exports = mongoose.model("WhatsAppBuyerContact", whatsAppBuyerContactSchema);
