const mongoose = require("mongoose");

const whatsAppDeliveryLogSchema = new mongoose.Schema(
  {
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null
    },
    campaignRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppCampaignRun",
      default: null
    },
    triggerType: {
      type: String,
      enum: ["buyer_post", "manual_resend", "manual_test", "manual_queue", "template_send"],
      default: "buyer_post"
    },
    channel: {
      type: String,
      enum: ["whatsapp", "email"],
      default: "whatsapp"
    },
    mobileE164: {
      type: String,
      default: ""
    },
    email: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: [
        "accepted",
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "skipped",
        "opened_manual_link",
        "dry_run"
      ],
      default: "accepted"
    },
    reason: {
      type: String,
      default: ""
    },
    provider: {
      type: String,
      default: ""
    },
    providerMessageId: {
      type: String,
      default: ""
    },
    city: {
      type: String,
      default: ""
    },
    category: {
      type: String,
      default: ""
    },
    product: {
      type: String,
      default: ""
    },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  { timestamps: true }
);

whatsAppDeliveryLogSchema.index({ createdAt: -1 });
whatsAppDeliveryLogSchema.index({ campaignRunId: 1, mobileE164: 1 });
whatsAppDeliveryLogSchema.index({ requirementId: 1, triggerType: 1, createdAt: -1 });

module.exports = mongoose.model("WhatsAppDeliveryLog", whatsAppDeliveryLogSchema);
